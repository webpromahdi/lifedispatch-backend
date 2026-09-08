import type { Request, Response } from "express";
import httpStatus from "http-status";
import type { UserRole, UserStatus } from "../../../generated/prisma/enums.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { adminService } from "./admin.service.js";

const validRoles: UserRole[] = [
	"SUPER_ADMIN",
	"ADMIN",
	"PATIENT",
	"DISPATCHER",
	"DRIVER",
	"HOSPITAL_STAFF",
];

const validStatuses: UserStatus[] = ["ACTIVE", "SUSPENDED", "DELETED"];

function isValidEnum<T extends string>(value: string, allowed: T[]): value is T {
	return allowed.includes(value as T);
}

const getAllUsers = catchAsync(async (req: Request, res: Response) => {
	const page = Math.max(1, Number(req.query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

	const filters: {
		role?: UserRole;
		status?: UserStatus;
		search?: string;
	} = {};

	let hasInvalidFilter = false;

	if (typeof req.query.role === "string" && req.query.role !== "") {
		if (isValidEnum(req.query.role, validRoles)) {
			filters.role = req.query.role;
		} else {
			hasInvalidFilter = true;
		}
	}

	if (typeof req.query.status === "string" && req.query.status !== "") {
		if (isValidEnum(req.query.status, validStatuses)) {
			filters.status = req.query.status;
		} else {
			hasInvalidFilter = true;
		}
	}

	if (typeof req.query.search === "string" && req.query.search.trim() !== "") {
		filters.search = req.query.search.trim();
	}

	if (hasInvalidFilter) {
		return sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message: "Users retrieved successfully.",
			data: [],
			meta: { page, limit, total: 0, totalPages: 0 },
		});
	}

	const result = await adminService.getAllUsersFromDB(page, limit, filters);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Users retrieved successfully.",
		data: result.users,
		meta: result.meta,
	});
});

const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
	const { id } = req.params;
	const { status } = req.body as { status: UserStatus };

	const user = await adminService.updateUserStatusInDB(id as string, status);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "User status updated successfully.",
		data: user,
	});
});

export const adminController = {
	getAllUsers,
	updateUserStatus,
};
