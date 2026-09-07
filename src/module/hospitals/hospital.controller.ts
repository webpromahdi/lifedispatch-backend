import type { Request, Response } from "express";
import httpStatus from "http-status";
import {
	HospitalDiversionStatus,
	UserRole,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { hospitalService } from "./hospital.service.js";

const VALID_DIVERSION_STATUSES = Object.values(HospitalDiversionStatus);

function isValidEnum<T extends string>(
	value: string,
	allowed: T[],
): value is T {
	return allowed.includes(value as T);
}

const getRequesterStaffRecord = async (userId: string, hospitalId: string) => {
	return prisma.hospitalStaff.findFirst({
		where: { userId, hospitalId },
	});
};

const createHospital = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;

	const result = await hospitalService.createHospitalIntoDB(payload);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Hospital created successfully.",
		data: result,
	});
});

const getAllHospitals = catchAsync(async (req: Request, res: Response) => {
	const page = Math.max(1, Number(req.query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

	const filters: {
		diversionStatus?: HospitalDiversionStatus;
		isActive?: boolean;
		search?: string;
	} = {};

	let hasInvalidFilter = false;

	if (
		typeof req.query.diversionStatus === "string" &&
		req.query.diversionStatus !== ""
	) {
		if (isValidEnum(req.query.diversionStatus, VALID_DIVERSION_STATUSES)) {
			filters.diversionStatus = req.query.diversionStatus;
		} else {
			hasInvalidFilter = true;
		}
	}

	if (typeof req.query.isActive === "string" && req.query.isActive !== "") {
		if (req.query.isActive === "true") filters.isActive = true;
		else if (req.query.isActive === "false") filters.isActive = false;
		else hasInvalidFilter = true;
	}

	if (typeof req.query.search === "string" && req.query.search.trim() !== "") {
		filters.search = req.query.search.trim();
	}

	if (hasInvalidFilter) {
		return sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message: "Hospitals retrieved successfully.",
			data: [],
			meta: { page, limit, total: 0, totalPages: 0 },
		});
	}

	const result = await hospitalService.getAllHospitalsFromDB(
		page,
		limit,
		filters,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Hospitals retrieved successfully.",
		data: result.hospitals,
		meta: result.meta,
	});
});

const updateHospital = catchAsync(async (req: Request, res: Response) => {
	const hospitalId = req.params.id as string;
	const requesterId = req.user!.userId as string;
	const requesterRole = req.user!.role;
	const payload = req.body;

	if (requesterRole === UserRole.HOSPITAL_STAFF) {
		const staffRecord = await getRequesterStaffRecord(requesterId, hospitalId);

		if (!staffRecord) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not a staff member of this hospital.",
			);
		}

		if (!staffRecord.canManageStaff) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have staff management privileges for this hospital.",
			);
		}
	}

	const hospital = await hospitalService.updateHospitalInDB(
		hospitalId,
		payload,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Hospital details updated successfully.",
		data: hospital,
	});
});

const updateDiversion = catchAsync(async (req: Request, res: Response) => {
	const hospitalId = req.params.id as string;
	const requesterId = req.user!.userId as string;
	const requesterRole = req.user!.role;
	const payload = req.body;

	if (requesterRole === UserRole.HOSPITAL_STAFF) {
		const staffRecord = await getRequesterStaffRecord(requesterId, hospitalId);

		if (!staffRecord) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not a staff member of this hospital.",
			);
		}
	}

	const hospital = await hospitalService.updateDiversionInDB(
		hospitalId,
		payload,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Hospital diversion status updated successfully.",
		data: hospital,
	});
});

export const hospitalController = {
	createHospital,
	getAllHospitals,
	updateHospital,
	updateDiversion,
};
