import type { Request, Response } from "express";
import httpStatus from "http-status";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { dispatchService } from "./dispatch.service.js";

const recommendAmbulances = catchAsync(async (req: Request, res: Response) => {
	const { emergencyId } = req.body;

	const candidates = await dispatchService.recommendAmbulances(emergencyId);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message:
			candidates.length > 0
				? `${candidates.length} ambulance candidate(s) found.`
				: "No eligible ambulances available at this time.",
		data: candidates,
	});
});

const createDispatch = catchAsync(async (req: Request, res: Response) => {
	const dispatcherId = req.user!.userId as string;
	const dispatcherRole = req.user!.role as string;
	const payload = req.body;

	const dispatch = await dispatchService.createDispatch(
		payload,
		dispatcherId,
		dispatcherRole,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Ambulance dispatched successfully. Awaiting driver acceptance.",
		data: dispatch,
	});
});

const acceptDispatch = catchAsync(async (req: Request, res: Response) => {
	const dispatchId = req.params.id as string;
	const userId = req.user!.userId as string;

	const result = await dispatchService.acceptDispatch(dispatchId, userId);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Dispatch accepted. Trip has been created.",
		data: result,
	});
});

const rejectDispatch = catchAsync(async (req: Request, res: Response) => {
	const dispatchId = req.params.id as string;
	const userId = req.user!.userId as string;
	const payload = req.body;

	const result = await dispatchService.rejectDispatch(
		dispatchId,
		userId,
		payload,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Dispatch rejected.",
		data: result,
	});
});

const cancelDispatch = catchAsync(async (req: Request, res: Response) => {
	const dispatchId = req.params.id as string;
	const userId = req.user!.userId as string;
	const userRole = req.user!.role as string;
	const payload = req.body;

	const result = await dispatchService.cancelDispatch(
		dispatchId,
		userId,
		userRole,
		payload,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Dispatch cancelled successfully.",
		data: result,
	});
});

export const dispatchController = {
	recommendAmbulances,
	createDispatch,
	acceptDispatch,
	rejectDispatch,
	cancelDispatch,
};
