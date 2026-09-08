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
	const adminDetails = {
		id: req.user!.userId,
		role: req.user!.role,
		name: req.user!.name,
	};

	const user = await adminService.updateUserStatusInDB(
		id as string,
		status,
		adminDetails,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "User status updated successfully.",
		data: user,
	});
});

const getAnalyticsOverview = catchAsync(async (_req: Request, res: Response) => {
	const overview = await adminService.getAnalyticsOverview();

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Analytics overview retrieved successfully.",
		data: overview,
	});
});

const getEmergencyAnalytics = catchAsync(async (req: Request, res: Response) => {
	const filters: { from?: string; to?: string } = {};

	if (typeof req.query.from === "string" && req.query.from.trim() !== "") {
		filters.from = req.query.from.trim();
	}

	if (typeof req.query.to === "string" && req.query.to.trim() !== "") {
		filters.to = req.query.to.trim();
	}

	const result = await adminService.getEmergencyAnalytics(filters);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Emergency analytics retrieved successfully.",
		data: result,
	});
});

const getPaymentAnalytics = catchAsync(async (req: Request, res: Response) => {
	const filters: { from?: string; to?: string } = {};

	if (typeof req.query.from === "string" && req.query.from.trim() !== "") {
		filters.from = req.query.from.trim();
	}

	if (typeof req.query.to === "string" && req.query.to.trim() !== "") {
		filters.to = req.query.to.trim();
	}

	const result = await adminService.getPaymentAnalytics(filters);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Payment analytics retrieved successfully.",
		data: result,
	});
});

const getAuditLogs = catchAsync(async (req: Request, res: Response) => {
	const page = Math.max(1, Number(req.query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

	const filters: {
		action?: string;
		entity?: string;
		performedBy?: string;
	} = {};

	if (typeof req.query.action === "string" && req.query.action.trim() !== "") {
		filters.action = req.query.action.trim();
	}

	if (typeof req.query.entity === "string" && req.query.entity.trim() !== "") {
		filters.entity = req.query.entity.trim();
	}

	if (
		typeof req.query.performedBy === "string" &&
		req.query.performedBy.trim() !== ""
	) {
		filters.performedBy = req.query.performedBy.trim();
	}

	const result = await adminService.getAuditLogs(page, limit, filters);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Audit logs retrieved successfully.",
		data: result.logs,
		meta: result.meta,
	});
});

export const adminController = {
	getAllUsers,
	updateUserStatus,
	getAnalyticsOverview,
	getEmergencyAnalytics,
	getPaymentAnalytics,
	getAuditLogs,
};

