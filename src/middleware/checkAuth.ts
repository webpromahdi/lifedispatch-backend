import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import type { JwtPayload } from "jsonwebtoken";
import type { UserRole } from "../../generated/prisma/enums.js";
import config from "../config/index.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { catchAsync } from "../utils/catchAsync.js";
import { jwtUtils } from "../utils/jwt.js";

export interface RequestUser {
	email: string;
	name: string;
	userId: string;
	role: UserRole;
}

declare global {
	namespace Express {
		interface User extends RequestUser {}
	}
}

export const auth = (...requiredRoles: UserRole[]) => {
	return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
		const token = req.cookies.accessToken
			? req.cookies.accessToken
			: req.headers.authorization?.startsWith("Bearer ")
				? req.headers.authorization?.split(" ")[1]
				: req.headers.authorization;

		if (!token) {
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				"You are not logged in. Please log in to access this resource.",
			);
		}

		const verifiedToken = jwtUtils.verifyToken(token, config.jwt_access_secret);

		if (!verifiedToken.success) {
			const jwtError = verifiedToken.error ?? "";

			let friendlyMessage =
				"You are not logged in. Please log in to access this resource.";

			if (jwtError.includes("expired")) {
				friendlyMessage =
					"Your session has expired. Please log in again.";
			} else if (
				jwtError.includes("malformed") ||
				jwtError.includes("invalid") ||
				jwtError.includes("signature")
			) {
				friendlyMessage =
					"Invalid token. Please log in again.";
			}

			throw new AppError(httpStatus.UNAUTHORIZED, friendlyMessage);
		}

		const { email, name, id: userId, role } = verifiedToken.data as JwtPayload;

		if (requiredRoles.length && !requiredRoles.includes(role)) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"Forbidden. You don't have permission to access this resource.",
			);
		}

		const user = await prisma.user.findUnique({
			where: {
				id: userId,
				email,
				name,
				role,
			},
		});

		if (!user) {
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				"User not found. Please log in again.",
			);
		}

		// Feature 6: enforce UserStatus on every authenticated request so that
		// an already-issued token stops working the moment an admin suspends
		// or deletes the account — not only at the next login.
		if (user.status === "SUSPENDED") {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"Your account has been suspended. Please contact support.",
			);
		}

		if (user.status === "DELETED" || user.isDeleted) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"This account has been deleted. Please contact support if this is a mistake.",
			);
		}

		// Block all routes if the user must change their temporary password first.
		// The /auth/change-password endpoint is the only one allowed through.
		if (user.mustChangePassword && !req.path.endsWith("/auth/change-password")) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You must change your temporary password before accessing this resource. Please use POST /api/v1/auth/change-password.",
			);
		}

		req.user = {
			email,
			name,
			userId,
			role,
		};

		next();
	});
};
