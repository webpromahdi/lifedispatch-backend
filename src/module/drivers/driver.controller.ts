import type { Request, Response } from "express";
import httpStatus from "http-status";
import { CertificationLevel } from "../../../generated/prisma/enums.js";
import { AppError } from "../../utils/AppError.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { uploadToCloudinary } from "../../utils/uploadToCloudinary.js";
import { driverService } from "./driver.service.js";

const validCertificationLevels = Object.values(CertificationLevel);

function isValidEnum<T extends string>(
	value: string,
	allowed: T[],
): value is T {
	return allowed.includes(value as T);
}

const createDriver = catchAsync(async (req: Request, res: Response) => {
	if (!req.file) {
		throw new AppError(httpStatus.BAD_REQUEST, "License document is required.");
	}
	const uploaded = await uploadToCloudinary(
		req.file.buffer,
		"lifedispatch/drivers",
		"raw",
		req.file.originalname,
	);

	const payload = {
		...req.body,
		licenseDocumentUrl: uploaded.secure_url,
	};

	const driver = await driverService.createDriverIntoDB(payload);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Driver profile created successfully.",
		data: driver,
	});
});

const getAllDrivers = catchAsync(async (req: Request, res: Response) => {
	const page = Math.max(1, Number(req.query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

	const filters: {
		isOnShift?: boolean;
		certificationLevel?: CertificationLevel;
	} = {};

	let hasInvalidFilter = false;

	if (typeof req.query.isOnShift === "string" && req.query.isOnShift !== "") {
		if (req.query.isOnShift === "true") {
			filters.isOnShift = true;
		} else if (req.query.isOnShift === "false") {
			filters.isOnShift = false;
		} else {
			hasInvalidFilter = true;
		}
	}

	if (
		typeof req.query.certificationLevel === "string" &&
		req.query.certificationLevel !== ""
	) {
		if (isValidEnum(req.query.certificationLevel, validCertificationLevels)) {
			filters.certificationLevel = req.query.certificationLevel;
		} else {
			hasInvalidFilter = true;
		}
	}

	if (hasInvalidFilter) {
		return sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message: "Drivers retrieved successfully.",
			data: [],
			meta: { page, limit, total: 0, totalPages: 0 },
		});
	}

	const result = await driverService.getAllDriversFromDB(page, limit, filters);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Drivers retrieved successfully.",
		data: result.drivers,
		meta: result.meta,
	});
});

const updateDriver = catchAsync(async (req: Request, res: Response) => {
	const { id } = req.params;
	const payload = req.body;

	const driver = await driverService.updateDriverInDB(id as string, payload);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Driver profile updated successfully.",
		data: driver,
	});
});

const toggleShift = catchAsync(async (req: Request, res: Response) => {
	const userId = req.user!.userId;
	const { action } = req.body;

	const driver = await driverService.toggleShiftInDB(userId, action);

	const message =
		action === "start"
			? "Shift started successfully."
			: "Shift ended successfully.";

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message,
		data: driver,
	});
});

export const driverController = {
	createDriver,
	getAllDrivers,
	updateDriver,
	toggleShift,
};
