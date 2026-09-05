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
	IForgotPasswordPayload,
	ILoginUser,
	IRegisterPayload,
	IResetPasswordPayload,
	IVerifyEmailPayload,
} from "./auth.interface.js";

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

	const userRegistrationKey = `user-registration-data:${email}`;
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

	if (user.status === "SUSPENDED") {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Your account is suspended. Please contact support.",
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

	const refreshToken = jwtUtils.createToken(
		jwtPayload,
		config.jwt_refresh_secret,
		config.jwt_refresh_expires_in as SignOptions,
	);

	return { accessToken, refreshToken };
};

const refreshToken = async (refreshToken: string) => {
	const verifiedRefreshToken = jwtUtils.verifyToken(
		refreshToken,
		config.jwt_refresh_secret,
	);

	if (!verifiedRefreshToken.success) {
		throw new AppError(httpStatus.UNAUTHORIZED, verifiedRefreshToken.error);
	}

	const { id } = verifiedRefreshToken.data as JwtPayload;
	const user = await prisma.user.findFirstOrThrow({
		where: {
			id,
		},
	});

	if (user.status === "SUSPENDED") {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"Your account is suspended. Please contact support.",
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

	return { accessToken };
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

	const otpKey = `forgor-password-otp:${isUserExist.email}`;
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

	const otpKey = `forgor-password-otp:${isUserExist.email}`;

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

export const authService = {
	registerUserIntoDB,
	loginUser,
	refreshToken,
	verifyUserEmail,
	forgotPassword,
	resetPassword,
};
