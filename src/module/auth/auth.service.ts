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
	ILoginUser,
	IRegisterPayload,
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

const verifyPatientEmail = async (payload: IVerifyEmailPayload) => {
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

	const patientRegistrationKey = `patient-registration-data:${email}`;
	const redisPatientData = await redisClient.get(patientRegistrationKey);

	if (!redisPatientData) {
		throw new AppError(httpStatus.NOT_FOUND, "Patient Doesnt Exist");
	}

	const patientPayload: IRegisterPayload = JSON.parse(redisPatientData);

	const createdUser = await prisma.user.create({
		data: {
			name: patientPayload.name,
			email: patientPayload.email,
			password: patientPayload.password,
			role: UserRole.PATIENT,
			phone: patientPayload.phone,
			isVerified: true,
			authProvider: AuthProvider.CREDENTIAL,
		},
		omit: { password: true },
	});

	await redisClient.del(patientRegistrationKey);

	const tempatePath = path.join(
		process.cwd(),
		"src/templates/patient-welcome-email.ejs",
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

export const authService = {
	registerUserIntoDB,
	loginUser,
	refreshToken,
	verifyPatientEmail,
};
