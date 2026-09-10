import type { Request, Response } from "express";
import httpStatus from "http-status";
import config from "../../config/index.js";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { paymentService } from "./payment.service.js";

const initiatePayment = catchAsync(async (req: Request, res: Response) => {
	const paymentId = req.params.paymentId as string;
	const userId = req.user!.userId as string;

	const result = await paymentService.initiatePayment(paymentId, userId);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Payment initiated. Redirect the patient to the gateway URL.",
		data: result,
	});
});

const handleCallback = async (req: Request, res: Response) => {
	const { paymentId, transactionId, status } = req.query as {
		paymentId: string;
		transactionId: string;
		status: string;
	};
	const body = req.body as Record<string, unknown>;

	try {
		const result = await paymentService.handleCallback(
			paymentId,
			transactionId,
			status,
			body,
		);

		// Always redirect to frontend — even on failure
		// This prevents SSLCommerz from falling back to its store-registered URL
		return res.redirect(
			`${config.frontend_url}/payment/result?status=${result.result}&paymentId=${paymentId}`,
		);
	} catch (err) {
		console.error("[Payment Callback] Error during callback handling:", err);
		// On any unexpected error, still redirect to frontend with error status
		return res.redirect(
			`${config.frontend_url}/payment/result?status=error&paymentId=${paymentId ?? ""}`,
		);
	}
};

const handleIpn = catchAsync(async (req: Request, res: Response) => {
	const body = req.body as Record<string, unknown>;
	await paymentService.handleIpn(body);

	res.status(httpStatus.OK).json({ received: true });
});

const getPaymentById = catchAsync(async (req: Request, res: Response) => {
	const paymentId = req.params.paymentId as string;
	const userId = req.user!.userId as string;

	const payment = await paymentService.getPaymentById(paymentId, userId);

	sendResponse(res, {
		success: true,
		statusCode: httpStatus.OK,
		message: "Payment details retrieved successfully.",
		data: payment,
	});
});

export const paymentController = {
	initiatePayment,
	handleCallback,
	handleIpn,
	getPaymentById,
};
