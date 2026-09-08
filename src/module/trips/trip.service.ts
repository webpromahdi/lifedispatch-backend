import httpStatus from "http-status";
import PDFDocument from "pdfkit";
import {
	AmbulanceStatus,
	DispatchStatus,
	EmergencyStatus,
	TripStatus,
	UserRole,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type {
	ICompleteTripPayload,
	ISelectHospitalPayload,
	IUpdateTripStatusPayload,
} from "./trip.interface.js";

const FARE_BASE_USD = 50;
const FARE_PER_KM_USD = 3.5;

function generateInvoiceNumber(): string {
	const timestamp = Date.now().toString(36).toUpperCase();
	const random = Math.random().toString(36).substring(2, 6).toUpperCase();
	return `INV-${timestamp}-${random}`;
}

function generateInvoicePDF(
	payment: {
		invoiceNumber: string;
		patientId: string;
		tripId: string;
		baseFare: number;
		distanceCharge: number;
		totalAmount: number;
	},
	trip: { distanceKm: number | null },
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const doc = new PDFDocument({ margin: 50 });
		const buffers: Buffer[] = [];

		doc.on("data", buffers.push.bind(buffers));
		doc.on("end", () => resolve(Buffer.concat(buffers)));
		doc.on("error", reject);

		// Header
		doc
			.fontSize(20)
			.text(`INVOICE: ${payment.invoiceNumber}`, { align: "center" });
		doc.moveDown();

		// Trip details
		doc.fontSize(12).text(`Date: ${new Date().toLocaleDateString()}`);
		doc.text(`Patient ID: ${payment.patientId}`);
		doc.text(`Trip ID:    ${payment.tripId}`);
		doc.moveDown();

		// Line items
		doc.text("-------------------------------------------");
		doc.text(`Base Fare:          $${payment.baseFare.toFixed(2)}`);
		doc.text(`Distance Charges:   $${payment.distanceCharge.toFixed(2)}`);
		doc.text(`Total Distance:     ${trip.distanceKm ?? 0} km`);
		doc.text("-------------------------------------------");
		doc
			.fontSize(14)
			.font("Helvetica-Bold")
			.text(`Total Amount Due: $${payment.totalAmount.toFixed(2)}`);
		doc.font("Helvetica"); // reset font

		// Footer disclaimer
		doc.moveDown(2);
		doc
			.fontSize(8)
			.text(
				"This is for informational purposes only. For medical advice or diagnosis, consult a professional.",
				{ align: "center" },
			);

		doc.end();
	});
}

const getTripById = async (
	tripId: string,
	userId: string,
	userRole: string,
) => {
	const trip = await prisma.trip.findUnique({
		where: { id: tripId },
		include: {
			dispatch: {
				select: {
					id: true,
					status: true,
					dispatchedBy: true,
					timeoutAt: true,
					acceptedAt: true,
				},
			},
			emergency: {
				select: {
					id: true,
					incidentNumber: true,
					emergencyType: true,
					priority: true,
					status: true,
					locationAddress: true,
					locationLat: true,
					locationLng: true,
					description: true,
				},
			},
			ambulance: {
				select: {
					id: true,
					registrationNumber: true,
					type: true,
					capabilities: true,
				},
			},
			driver: {
				select: {
					id: true,
					userId: true,
					certificationLevel: true,
					user: { select: { id: true, name: true, phone: true } },
				},
			},
			patient: {
				select: { id: true, name: true, phone: true, email: true },
			},
			hospital: {
				select: { id: true, name: true, address: true, phone: true },
			},
			payment: {
				select: {
					id: true,
					invoiceNumber: true,
					totalAmount: true,
					paymentStatus: true,
					currency: true,
				},
			},
		},
	});

	if (!trip) {
		throw new AppError(httpStatus.NOT_FOUND, "Trip not found.");
	}

	if (userRole === UserRole.DRIVER) {
		const driver = await prisma.driver.findUnique({ where: { userId } });
		if (!driver || trip.driverId !== driver.id) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not the assigned driver for this trip.",
			);
		}
	}

	if (userRole === UserRole.PATIENT) {
		if (trip.patientId !== userId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not the patient for this trip.",
			);
		}
	}

	return trip;
};

