import httpStatus from "http-status";
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
	ISelectHospitalPayload,
	IUpdateTripStatusPayload,
} from "./trip.interface.js";

// const FARE_BASE_USD = 50;
// const FARE_PER_KM_USD = 3.5;

// function generateInvoiceNumber(): string {
// 	const timestamp = Date.now().toString(36).toUpperCase();
// 	const random = Math.random().toString(36).substring(2, 6).toUpperCase();
// 	return `INV-${timestamp}-${random}`;
// }

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

export const tripService = {
	getTripById,
	updateTripStatus,
	selectHospital,
};
