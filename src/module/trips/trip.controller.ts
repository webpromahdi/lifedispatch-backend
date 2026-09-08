import type { Request, Response } from "express";
import httpStatus from "http-status";
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

	const trip = await tripService.selectHospital(
		tripId,
		userId,
		userRole,
		payload,
	);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Destination hospital selected successfully.",
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

export const tripController = {
	getTripById,
	updateTripStatus,
	selectHospital,
	completeTrip,
};
