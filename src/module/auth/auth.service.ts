import bcrypt from "bcryptjs";
import crypto from "crypto";
import ejs from "ejs";
import httpStatus from "http-status";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import path from "path";
import { AuthProvider, UserRole } from "../../../generated/prisma/enums.js";
import config from "../../config/index.js";
import { transporter } from "../../lib/nodemailer.js";
import { prisma } from "../../lib/prisma.js";
import { redisClient } from "../../lib/redis.js";
import { AppError } from "../../utils/AppError.js";
import { jwtUtils } from "../../utils/jwt.js";
import type {
	IChangePasswordPayload,
	IForgotPasswordPayload,
	ILoginUser,
	IRegisterPayload,
	IResetPasswordPayload,
	IVerifyEmailPayload,
} from "./auth.interface.js";

// ─── Redis key helpers ────────────────────────────────────────────────────────
// Each user gets a Redis set that holds all of their active refresh tokens.
// TTL matches the refresh token lifetime (7 days).
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

const refreshTokenSetKey = (userId: string) => `refresh-tokens:${userId}`;

/**
 * Persist a refresh token in the user's Redis token set.
 * Uses SADD + EXPIRE so the whole set is cleaned up automatically after
 * the maximum token lifetime even if the user never logs out.
 */
const storeRefreshToken = async (
	userId: string,
	token: string,
): Promise<void> => {
	const key = refreshTokenSetKey(userId);
	await redisClient.sAdd(key, token);
	// Reset TTL on every add so the key stays alive as long as any session exists.
	await redisClient.expire(key, REFRESH_TOKEN_TTL_SECONDS);
};

/**
 * Remove a single refresh token from the user's Redis token set (single logout).
 */
const removeRefreshToken = async (
	userId: string,
	token: string,
): Promise<void> => {
	const key = refreshTokenSetKey(userId);
	await redisClient.sRem(key, token);
};

/**
 * Remove ALL refresh tokens for a user (logout everywhere).
 */
const removeAllRefreshTokens = async (userId: string): Promise<void> => {
	const key = refreshTokenSetKey(userId);
	await redisClient.del(key);
};

/**
 * Check whether a given refresh token is still valid (not revoked).
 */
const isRefreshTokenValid = async (
	userId: string,
	token: string,
): Promise<boolean> => {
	const key = refreshTokenSetKey(userId);
	const result = await redisClient.sIsMember(key, token);
	return result === 1;
};

// ─── Auth service functions ───────────────────────────────────────────────────

const registerUserIntoDB = async (payload: IRegisterPayload) => {
	const { name, email, password, role, phone } = payload;

	const isUserExist = await prisma.user.findUnique({
		where: { email },
	});

	if (isUserExist) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"User already exists with this email",
		);
	}

	const hashedPassword = await bcrypt.hash(
		password,
		Number(config.bcrypt_salt_rounds),
	);

	const expirationSeconds = 5 * 60;

	const otpKey = `patient-registration-otp:${email}`;
	const otpValue = crypto.randomInt(100000, 1000000).toString();

	await redisClient.set(otpKey, otpValue, {
		expiration: {
			type: "EX",
			value: expirationSeconds,
		},
	});

	const patientRegistrationKey = `patient-registration-data:${email}`;
	const redisUserDataPayload = {
		name,
		email,
		password: hashedPassword,
		role,
		phone: phone ?? null,
		authProvider: AuthProvider.CREDENTIAL,
	};

	await redisClient.set(
		patientRegistrationKey,
		JSON.stringify(redisUserDataPayload),
		{
			expiration: {
				type: "EX",
				value: expirationSeconds,
			},
		},
	);

	const tempatePath = path.join(
		process.cwd(),
		"src/templates/registration-user-otp.ejs",
	);

	const templateData = {
		name,
		email,
		otp: otpValue,
		expirationMinutes: expirationSeconds / 60,
	};

	const html = await ejs.renderFile(tempatePath, templateData);

	await transporter.sendMail({
		from: config.email_sender,
		to: email,
		subject: "Email Verification",
		html,
	});
};

