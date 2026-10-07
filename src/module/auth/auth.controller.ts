import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import passport from "passport";
import config from "../../config/index.js";
import { AppError } from "../../utils/AppError.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import type { ILoginUser } from "./auth.interface.js";
import { authService } from "./auth.service.js";

const register = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const payload = req.body;
		const user = await authService.registerUserIntoDB(payload);

		sendResponse(res, {
			success: true,
			statusCode: httpStatus.CREATED,
			message:
				"Registration OTP sent to your email successfully. Valid for 5 minutes.",
			data: { user },
		});
	},
);

const verifyUserEmail = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	const result = await authService.verifyUserEmail(payload);

	const { accessToken, refreshToken, user } = result;

	res.cookie("accessToken", accessToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24, // 24 hours
	});
	res.cookie("refreshToken", refreshToken, {
		httpOnly: true,
		secure: process.env.NODE_ENV === "production",
		sameSite: "none",
		maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
	});

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Email Verified Successfully",
		data: {
			accessToken,
			refreshToken,
			user,
		},
	});
});

const loginUser = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		passport.authenticate(
			"local",
			async (
				err: Error | null,
				user: ILoginUser | false,
				info: { message?: string } | undefined,
			) => {
				try {
					if (err) {
						return next(err);
					}
					if (!user) {
						return next(new AppError(httpStatus.UNAUTHORIZED, info?.message || "Invalid credentials!"));
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

const forgotPassword = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	await authService.forgotPassword(payload);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: `OTP Sent To Email : ${payload.email}`,
		data: null,
	});
});

const resetPassword = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	await authService.resetPassword(payload);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Password Changed Successfully",
		data: null,
	});
});

const refreshToken = catchAsync(
	async (req: Request, res: Response, next: NextFunction) => {
		const token = req.cookies.refreshToken;

		if (!token) {
			throw new AppError(
				httpStatus.UNAUTHORIZED,
				"No refresh token provided. Please log in again.",
			);
		}

		const { accessToken, refreshToken: newRefreshToken } =
			await authService.refreshToken(token);

		res.cookie("accessToken", accessToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "none",
			maxAge: 1000 * 60 * 60 * 24,
		});

		// Feature 5: rotate refresh token cookie as well
		res.cookie("refreshToken", newRefreshToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "none",
			maxAge: 1000 * 60 * 60 * 24 * 7,
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
				user: ILoginUser | false,
				info: { message?: string } | undefined,
			) => {
				try {
					if (err) {
						return next(
							new AppError(httpStatus.UNAUTHORIZED, err?.message || "Google authentication Failed"),
						);
					}
					if (!user) {
						return next(
							new AppError(httpStatus.UNAUTHORIZED, info?.message || "Google authentication Failed"),
						);
					}

					const { accessToken, refreshToken } =
						await authService.loginUser(user);

					res.redirect(
						`${config.frontend_url}/api/v1/auth/google?accessToken=${accessToken}&refreshToken=${refreshToken}`,
					);
				} catch (error) {
					next(error);
				}
			},
		)(req, res, next);
	},
);

const changePassword = catchAsync(async (req: Request, res: Response) => {
	const userId = req.user!.userId;
	const payload = req.body;

	await authService.changeTempPassword(userId, payload);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Password changed successfully. Your account is now fully active.",
		data: null,
	});
});

/**
 * Feature 5: Logout — revoke the current refresh token and clear auth cookies.
 */
const logout = catchAsync(async (req: Request, res: Response) => {
	const userId = req.user!.userId;
	const token = req.cookies.refreshToken as string | undefined;

	if (token) {
		await authService.logoutUser(userId, token);
	}

	res.clearCookie("accessToken", { httpOnly: true, sameSite: "none", secure: process.env.NODE_ENV === "production" });
	res.clearCookie("refreshToken", { httpOnly: true, sameSite: "none", secure: process.env.NODE_ENV === "production" });

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Logged out successfully.",
		data: null,
	});
});

/**
 * Feature 5: Logout everywhere — revoke ALL refresh tokens for this user.
 * Useful after a password reset or suspected account compromise.
 */
const logoutAll = catchAsync(async (req: Request, res: Response) => {
	const userId = req.user!.userId;

	await authService.logoutAll(userId);

	res.clearCookie("accessToken", { httpOnly: true, sameSite: "none", secure: process.env.NODE_ENV === "production" });
	res.clearCookie("refreshToken", { httpOnly: true, sameSite: "none", secure: process.env.NODE_ENV === "production" });

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Logged out from all devices successfully.",
		data: null,
	});
});

/**
 * GET /api/v1/auth/me
 * Returns the authenticated user's full profile.
 */
const getMe = catchAsync(async (req: Request, res: Response) => {
	const userId = req.user!.userId;

	const user = await authService.getMe(userId);

	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "User profile fetched successfully",
		data: { user },
	});
});

export const authController = {
	register,
	verifyUserEmail,
	loginUser,
	forgotPassword,
	resetPassword,
	refreshToken,
	googleLoginCallback,
	changePassword,
	logout,
	logoutAll,
	getMe,
};
