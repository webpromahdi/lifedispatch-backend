import type { Request, Response } from "express";
import httpStatus from "http-status";
import {
	EmergencyPriority,
	EmergencyStatus,
	EmergencyType,
} from "../../../generated/prisma/enums.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { emergencyService } from "./emergency.service.js";

const VALID_STATUSES = Object.values(EmergencyStatus);
const VALID_TYPES = Object.values(EmergencyType);
const VALID_PRIORITIES = Object.values(EmergencyPriority);

function isValidEnum<T extends string>(
	value: string,
	allowed: T[],
): value is T {
	return allowed.includes(value as T);
}

const createEmergency = catchAsync(async (req: Request, res: Response) => {
	const payload = req.body;
	const patientId = req.user!.userId;

	const emergency = await emergencyService.createEmergencyIntoDB(
		payload,
		patientId,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Emergency request created successfully.",
		data: emergency,
	});
});

const getAllEmergencies = catchAsync(async (req: Request, res: Response) => {
	const userId = req.user!.userId;
	const userRole = req.user!.role;

	const page = Math.max(1, Number(req.query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

	const filters: {
		status?: EmergencyStatus;
		emergencyType?: EmergencyType;
		priority?: EmergencyPriority;
	} = {};

	let hasInvalidFilter = false;

	if (typeof req.query.status === "string" && req.query.status !== "") {
		if (isValidEnum(req.query.status, VALID_STATUSES)) {
			filters.status = req.query.status;
		} else {
			hasInvalidFilter = true;
		}
	}

	if (
		typeof req.query.emergencyType === "string" &&
		req.query.emergencyType !== ""
	) {
		if (isValidEnum(req.query.emergencyType, VALID_TYPES)) {
			filters.emergencyType = req.query.emergencyType;
		} else {
			hasInvalidFilter = true;
		}
	}

	if (typeof req.query.priority === "string" && req.query.priority !== "") {
		if (isValidEnum(req.query.priority, VALID_PRIORITIES)) {
			filters.priority = req.query.priority;
		} else {
			hasInvalidFilter = true;
		}
	}

	if (hasInvalidFilter) {
		return sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message: "Emergency history retrieved successfully.",
			data: [],
			meta: { page, limit, total: 0, totalPages: 0 },
		});
	}

	const patientId = userRole === "PATIENT" ? userId : undefined;

	const result = await emergencyService.getAllEmergenciesFromDB(
		patientId as string,
		page,
		limit,
		filters,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Emergency history retrieved successfully.",
		data: result.emergencies,
		meta: result.meta,
	});
});

const getEmergencyById = catchAsync(async (req: Request, res: Response) => {
	const { id } = req.params;
	const requesterId = req.user!.userId;
	const requesterRole = req.user!.role;

	const emergency = await emergencyService.getEmergencyById(
		id as string,
		requesterId,
		requesterRole,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Emergency details retrieved successfully.",
		data: emergency,
	});
});

const updatePriority = catchAsync(async (req: Request, res: Response) => {
	const { id } = req.params;
	const { priority } = req.body;
	const dispatcherId = req.user!.userId;
	const dispatcherRole = req.user!.role;

	const emergency = await emergencyService.updatePriority(
		id as string,
		priority,
		dispatcherId,
		dispatcherRole,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Emergency priority updated successfully.",
		data: emergency,
	});
});

const cancelEmergency = catchAsync(async (req: Request, res: Response) => {
	const { id } = req.params;
	const { reason } = req.body;
	const userId = req.user!.userId;
	const userRole = req.user!.role;

	const emergency = await emergencyService.cancelEmergency(
		id as string,
		reason,
		userId,
		userRole,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Emergency cancelled successfully.",
		data: emergency,
	});
});

export const emergencyController = {
	createEmergency,
	getAllEmergencies,
	getEmergencyById,
	updatePriority,
	cancelEmergency,
};
