import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import passport from "passport";
import type { User } from "../../../generated/prisma/client.js";
import config from "../../config/index.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { authService } from "./auth.service.js";

const register = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const payload = req.body;
		const user = await authService.registerUserIntoDB(payload);

		sendResponse(res, {
			success: true,
			statusCode: httpStatus.CREATED,
			message: "User registered successfully",
			data: { user },
		});
	},
);

const loginUser = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		passport.authenticate(
			"local",
			async (
				err: Error | null,
				user: User | false,
				info: { message?: string } | undefined,
			) => {
				try {
					if (err) {
						return next(err);
					}
					if (!user) {
						return next(new Error(info?.message || "Invalid credentials!"));
					}
					const { accessToken, refreshToken } =
						await authService.loginUser(user);

					res.cookie("accessToken", accessToken, {
						httpOnly: true,
						secure: process.env.NODE_ENV === config.node_env,
						sameSite: "none",
						maxAge: 1000 * 60 * 60 * 24,
					});
					res.cookie("refreshToken", refreshToken, {
						httpOnly: true,
						secure: process.env.NODE_ENV === config.node_env,
						sameSite: "none",
						maxAge: 1000 * 60 * 60 * 24 * 7,
					});

					sendResponse(res, {
						success: true,
						statusCode: httpStatus.OK,
						message: "User logged in successfully",
						data: { accessToken, refreshToken },
					});
				} catch (error) {
					next(error);
				}
			},
		)(req, res, next);
	},
);

const refreshToken = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const refreshToken = req.cookies.refreshToken;

		const { accessToken } = await authService.refreshToken(refreshToken);

		res.cookie("accessToken", accessToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "none",
			maxAge: 1000 * 60 * 60 * 24,
		});

		sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message: "Token refreshed successfully",
			data: {
				accessToken,
			},
		});
	},
);

const googleLoginCallback = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		passport.authenticate(
			"google",
			async (
				err: Error | null,
				user: User | false,
				info: { message?: string } | undefined,
			) => {
				try {
					if (err) {
						return next(
							new Error(err?.message || "Google authentication Failed"),
						);
					}
					if (!user) {
						return next(
							new Error(info?.message || "Google authentication Failed"),
						);
					}

					const { accessToken, refreshToken } =
						await authService.loginUser(user);

					res.redirect(
						`${config.app_url}/api/v1/auth/google?accessToken=${accessToken}&refreshToken=${refreshToken}`,
					);
				} catch (error) {
					next(error);
				}
			},
		)(req, res, next);
	},
);

export const authController = {
	register,
	loginUser,
	refreshToken,
	googleLoginCallback,
};
