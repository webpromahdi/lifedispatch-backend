import axios from "axios";
import httpStatus from "http-status";
import { PaymentStatus } from "../../../generated/prisma/enums.js";
import config from "../../config/index.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";

const SSL_SANDBOX_INIT_URL =
	"https://sandbox.sslcommerz.com/gwprocess/v4/api.php";
const SSL_SANDBOX_VALIDATE_URL =
	"https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php";

const initiatePayment = async (paymentId: string, userId: string) => {
	const payment = await prisma.payment.findUnique({
		where: { id: paymentId },
		include: {
			patient: { select: { id: true, name: true, email: true } },
			trip: { select: { id: true } },
		},
	});

	if (!payment) {
		throw new AppError(httpStatus.NOT_FOUND, "Payment record not found.");
	}

	if (payment.patientId !== userId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not authorized to pay for this invoice.",
		);
	}

	if (payment.paymentStatus === PaymentStatus.PAID) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This invoice has already been paid.",
		);
	}

	const transactionId = `LD-${payment.invoiceNumber}-${Date.now()}`;

	await prisma.payment.update({
		where: { id: paymentId },
		data: {
			transactionId: transactionId,
			paymentInitiatedAt: new Date(),
		},
	});

	const sslPayload = new URLSearchParams({
		store_id: config.ssl_commerz_store_id as string,
		store_passwd: config.ssl_commerz_store_passwd as string,
		total_amount: payment.totalAmount.toFixed(2),
		currency: payment.currency,
		tran_id: transactionId,
		success_url: `${config.app_url}/api/v1/payment/callback?paymentId=${paymentId}&transactionId=${transactionId}&status=success`,
		fail_url: `${config.app_url}/api/v1/payment/callback?paymentId=${paymentId}&transactionId=${transactionId}&status=fail`,
		cancel_url: `${config.app_url}/api/v1/payment/callback?paymentId=${paymentId}&transactionId=${transactionId}&status=cancel`,
		ipn_url: `${config.app_url}/api/v1/payment/ipn`,
		cus_name: payment.patient.name,
		cus_email: payment.patient.email ?? "",
		cus_add1: "N/A",
		cus_city: "Dhaka",
		cus_state: "Dhaka",
		cus_postcode: "1000",
		cus_country: "Bangladesh",
		cus_phone: "01700000000",
		shipping_method: "NO",
		product_name: `LifeDispatch Invoice #${payment.invoiceNumber}`,
		product_category: "Ambulance Service",
		product_profile: "non-physical-goods",
	});

	//Call SSLCommerz Session API
	const { data } = await axios.post(SSL_SANDBOX_INIT_URL, sslPayload, {
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
	});

	if (!data.GatewayPageURL) {
		throw new AppError(
			httpStatus.BAD_GATEWAY,
			data.failedreason ?? "Failed to initiate payment with SSLCommerz.",
		);
	}

	return { gatewayUrl: data.GatewayPageURL, transactionId };
};

const handleCallback = async (
	paymentId: string,
	transactionId: string,
	status: string,
	body: Record<string, unknown>,
) => {
	console.log("[Payment Callback] Received:", { paymentId, transactionId, status, body });
	const payment = await prisma.payment.findUnique({
		where: { id: paymentId },
	});

	if (!payment) {
		throw new AppError(httpStatus.NOT_FOUND, "Payment record not found.");
	}

	if (payment.transactionId !== transactionId) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Transaction ID mismatch. Possible tampering detected.",
		);
	}

	if (status === "success") {
		const validationId = body.val_id as string;

		if (!validationId) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Validation ID missing from SSLCommerz response.",
			);
		}

		const { data: validationData } = await axios.get(SSL_SANDBOX_VALIDATE_URL, {
			params: {
				val_id: validationId,
				store_id: config.ssl_commerz_store_id,
				store_passwd: config.ssl_commerz_store_passwd,
				format: "json",
			},
		});

		if (
			validationData.status === "VALID" ||
			validationData.status === "VALIDATED"
		) {
			await prisma.payment.update({
				where: { id: paymentId },
				data: {
					paymentStatus: PaymentStatus.PAID,
					paymentMethod: validationData.card_type ?? "Online",
					paymentConfirmedAt: new Date(),
				},
			});
			return { result: "PAID" };
		}

		await prisma.payment.update({
			where: { id: paymentId },
			data: { paymentStatus: PaymentStatus.FAILED },
		});
		return { result: "FAILED" };
	}

	if (status === "fail") {
		await prisma.payment.update({
			where: { id: paymentId },
			data: { paymentStatus: PaymentStatus.FAILED },
		});
		return { result: "FAILED" };
	}

	if (status === "cancel") {
		return { result: "CANCELLED" };
	}

	return { result: "UNKNOWN" };
};

const handleIpn = async (body: Record<string, unknown>) => {
	console.log("[Payment IPN] Received:", body);
	const {
		tran_id: transactionId,
		val_id: validationId,
		status,
	} = body as {
		tran_id: string;
		val_id: string;
		status: string;
	};

	if (!transactionId || !validationId) return;

	const payment = await prisma.payment.findFirst({
		where: { transactionId: transactionId },
	});

	if (!payment || payment.paymentStatus === PaymentStatus.PAID) return;

	if (status === "VALID" || status === "VALIDATED") {
		const { data: validationData } = await axios.get(SSL_SANDBOX_VALIDATE_URL, {
			params: {
				val_id: validationId,
				store_id: config.ssl_commerz_store_id,
				store_passwd: config.ssl_commerz_store_passwd,
				format: "json",
			},
		});

		if (
			validationData.status === "VALID" ||
			validationData.status === "VALIDATED"
		) {
			await prisma.payment.update({
				where: { id: payment.id },
				data: {
					paymentStatus: PaymentStatus.PAID,
					paymentMethod: validationData.card_type ?? "Online",
					paymentConfirmedAt: new Date(),
				},
			});
		}
	} else if (status === "FAILED") {
		await prisma.payment.update({
			where: { id: payment.id },
			data: { paymentStatus: PaymentStatus.FAILED },
		});
	}
};

const getPaymentById = async (paymentId: string, userId: string) => {
	const payment = await prisma.payment.findUnique({
		where: { id: paymentId },
		include: {
			trip: { select: { id: true, status: true } },
			patient: { select: { id: true, name: true, email: true } },
		},
	});

	if (!payment) {
		throw new AppError(httpStatus.NOT_FOUND, "Payment record not found.");
	}

	if (payment.patientId !== userId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not authorized to view this payment.",
		);
	}

	return payment;
};

export const paymentService = {
	initiatePayment,
	handleCallback,
	handleIpn,
	getPaymentById,
};
