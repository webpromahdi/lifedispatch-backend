import type { Request, Response } from "express";
import httpStatus from "http-status";
import { TripStatus } from "../../../generated/prisma/enums.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { tripService } from "./trip.service.js";

const getTripById = catchAsync(async (req: Request, res: Response) => {
	const tripId = req.params.id as string;
	const userId = req.user!.userId as string;
	const userRole = req.user!.role as string;

	const trip = await tripService.getTripById(tripId, userId, userRole);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Trip details retrieved successfully.",
		data: trip,
	});
});

const updateTripStatus = catchAsync(async (req: Request, res: Response) => {
	const tripId = req.params.id as string;
	const userId = req.user!.userId as string;
	const payload = req.body;

	const trip = await tripService.updateTripStatus(tripId, userId, payload);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: `Trip status updated to ${payload.status}.`,
		data: trip,
	});
});

const selectHospital = catchAsync(async (req: Request, res: Response) => {
	const tripId = req.params.id as string;
	const userId = req.user!.userId as string;
	const userRole = req.user!.role as string;
	const payload = req.body;

	const { trip, capacityWarning } = await tripService.selectHospital(
		tripId,
		userId,
		userRole,
		payload,
	);

	const message = capacityWarning
		? `Destination hospital selected successfully. ${capacityWarning}`
		: "Destination hospital selected successfully.";

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message,
		data: trip,
	});
});

const completeTrip = catchAsync(async (req: Request, res: Response) => {
	const tripId = req.params.id as string;
	const userId = req.user!.userId as string;
	const payload = req.body;

	const { invoicePdf, ...result } = await tripService.completeTrip(
		tripId,
		userId,
		payload,
	);

	// If the client explicitly requests a PDF, stream it directly
	if (req.accepts("application/pdf")) {
		res.set({
			"Content-Type": "application/pdf",
			"Content-Disposition": `attachment; filename="invoice-${result.payment.invoiceNumber}.pdf"`,
			"Content-Length": invoicePdf.length,
		});
		return res.end(invoicePdf);
	}

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.CREATED,
		message: "Trip completed and invoice generated successfully.",
		data: {
			...result,
			invoicePdfBase64: invoicePdf.toString("base64"),
		},
	});
});

const getMyTrips = catchAsync(async (req: Request, res: Response) => {
	const userId = req.user!.userId as string;
	const page = Math.max(1, Number(req.query.page) || 1);
	const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 10));

	let validStatus: TripStatus | undefined;
	if (
		typeof req.query.status === "string" &&
		req.query.status !== "" &&
		req.query.status !== "ALL"
	) {
		if (Object.values(TripStatus).includes(req.query.status as TripStatus)) {
			validStatus = req.query.status as TripStatus;
		} else {
			return sendResponse(res, {
				success: true,
				statusCode: httpStatus.OK,
				message: "Driver trips retrieved successfully.",
				data: [],
				meta: { page, limit, total: 0, totalPages: 0 },
			});
		}
	}

	const result = await tripService.getMyTrips(userId, page, limit, validStatus);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Driver trips retrieved successfully.",
		data: result.trips,
		meta: result.meta,
	});
});

export const tripController = {
	getTripById,
	getMyTrips,
	updateTripStatus,
	selectHospital,
	completeTrip,
};
