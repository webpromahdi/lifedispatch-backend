import httpStatus from "http-status";
import {
	AmbulanceStatus,
	DispatchStatus,
	EmergencyStatus,
	TripStatus,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type {
	IAmbulanceCandidate,
	ICancelDispatchPayload,
	ICreateDispatchPayload,
	IRejectDispatchPayload,
} from "./dispatch.interface.js";

/** How many minutes a driver has to accept a dispatch before it times out. */
const dispatchTimeoutMinutes = 2;

/** weights for the scoring algorithm (must sum to 1.0). */
const weights = {
	distance: 0.5,
	priority: 0.3,
	type: 0.2,
};

const capabilityTypeMap: Record<string, string[]> = {
	ALS: ["ADVANCED_LIFE_SUPPORT"],
	BLS: ["BASIC_LIFE_SUPPORT", "PATIENT_TRANSPORT"],
	NEONATAL: ["NEONATAL"],
	BARIATRIC: ["BARIATRIC"],
};

function haversineKm(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const R = 6371;
	const TO_RAD = Math.PI / 180;

	const radLat1 = lat1 * TO_RAD;
	const radLat2 = lat2 * TO_RAD;

	const dLat = (lat2 - lat1) * TO_RAD;
	const dLng = (lng2 - lng1) * TO_RAD;

	const angularRatio =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(radLat1) * Math.cos(radLat2) * Math.sin(dLng / 2) ** 2;

	const centralAngle =
		2 * Math.atan2(Math.sqrt(angularRatio), Math.sqrt(1 - angularRatio));

	return R * centralAngle;
}

// ─── Scoring helpers
/**
 * Priority score: how well the ambulance capability matches the emergency.
 * ALS emergency → ALS = 1.0, BLS = 0.3
 * BLS/non-urgent → BLS = 1.0, ALS = 0.8 (overkill)
 */
function computePriorityScore(
	requiredCapability: string,
	ambulanceType: string,
): number {
	const idealTypes = capabilityTypeMap[requiredCapability] ?? [];
	if (idealTypes.includes(ambulanceType)) return 1.0;

	if (ambulanceType === "ADVANCED_LIFE_SUPPORT") return 0.8;
	return 0.5;
}

/**
 * Type score: exact type match vs. acceptable mismatch.
 * Underqualified ambulances are already filtered out before scoring.
 */
function computeTypeScore(
	requiredCapability: string,
	ambulanceType: string,
): number {
	const idealTypes = capabilityTypeMap[requiredCapability] ?? [];
	if (idealTypes.includes(ambulanceType)) return 1.0;
	// Overqualified
	return 0.8;
}

const recommendAmbulances = async (
	emergencyId: string,
): Promise<IAmbulanceCandidate[]> => {
	const emergency = await prisma.emergencyRequest.findUnique({
		where: { id: emergencyId },
	});

	if (!emergency) {
		throw new AppError(httpStatus.NOT_FOUND, "Emergency request not found.");
	}

	if (
		emergency.status === EmergencyStatus.CANCELLED ||
		emergency.status === EmergencyStatus.COMPLETED
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Cannot dispatch to a ${emergency.status.toLowerCase()} emergency.`,
		);
	}

	if (
		emergency.status !== EmergencyStatus.PRIORITIZED &&
		emergency.status !== EmergencyStatus.DISPATCHING
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Emergency must be in PRIORITIZED or DISPATCHING status to run recommendations. Current status: ${emergency.status}.`,
		);
	}

	const availableAmbulances = await prisma.ambulance.findMany({
		where: {
			status: AmbulanceStatus.AVAILABLE,
			deletedAt: null,
			driver: {
				isOnShift: true,
			},
		},
		include: {
			driver: {
				include: {
					user: {
						select: {
							id: true,
							name: true,
						},
					},
				},
			},
		},
	});

	const emergencyLat = Number(emergency.locationLat);
	const emergencyLng = Number(emergency.locationLng);
	const requiredCapability = emergency.requiredCapability;

	const eligible = availableAmbulances.filter((amb) => {
		if (!amb.driver) return false;

		const requiredCapabilityStr = String(requiredCapability);

		const idealTypes = capabilityTypeMap[requiredCapabilityStr] ?? [];
		const overqualifiedTypes = ["ADVANCED_LIFE_SUPPORT"];

		const typeOk =
			idealTypes.includes(amb.type) || overqualifiedTypes.includes(amb.type);

		return typeOk;
	});

	if (eligible.length === 0) {
		return [];
	}

	const withDistance = eligible.map((amb) => {
		const ambLat = Number(amb.currentLat ?? amb.baseLocationLat);
		const ambLng = Number(amb.currentLng ?? amb.baseLocationLng);
		const distanceKm = haversineKm(ambLat, ambLng, emergencyLat, emergencyLng);
		return { amb, distanceKm };
	});

	const maxDistance = Math.max(...withDistance.map((w) => w.distanceKm), 1);

	const scored: IAmbulanceCandidate[] = withDistance.map(
		({ amb, distanceKm }) => {
			const distanceScore = 1 - distanceKm / maxDistance;
			const priorityScore = computePriorityScore(
				String(requiredCapability),
				amb.type,
			);
			const typeScore = computeTypeScore(String(requiredCapability), amb.type);

			const score =
				weights.distance * distanceScore +
				weights.priority * priorityScore +
				weights.type * typeScore;

			return {
				ambulanceId: amb.id,
				registrationNumber: amb.registrationNumber,
				type: amb.type,
				capabilities: amb.capabilities,
				driverId: amb.driver!.id,
				driverName: amb.driver!.user.name,
				driverCertificationLevel: amb.driver!.certificationLevel,
				distanceKm: Math.round(distanceKm * 100) / 100,
				score: Math.round(score * 10000) / 10000,
				scoreBreakdown: {
					distanceScore: Math.round(distanceScore * 10000) / 10000,
					priorityScore,
					typeScore,
				},
			};
		},
	);

	return scored.sort((a, b) => b.score - a.score).slice(0, 5);
};

