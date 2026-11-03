import type { Request, Response } from "express";
import httpStatus from "http-status";
import { DispatchStatus } from "../../../generated/prisma/enums.js";
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
	const ipAddress = (req.ip ?? req.socket?.remoteAddress ?? "unknown") as string;
	const payload = req.body;

	const { dispatch, serviceOverdueWarning } = await dispatchService.createDispatch(
		payload,
		dispatcherId,
		dispatcherRole,
		ipAddress,
	);

	const message = serviceOverdueWarning
		? "Ambulance dispatched successfully. WARNING: This ambulance is overdue for service maintenance."
		: "Ambulance dispatched successfully. Awaiting driver acceptance.";

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message,
		data: { ...dispatch, serviceOverdueWarning },
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
	const ipAddress = (req.ip ?? req.socket?.remoteAddress ?? "unknown") as string;
	const payload = req.body;

	const result = await dispatchService.cancelDispatch(
		dispatchId,
		userId,
		userRole,
		payload,
		ipAddress,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Dispatch cancelled successfully.",
		data: result,
	});
});

/**
 * Feature #2 — GET /api/v1/dispatch/me
 * Returns all PENDING_ACCEPTANCE dispatches assigned to the authenticated
 * driver. Designed for polling — returns only what's needed for the
 * accept/reject decision, plus timeoutAt for a countdown timer.
 */
const getMyPendingDispatches = catchAsync(
	async (req: Request, res: Response) => {
		const userId = req.user!.userId as string;

		const dispatches =
			await dispatchService.getMyPendingDispatches(userId);

		sendResponse(res, {
			success: true,
			statusCode: httpStatus.OK,
			message:
				dispatches.length > 0
					? `${dispatches.length} pending dispatch(es) found.`
					: "No pending dispatches at this time.",
			data: dispatches,
		});
	},
);

/**
 * Feature #2 — GET /api/v1/dispatch/:id
 * Fetches a single dispatch by ID. DRIVER role is restricted to their
 * own dispatches. SUPER_ADMIN, ADMIN, and DISPATCHER can fetch any.
 */
const getDispatchById = catchAsync(async (req: Request, res: Response) => {
	const dispatchId = req.params.id as string;
	const userId = req.user!.userId as string;
	const userRole = req.user!.role as string;

	const dispatch = await dispatchService.getDispatchById(
		dispatchId,
		userId,
		userRole,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Dispatch retrieved successfully.",
		data: dispatch,
	});
});

const getAllDispatches = catchAsync(async (req: Request, res: Response) => {
	const page = Math.max(1, Number(req.query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

	const filters: {
		status?: DispatchStatus;
		emergencyId?: string;
		ambulanceId?: string;
		driverId?: string;
		search?: string;
	} = {};

	if (
		typeof req.query.status === "string" &&
		req.query.status !== "" &&
		req.query.status !== "ALL"
	) {
		if (Object.values(DispatchStatus).includes(req.query.status as DispatchStatus)) {
			filters.status = req.query.status as DispatchStatus;
		}
	}
	if (typeof req.query.emergencyId === "string" && req.query.emergencyId.trim() !== "") {
		filters.emergencyId = req.query.emergencyId.trim();
	}
	if (typeof req.query.ambulanceId === "string" && req.query.ambulanceId.trim() !== "") {
		filters.ambulanceId = req.query.ambulanceId.trim();
	}
	if (typeof req.query.driverId === "string" && req.query.driverId.trim() !== "") {
		filters.driverId = req.query.driverId.trim();
	}
	if (typeof req.query.search === "string" && req.query.search.trim() !== "") {
		filters.search = req.query.search.trim();
	}

	const result = await dispatchService.getAllDispatches(page, limit, filters);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Dispatches retrieved successfully.",
		data: result.dispatches,
		meta: result.meta,
	});
});

export const dispatchController = {
	recommendAmbulances,
	createDispatch,
	acceptDispatch,
	rejectDispatch,
	cancelDispatch,
	getMyPendingDispatches,
	getDispatchById,
	getAllDispatches,
};
