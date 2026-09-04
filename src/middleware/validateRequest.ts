import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import type z from "zod";
import { AppError } from "../utils/AppError.js";
import { catchAsync } from "../utils/catchAsync.js";

export const validateRequest = (zodSchema: z.ZodObject<any>) => {
	return catchAsync((req: Request, res: Response, next: NextFunction) => {
		const payload = req.body ?? {};
		const result = zodSchema.safeParse(payload);

		if (!result.success) {
			const { error } = result;
			console.log(error);
			console.log(error.issues);

			const errorMessage = error.issues[0]?.message || "Validation error";
			throw new AppError(httpStatus.BAD_REQUEST, errorMessage);
		}

		req.body = result.data;

		next();
	});
};
