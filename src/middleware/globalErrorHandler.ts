import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { Prisma } from "../../generated/prisma/client.js";
import config from "../config/index.js";
import { AppError } from "../utils/AppError.js";

export const globalErrorHandler = async (
	err: any,
	_req: Request,
	res: Response,
	_next: NextFunction,
) => {
	// Always log errors to the console so serverless platforms like Vercel can capture them in their logs
	console.error("Error from Global Error Handler:", err);

	let statusCode: number = httpStatus.INTERNAL_SERVER_ERROR;
	let errorMessage = err.message || "Internal Server Error";
	let cleanName = "Error"; // Generic name shown to client in production

	if (err instanceof Prisma.PrismaClientValidationError) {
		statusCode = httpStatus.BAD_REQUEST;
		errorMessage = "You have provided incorrect field type or missing fields";
		cleanName = "ValidationError";
	} else if (err instanceof Prisma.PrismaClientKnownRequestError) {
		if (err.code === "P2002") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage = "Duplicate Key Error";
			cleanName = "ConflictError";
		} else if (err.code === "P2003") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage = "Foreign key constraint failed";
			cleanName = "ValidationError";
		} else if (err.code === "P2025") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage =
				"An operation failed because it depends on one or more records that were required but not found.";
			cleanName = "NotFoundError";
		}
	} else if (err instanceof Prisma.PrismaClientInitializationError) {
		if (err.errorCode === "P1000") {
			statusCode = httpStatus.UNAUTHORIZED;
			errorMessage =
				"Authentication failed against database server. Please Check Your Credentials";
			cleanName = "DatabaseError";
		} else if (err.errorCode === "P1001") {
			statusCode = httpStatus.BAD_REQUEST;
			errorMessage = "Can't reach database server";
			cleanName = "DatabaseError";
		}
	} else if (err instanceof Prisma.PrismaClientUnknownRequestError) {
		statusCode = httpStatus.INTERNAL_SERVER_ERROR;
		errorMessage = "Error occurred during query execution";
		cleanName = "DatabaseError";
	} else if (err instanceof AppError) {
		errorMessage = err.message;
		statusCode = err.statusCode;
		cleanName = err.name || "AppError";
	} else if (err instanceof Error) {
		errorMessage = err.message;
		cleanName = "Error";
	}

	// In production: show real message for intentional errors (AppError, Prisma validation, etc.)
	// Only hide message for truly unexpected 500 errors
	const isIntentionalError = err instanceof AppError || statusCode < 500;

	res.status(statusCode).json({
		success: false,
		statusCode: statusCode || httpStatus.INTERNAL_SERVER_ERROR,
		// In dev: show real internal class name; in prod: show clean generic name
		name: config.node_env === "development" ? (err.name || cleanName) : cleanName,
		message: isIntentionalError ? errorMessage : "Internal Server Error",
		error: config.node_env === "development" ? err : undefined,
		stack: config.node_env === "development" ? err.stack : undefined,
	});
};