const createDispatch = async (
	payload: ICreateDispatchPayload,
	dispatcherId: string,
	dispatcherRole: string,
) => {
	const { emergencyId, ambulanceId } = payload;

	const emergency = await prisma.emergencyRequest.findUnique({
		where: { id: emergencyId },
	});

	if (!emergency) {
		throw new AppError(httpStatus.NOT_FOUND, "Emergency request not found.");
	}

	if (
		emergency.status !== EmergencyStatus.PRIORITIZED &&
		emergency.status !== EmergencyStatus.DISPATCHING
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Emergency must be in PRIORITIZED or DISPATCHING status to dispatch. Current: ${emergency.status}.`,
		);
	}

	const ambulance = await prisma.ambulance.findUnique({
		where: { id: ambulanceId, deletedAt: null },
		include: {
			driver: {
				include: {
					user: {
						select: { id: true, name: true, phone: true },
					},
				},
			},
		},
	});

	if (!ambulance) {
		throw new AppError(httpStatus.NOT_FOUND, "Ambulance not found.");
	}

	if (ambulance.status !== AmbulanceStatus.AVAILABLE) {
		throw new AppError(
			httpStatus.CONFLICT,
			`Ambulance is not available. Current status: ${ambulance.status}.`,
		);
	}

	if (!ambulance.driver?.isOnShift) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This ambulance has no assigned on-shift driver.",
		);
	}

	const requiredCapability = String(emergency.requiredCapability);
	const idealTypes = capabilityTypeMap[requiredCapability] ?? [];
	const overqualifiedTypes = ["ADVANCED_LIFE_SUPPORT"];
	const capabilityOk =
		idealTypes.includes(ambulance.type) ||
		overqualifiedTypes.includes(ambulance.type);

	if (!capabilityOk) {
		throw new AppError(
			httpStatus.UNPROCESSABLE_ENTITY,
			`Ambulance type "${ambulance.type}" does not meet the required capability "${requiredCapability}" for this emergency.`,
		);
	}

	const currentVersion = ambulance.version;
	const timeoutAt = new Date(Date.now() + dispatchTimeoutMinutes * 60 * 1000);

	const driverId = ambulance.driver?.id as string;

	const result = await prisma.$transaction(async (tx) => {
		// update ONLY if status is still AVAILABLE and version matches
		const updated = await tx.ambulance.updateMany({
			where: {
				id: ambulanceId,
				status: AmbulanceStatus.AVAILABLE,
				version: currentVersion,
				deletedAt: null,
			},
			data: {
				status: AmbulanceStatus.BUSY,
				version: { increment: 1 },
			},
		});

		if (updated.count === 0) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Ambulance was just reserved by another dispatcher. Please select a different unit.",
			);
		}

		// Create the Dispatch record
		const dispatch = await tx.dispatch.create({
			data: {
				emergencyId,
				ambulanceId,
				driverId,
				dispatchedBy: dispatcherId,
				status: DispatchStatus.PENDING_ACCEPTANCE,
				timeoutAt,
			},
			include: {
				ambulance: true,
				driver: {
					include: { user: { select: { id: true, name: true, phone: true } } },
				},
				emergency: {
					select: {
						id: true,
						incidentNumber: true,
						emergencyType: true,
						priority: true,
						locationAddress: true,
						locationLat: true,
						locationLng: true,
					},
				},
			},
		});

		// Move emergency to DISPATCHING
		await tx.emergencyRequest.update({
			where: { id: emergencyId },
			data: { status: EmergencyStatus.DISPATCHING },
		});

		// Append to incident timeline
		await tx.incidentTimeline.create({
			data: {
				emergencyId,
				eventType: "AMBULANCE_DISPATCHED",
				oldValue: emergency.status,
				newValue: EmergencyStatus.DISPATCHING,
				triggeredBy: dispatcherId,
				triggeredByRole: dispatcherRole,
				notes: `Ambulance ${ambulance.registrationNumber} dispatched. Awaiting driver acceptance. Timeout at ${timeoutAt.toISOString()}.`,
			},
		});

		return dispatch;
	});

	return result;
};

const acceptDispatch = async (dispatchId: string, userId: string) => {
	const driver = await prisma.driver.findUnique({
		where: { userId },
	});

	if (!driver) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Driver profile not found for the authenticated user.",
		);
	}

	const dispatch = await prisma.dispatch.findUnique({
		where: { id: dispatchId },
		include: {
			emergency: true,
			ambulance: true,
		},
	});

	if (!dispatch) {
		throw new AppError(httpStatus.NOT_FOUND, "Dispatch record not found.");
	}

	if (dispatch.driverId !== driver.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not the assigned driver for this dispatch.",
		);
	}

	if (dispatch.status !== DispatchStatus.PENDING_ACCEPTANCE) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Cannot accept a dispatch in "${dispatch.status}" status.`,
		);
	}

	if (new Date() > dispatch.timeoutAt) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This dispatch has already timed out. Please contact your dispatcher.",
		);
	}

	const result = await prisma.$transaction(async (tx) => {
		const updatedDispatch = await tx.dispatch.update({
			where: { id: dispatchId },
			data: {
				status: DispatchStatus.ACCEPTED,
				acceptedAt: new Date(),
			},
		});

		const trip = await tx.trip.create({
			data: {
				dispatchId,
				emergencyId: dispatch.emergencyId,
				ambulanceId: dispatch.ambulanceId,
				driverId: dispatch.driverId,
				patientId: dispatch.emergency.patientId,
				status: TripStatus.ACTIVE,
			},
		});

		await tx.emergencyRequest.update({
			where: { id: dispatch.emergencyId },
			data: { status: EmergencyStatus.ACTIVE_TRIP },
		});

		await tx.incidentTimeline.create({
			data: {
				emergencyId: dispatch.emergencyId,
				eventType: "DISPATCH_ACCEPTED",
				oldValue: DispatchStatus.PENDING_ACCEPTANCE,
				newValue: DispatchStatus.ACCEPTED,
				triggeredBy: userId,
				triggeredByRole: "DRIVER",
				notes: `Driver accepted dispatch. Trip ${trip.id} created.`,
			},
		});

		return {
			dispatch: updatedDispatch,
			trip,
			emergency: {
				id: dispatch.emergency.id,
				incidentNumber: dispatch.emergency.incidentNumber,
				emergencyType: dispatch.emergency.emergencyType,
				priority: dispatch.emergency.priority,
				locationAddress: dispatch.emergency.locationAddress,
				locationLat: dispatch.emergency.locationLat,
				locationLng: dispatch.emergency.locationLng,
				description: dispatch.emergency.description,
			},
		};
	});

	return result;
};