const updateTripStatus = async (
	tripId: string,
	userId: string,
	payload: IUpdateTripStatusPayload,
) => {
	const driver = await prisma.driver.findUnique({ where: { userId } });

	if (!driver) {
		throw new AppError(httpStatus.NOT_FOUND, "Driver profile not found.");
	}

	const trip = await prisma.trip.findUnique({
		where: { id: tripId },
		include: { emergency: true },
	});

	if (!trip) {
		throw new AppError(httpStatus.NOT_FOUND, "Trip not found.");
	}

	if (trip.driverId !== driver.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not the assigned driver for this trip.",
		);
	}

	if (trip.status !== TripStatus.ACTIVE) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Cannot update status of a trip that is already ${trip.status}.`,
		);
	}

	const requestedStatus = payload.status as TripStatus;

	if (requestedStatus === TripStatus.COMPLETED) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Use POST /trips/:id/complete to complete a trip.",
		);
	}

	const now = new Date();
	const updateData: Record<string, unknown> = { status: requestedStatus };

	if (requestedStatus === TripStatus.CANCELLED) {
		updateData.completedAt = now;
	}

	const result = await prisma.$transaction(async (tx) => {
		const updatedTrip = await tx.trip.update({
			where: { id: tripId },
			data: updateData,
		});

		if (requestedStatus === TripStatus.CANCELLED) {
			await tx.dispatch.update({
				where: { id: trip.dispatchId },
				data: { status: DispatchStatus.COMPLETED },
			});

			await tx.ambulance.update({
				where: { id: trip.ambulanceId },
				data: { status: AmbulanceStatus.AVAILABLE },
			});

			await tx.emergencyRequest.update({
				where: { id: trip.emergencyId },
				data: { status: EmergencyStatus.CANCELLED },
			});

			await tx.incidentTimeline.create({
				data: {
					emergencyId: trip.emergencyId,
					eventType: "TRIP_CANCELLED",
					oldValue: TripStatus.ACTIVE,
					newValue: TripStatus.CANCELLED,
					triggeredBy: userId,
					triggeredByRole: UserRole.DRIVER,
					notes: `Trip cancelled by driver.`,
				},
			});
		}

		return updatedTrip;
	});

	return result;
};

const selectHospital = async (
	tripId: string,
	userId: string,
	userRole: string,
	payload: ISelectHospitalPayload,
) => {
	const trip = await prisma.trip.findUnique({
		where: { id: tripId },
		include: { emergency: true },
	});

	if (!trip) {
		throw new AppError(httpStatus.NOT_FOUND, "Trip not found.");
	}

	if (trip.status !== TripStatus.ACTIVE) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Cannot select hospital for a trip that is ${trip.status}.`,
		);
	}

	if (userRole === UserRole.DRIVER) {
		const driver = await prisma.driver.findUnique({ where: { userId } });
		if (!driver || trip.driverId !== driver.id) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You are not the assigned driver for this trip.",
			);
		}
	}

	const hospital = await prisma.hospital.findUnique({
		where: { id: payload.hospitalId },
	});

	if (!hospital) {
		throw new AppError(httpStatus.NOT_FOUND, "Hospital not found.");
	}

	const updatedTrip = await prisma.$transaction(async (tx) => {
		const updated = await tx.trip.update({
			where: { id: tripId },
			data: {
				hospitalId: payload.hospitalId,
				hospitalSelectedAt: new Date(),
			},
			include: {
				hospital: { select: { id: true, name: true, address: true } },
			},
		});

		await tx.incidentTimeline.create({
			data: {
				emergencyId: trip.emergencyId,
				eventType: "HOSPITAL_SELECTED",
				oldValue: trip.hospitalId ?? "NONE",
				newValue: hospital.name,
				triggeredBy: userId,
				triggeredByRole: userRole,
				notes: `Destination hospital set to "${hospital.name}".`,
			},
		});

		return updated;
	});

	return updatedTrip;
};

