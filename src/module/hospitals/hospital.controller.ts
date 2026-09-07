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

const validDiversionStatuses = Object.values(HospitalDiversionStatus);

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
		if (isValidEnum(req.query.diversionStatus, validDiversionStatuses)) {
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

const createStaff = catchAsync(async (req: Request, res: Response) => {
	const hospitalId = req.params.id as string;
	const requesterId = req.user!.userId as string;
	const requesterRole = req.user!.role;
	const payload = req.body;

	if (requesterRole === UserRole.HOSPITAL_STAFF) {
		const requesterStaff = await getRequesterStaffRecord(
			requesterId,
			hospitalId,
		);
		if (!requesterStaff?.canManageStaff) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have permission to add staff to this hospital.",
			);
		}
	}

	const result = await hospitalService.createStaffIntoDB(hospitalId, payload);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Staff member created successfully.",
		data: result,
	});
});

const getAllStaff = catchAsync(async (req: Request, res: Response) => {
	const hospitalId = req.params.id as string;
	const requesterId = req.user!.userId as string;
	const requesterRole = req.user!.role;

	if (requesterRole === UserRole.HOSPITAL_STAFF) {
		const requesterStaff = await getRequesterStaffRecord(
			requesterId,
			hospitalId,
		);
		if (!requesterStaff) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not a staff member of this hospital.",
			);
		}
	}

	const page = Math.max(1, Number(req.query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

	const filters: {
		canManageStaff?: boolean;
		isOnShift?: boolean;
		search?: string;
	} = {};

	let hasInvalidFilter = false;

	if (
		typeof req.query.canManageStaff === "string" &&
		req.query.canManageStaff !== ""
	) {
		if (req.query.canManageStaff === "true") filters.canManageStaff = true;
		else if (req.query.canManageStaff === "false")
			filters.canManageStaff = false;
		else hasInvalidFilter = true;
	}

	if (typeof req.query.isOnShift === "string" && req.query.isOnShift !== "") {
		if (req.query.isOnShift === "true") filters.isOnShift = true;
		else if (req.query.isOnShift === "false") filters.isOnShift = false;
		else hasInvalidFilter = true;
	}

	if (typeof req.query.search === "string" && req.query.search.trim() !== "") {
		filters.search = req.query.search.trim();
	}

	if (hasInvalidFilter) {
		return sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message: "Hospital staff retrieved successfully.",
			data: [],
			meta: { page, limit, total: 0, totalPages: 0 },
		});
	}

	const result = await hospitalService.getAllStaffFromDB(
		hospitalId,
		page,
		limit,
		filters,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Hospital staff retrieved successfully.",
		data: result.staff,
		meta: result.meta,
	});
});

const updateStaff = catchAsync(async (req: Request, res: Response) => {
	const hospitalId = req.params.id as string;
	const staffId = req.params.staffId as string;
	const requesterId = req.user!.userId as string;
	const requesterRole = req.user!.role;
	const payload = req.body;

	if (requesterRole === UserRole.HOSPITAL_STAFF) {
		const requesterStaff = await getRequesterStaffRecord(
			requesterId,
			hospitalId,
		);
		if (!requesterStaff?.canManageStaff) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have staff management privileges for this hospital.",
			);
		}
	}

	const result = await hospitalService.updateStaffInDB(
		hospitalId,
		staffId,
		payload,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Staff member updated successfully.",
		data: result,
	});
});

const deleteStaff = catchAsync(async (req: Request, res: Response) => {
	const hospitalId = req.params.id as string;
	const staffId = req.params.staffId as string;
	const requesterId = req.user!.userId as string;
	const requesterRole = req.user!.role;

	if (requesterRole === UserRole.HOSPITAL_STAFF) {
		const requesterStaff = await getRequesterStaffRecord(
			requesterId,
			hospitalId,
		);
		if (!requesterStaff?.canManageStaff) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You do not have staff management privileges for this hospital.",
			);
		}
	}

	await hospitalService.deleteStaffInDB(hospitalId, staffId);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Staff member deleted successfully.",
		data: null,
	});
});

const toggleShift = catchAsync(async (req: Request, res: Response) => {
	const userId = req.user!.userId as string;
	const { action } = req.body;

	const result = await hospitalService.toggleShiftInDB(userId, action);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: `Shift ${action === "start" ? "started" : "ended"} successfully.`,
		data: result,
	});
});

export const hospitalController = {
	createHospital,
	getAllHospitals,
	updateHospital,
	updateDiversion,
	createStaff,
	getAllStaff,
	updateStaff,
	deleteStaff,
	toggleShift,
};