const verifyUserEmail = async (payload: IVerifyEmailPayload) => {
	const otp = payload.otp;
	const email = payload.email.trim().toLowerCase();

	const otpKey = `patient-registration-otp:${email}`;
	const redisOtp = await redisClient.get(otpKey);

	if (!redisOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
	}

	if (redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP Does Not Match");
	}

	await redisClient.del(otpKey);

	const userRegistrationKey = `patient-registration-data:${email}`;
	const redisUserData = await redisClient.get(userRegistrationKey);

	if (!redisUserData) {
		throw new AppError(httpStatus.NOT_FOUND, "Patient Doesnt Exist");
	}

	const userPayload: IRegisterPayload = JSON.parse(redisUserData);

	const createdUser = await prisma.user.create({
		data: {
			name: userPayload.name,
			email: userPayload.email,
			password: userPayload.password,
			role: UserRole.PATIENT,
			phone: userPayload.phone,
			isVerified: true,
			authProvider: AuthProvider.CREDENTIAL,
		},
		omit: { password: true },
	});

	await redisClient.del(userRegistrationKey);

	const tempatePath = path.join(
		process.cwd(),
		"src/templates/user-welcome-email.ejs",
	);

	const templateData = {
		name: createdUser.name,
	};

	const html = await ejs.renderFile(tempatePath, templateData);

	await transporter.sendMail({
		from: config.email_sender,
		to: email,
		subject: "Welcome To LifeDispatch",
		html,
	});

	const { ...user } = createdUser;
	const jwtPayload = {
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	// Feature 5: track newly issued refresh token in Redis
	await storeRefreshToken(user.id, refreshToken);

	return {
		user,
		accessToken,
		refreshToken,
	};
};

const loginUser = async (user: ILoginUser) => {
	if (!user) {
		throw new AppError(httpStatus.UNAUTHORIZED, "Invalid email or password");
	}

	// Feature 6: block SUSPENDED and DELETED users at login
	if (user.status === "SUSPENDED") {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Your account is suspended. Please contact support.",
		);
	}

	if (user.status === "DELETED") {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"This account has been deleted. Please contact support if this is a mistake.",
		);
	}

	const jwtPayload = {
		id: user.userId,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	// Feature 5: track the newly issued refresh token in Redis
	await storeRefreshToken(user.userId, refreshToken);

	return { accessToken, refreshToken };
};

const refreshToken = async (token: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		token,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success) {
		throw new AppError(httpStatus.UNAUTHORIZED, verifiedRefreshToken.error);
	}

	const { id } = verifiedRefreshToken.data as JwtPayload;

	// Feature 5: check if the token has been revoked (logged out)
	const isValid = await isRefreshTokenValid(id, token);
	if (!isValid) {
		throw new AppError(
			httpStatus.UNAUTHORIZED,
			"Your session has been revoked. Please log in again.",
		);
	}

	const user = await prisma.user.findFirstOrThrow({
		where: {
			id,
		},
	});

	// Feature 6: block suspended/deleted users mid-session
	if (user.status === "SUSPENDED") {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Your account is suspended. Please contact support.",
		);
	}

	if (user.status === "DELETED" || user.isDeleted) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"This account has been deleted. Please contact support if this is a mistake.",
		);
	}

	const jwtPayload = {
		id: user.id,
		name: user.name,
		email: user.email,
		role: user.role,
	};

	const accessToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_access_secret,
		config.jwt_access_expires_in as SignOptions,
	);

	// Feature 5: rotate — remove old token, store new refresh token
	const newRefreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	await removeRefreshToken(id, token);
	await storeRefreshToken(id, newRefreshToken);

	return { accessToken, refreshToken: newRefreshToken };
};

const forgotPassword = async (payload: IForgotPasswordPayload) => {
	const { email } = payload;
	const isUserExist = await prisma.user.findUnique({
		where: {
			email,
		},
	});

	if (!isUserExist) {
		throw new AppError(httpStatus.NOT_FOUND, "User Does Not Exist!");
	}

	if (isUserExist.status === "SUSPENDED") {
		throw new AppError(httpStatus.FORBIDDEN, "User is Suspended");
	}

	if (!isUserExist.isVerified) {
		throw new AppError(httpStatus.FORBIDDEN, "User Not Verified");
	}

	if (isUserExist.isDeleted || isUserExist.status === "DELETED") {
		throw new AppError(httpStatus.FORBIDDEN, "User is Deleted");
	}

	if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
		throw new AppError(httpStatus.BAD_REQUEST, "User Has Account With Google");
	}

	const otpKey = `forgot-password-otp:${isUserExist.email}`;
	const otp = crypto.randomInt(100000, 1000000).toString();

	const expirationSeconds = 5 * 60;

	await redisClient.set(otpKey, otp, {
		expiration: {
			type: "EX",
			value: expirationSeconds,
		},
	});

	const tempatePath = path.join(
		process.cwd(),
		"src/templates/forgot-password.ejs",
	);

	const templateData = {
		name: isUserExist.name,
		otp,
		expirationMinutes: expirationSeconds / 60,
	};

	const html = await ejs.renderFile(tempatePath, templateData);

	await transporter.sendMail({
		from: config.email_sender,
		to: isUserExist.email ?? "",
		subject: "Forgot Password",
		html,
	});
};

