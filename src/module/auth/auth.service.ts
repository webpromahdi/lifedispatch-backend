import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import { AuthProvider } from "../../../generated/prisma/enums.js";
import config from "../../config/index.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { jwtUtils } from "../../utils/jwt.js";
import type { TLoginUser, TRegisterPayload } from "./auth.interface.js";

const registerUserIntoDB = async (payload: TRegisterPayload) => {
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

	const createUser = await prisma.user.create({
		data: {
			name,
			email,
			password: hashedPassword,
			role,
			phone: phone ?? null,
			authProvider: AuthProvider.CREDENTIAL,
		},
	});

	const user = await prisma.user.findUnique({
		where: { id: createUser.id },
		omit: { password: true },
	});

	return user;
};

const loginUser = async (user: TLoginUser) => {
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
};