const completeTrip = async (
	tripId: string,
	userId: string,
	payload: ICompleteTripPayload,
) => {
	const driver = await prisma.driver.findUnique({ where: { userId } });

	if (!driver) {
		throw new AppError(httpStatus.NOT_FOUND, "Driver profile not found.");
	}

	const trip = await prisma.trip.findUnique({
		where: { id: tripId },
		include: {
			emergency: true,
			payment: true,
		},
	});

	if (!trip) {
		throw new AppError(httpStatus.NOT_FOUND, "Trip not found.");
	}

	if (trip.driverId !== driver.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not the assigned driver for this trip.",
		);
	}

	if (trip.status !== TripStatus.ACTIVE) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Cannot complete a trip that is already ${trip.status}.`,
		);
	}

	if (trip.payment) {
		throw new AppError(
			httpStatus.CONFLICT,
			"An invoice for this trip already exists.",
		);
	}

	const distanceKm = payload.distanceKm;
	const baseFare = FARE_BASE_USD;
	const distanceCharge = Math.round(distanceKm * FARE_PER_KM_USD * 100) / 100;
	const totalAmount = Math.round((baseFare + distanceCharge) * 100) / 100;

	const now = new Date();
	const arrivedAt = payload.arrivedAtHospitalAt
		? new Date(payload.arrivedAtHospitalAt)
		: now;

	const result = await prisma.$transaction(async (tx) => {
		const completedTrip = await tx.trip.update({
			where: { id: tripId },
			data: {
				status: TripStatus.COMPLETED,
				distanceKm: distanceKm,
				arrivedAtHospitalAt: arrivedAt,
				completedAt: now,
			},
		});

		await tx.dispatch.update({
			where: { id: trip.dispatchId },
			data: { status: DispatchStatus.COMPLETED },
		});

		await tx.ambulance.update({
			where: { id: trip.ambulanceId },
			data: { status: AmbulanceStatus.AVAILABLE },
		});

		const responseTimeMinutes = trip.emergency.createdAt
			? Math.round(
					((now.getTime() - trip.emergency.createdAt.getTime()) / 60000) * 100,
				) / 100
			: null;

		await tx.emergencyRequest.update({
			where: { id: trip.emergencyId },
			data: {
				status: EmergencyStatus.COMPLETED,
				...(responseTimeMinutes !== null && { responseTimeMinutes }),
			},
		});

		const invoiceNumber = generateInvoiceNumber();

		const payment = await tx.payment.create({
			data: {
				tripId,
				patientId: trip.patientId,
				invoiceNumber,
				baseFare,
				distanceCharge,
				totalAmount,
				currency: "USD",
			},
		});

		await tx.incidentTimeline.create({
			data: {
				emergencyId: trip.emergencyId,
				eventType: "TRIP_COMPLETED",
				oldValue: TripStatus.ACTIVE,
				newValue: TripStatus.COMPLETED,
				triggeredBy: userId,
				triggeredByRole: UserRole.DRIVER,
				notes: `Trip completed. Distance: ${distanceKm} km. Invoice ${invoiceNumber} generated. Total: $${totalAmount}.`,
			},
		});

		return { trip: completedTrip, payment };
	});

	// Generate PDF invoice in-memory after the DB transaction succeeds
	const invoicePdf = await generateInvoicePDF(
		{
			invoiceNumber: result.payment.invoiceNumber,
			patientId: result.payment.patientId,
			tripId: result.payment.tripId,
			baseFare: result.payment.baseFare.toNumber(),
			distanceCharge: result.payment.distanceCharge.toNumber(),
			totalAmount: result.payment.totalAmount.toNumber(),
		},
		{ distanceKm: result.trip.distanceKm?.toNumber() ?? null },
	);

	return { ...result, invoicePdf };
};

export const tripService = {
	getTripById,
	updateTripStatus,
	selectHospital,
	completeTrip,
};
