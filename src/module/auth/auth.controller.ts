import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
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

export const authController = {
	register,
};
