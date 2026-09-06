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

export const emergencyController = {
	createEmergency,
};