const resetPassword = async (payload: IResetPasswordPayload) => {
	const { email, otp, newPassword } = payload;

	const isUserExist = await prisma.user.findUnique({
		where: {
			email,
		},
	});

	if (!isUserExist) {
		throw new AppError(httpStatus.NOT_FOUND, "User Does Not Exist!");
	}

	if (isUserExist.status === "SUSPENDED") {
		throw new AppError(httpStatus.FORBIDDEN, "User is Suspended");
	}

	if (!isUserExist.isVerified) {
		throw new AppError(httpStatus.FORBIDDEN, "User Not Verified");
	}

	if (isUserExist.isDeleted || isUserExist.status === "DELETED") {
		throw new AppError(httpStatus.FORBIDDEN, "User is Deleted");
	}

	if (isUserExist.googleId && isUserExist.authProvider === "GOOGLE") {
		throw new AppError(httpStatus.BAD_REQUEST, "User Has Account With Google");
	}

	const otpKey = `forgot-password-otp:${isUserExist.email}`;

	const redisOtp = await redisClient.get(otpKey);

	if (!redisOtp) {
		throw new AppError(httpStatus.BAD_REQUEST, "Invalid OTP");
	}

	if (redisOtp !== otp) {
		throw new AppError(httpStatus.BAD_REQUEST, "OTP Does Not Match");
	}

	const hashedNewPassword = await bcrypt.hash(
		newPassword,
		Number(config.bcrypt_salt_rounds),
	);

	await prisma.user.update({
		where: {
			email: isUserExist.email as string,
		},
		data: {
			password: hashedNewPassword,
		},
	});

	await redisClient.del([otpKey]);

	// Feature 5: revoke all sessions after password reset (security best practice)
	await removeAllRefreshTokens(isUserExist.id);

	const tempatePath = path.join(
		process.cwd(),
		"src/templates/reset-password-success.ejs",
	);

	const templateData = {
		name: isUserExist.name,
	};

	const html = await ejs.renderFile(tempatePath, templateData);

	await transporter.sendMail({
		from: config.email_sender,
		to: isUserExist.email ?? "",
		subject: "Password Changed",
		html,
	});
};

const changeTempPassword = async (
	userId: string,
	payload: IChangePasswordPayload,
) => {
	const user = await prisma.user.findUnique({
		where: { id: userId },
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found.");
	}

	if (user.status === "SUSPENDED") {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Your account is suspended. Please contact support.",
		);
	}

	if (user.isDeleted || user.status === "DELETED") {
		throw new AppError(httpStatus.FORBIDDEN, "Account not found.");
	}

	if (!user.mustChangePassword) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Your account does not require a password change via this endpoint. Use forgot-password if needed.",
		);
	}

	const hashedNewPassword = await bcrypt.hash(
		payload.newPassword,
		Number(config.bcrypt_salt_rounds),
	);

	await prisma.user.update({
		where: { id: userId },
		data: {
			password: hashedNewPassword,
			mustChangePassword: false,
			isVerified: true,
		},
	});

	// Feature 5: revoke all previous sessions (temp-password accounts start fresh)
	await removeAllRefreshTokens(userId);

	const templatePath = path.join(
		process.cwd(),
		"src/templates/reset-password-success.ejs",
	);

	const html = await ejs.renderFile(templatePath, { name: user.name });

	await transporter.sendMail({
		from: config.email_sender,
		to: user.email ?? "",
		subject: "Password Updated — LifeDispatch",
		html,
	});
};

const getMe = async (userId: string) => {
	const user = await prisma.user.findUnique({
		where: { id: userId, isDeleted: false },
		omit: { password: true },
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found.");
	}

	return user;
};

const logoutUser = async (userId: string, token: string): Promise<void> => {
	await removeRefreshToken(userId, token);
};

const logoutAll = async (userId: string): Promise<void> => {
	await removeAllRefreshTokens(userId);
};

export const authService = {
	registerUserIntoDB,
	loginUser,
	refreshToken,
	verifyUserEmail,
	forgotPassword,
	resetPassword,
	changeTempPassword,
	logoutUser,
	logoutAll,
	getMe,
};