const rejectDispatch = async (
	dispatchId: string,
	userId: string,
	payload: IRejectDispatchPayload,
) => {
	const driver = await prisma.driver.findUnique({ where: { userId } });

	if (!driver) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Driver profile not found for the authenticated user.",
		);
	}

	const dispatch = await prisma.dispatch.findUnique({
		where: { id: dispatchId },
		include: { emergency: true },
	});

	if (!dispatch) {
		throw new AppError(httpStatus.NOT_FOUND, "Dispatch record not found.");
	}

	if (dispatch.driverId !== driver.id) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You are not the assigned driver for this dispatch.",
		);
	}

	if (dispatch.status !== DispatchStatus.PENDING_ACCEPTANCE) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Cannot reject a dispatch in "${dispatch.status}" status.`,
		);
	}

	const result = await prisma.$transaction(async (tx) => {
		const updatedDispatch = await tx.dispatch.update({
			where: { id: dispatchId },
			data: {
				status: DispatchStatus.REJECTED,
				rejectionReason: payload.reason,
				rejectedAt: new Date(),
			},
		});

		await tx.ambulance.update({
			where: { id: dispatch.ambulanceId },
			data: { status: AmbulanceStatus.AVAILABLE },
		});

		await tx.emergencyRequest.update({
			where: { id: dispatch.emergencyId },
			data: { status: EmergencyStatus.DISPATCHING },
		});

		await tx.incidentTimeline.create({
			data: {
				emergencyId: dispatch.emergencyId,
				eventType: "DISPATCH_REJECTED",
				oldValue: DispatchStatus.PENDING_ACCEPTANCE,
				newValue: DispatchStatus.REJECTED,
				triggeredBy: userId,
				triggeredByRole: "DRIVER",
				notes: `Driver rejected dispatch. Reason: ${payload.reason}`,
			},
		});

		return updatedDispatch;
	});

	return result;
};

const cancelDispatch = async (
	dispatchId: string,
	userId: string,
	userRole: string,
	payload: ICancelDispatchPayload,
) => {
	const dispatch = await prisma.dispatch.findUnique({
		where: { id: dispatchId },
		include: { emergency: true },
	});

	if (!dispatch) {
		throw new AppError(httpStatus.NOT_FOUND, "Dispatch record not found.");
	}

	if (dispatch.status !== DispatchStatus.PENDING_ACCEPTANCE) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Can only cancel a dispatch that is in PENDING_ACCEPTANCE status. Current status: "${dispatch.status}".`,
		);
	}

	const result = await prisma.$transaction(async (tx) => {
		const updatedDispatch = await tx.dispatch.update({
			where: { id: dispatchId },
			data: { status: DispatchStatus.CANCELLED },
		});

		await tx.ambulance.update({
			where: { id: dispatch.ambulanceId },
			data: { status: AmbulanceStatus.AVAILABLE },
		});

		await tx.emergencyRequest.update({
			where: { id: dispatch.emergencyId },
			data: { status: EmergencyStatus.DISPATCHING },
		});

		await tx.incidentTimeline.create({
			data: {
				emergencyId: dispatch.emergencyId,
				eventType: "DISPATCH_CANCELLED",
				oldValue: DispatchStatus.PENDING_ACCEPTANCE,
				newValue: DispatchStatus.CANCELLED,
				triggeredBy: userId,
				triggeredByRole: userRole,
				notes: `Dispatch cancelled by ${userRole}. Reason: ${payload.reason}`,
			},
		});

		return updatedDispatch;
	});

	return result;
};

export const dispatchService = {
	recommendAmbulances,
	createDispatch,
	acceptDispatch,
	rejectDispatch,
	cancelDispatch,
};
