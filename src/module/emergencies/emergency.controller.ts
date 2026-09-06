import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { emergencyService } from "./emergency.service.js";

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

const getMyEmergencies = catchAsync(async (req: Request, res: Response) => {
	const patientId = req.user!.userId;
	const page = Math.max(1, Number(req.query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

	const result = await emergencyService.getMyEmergencies(
		patientId,
		page,
		limit,
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

export const emergencyController = {
	createEmergency,
	getMyEmergencies,
	getEmergencyById,
};
