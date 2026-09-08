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

// ─── Constants ───────────────────────────────────────────────────────────────

/** How many minutes a driver has to accept a dispatch before it times out. */
const DISPATCH_TIMEOUT_MINUTES = 2;

/** Weights for the scoring algorithm (must sum to 1.0). */
const WEIGHTS = {
	distance: 0.5,
	priority: 0.3,
	type: 0.2,
};

/** Capability → ambulance type compatibility map.
 *  Key = RequiredCapability, Value = ideal AmbulanceType(s) */
const CAPABILITY_TYPE_MAP: Record<string, string[]> = {
	ALS: ["ADVANCED_LIFE_SUPPORT"],
	BLS: ["BASIC_LIFE_SUPPORT", "PATIENT_TRANSPORT"],
	NEONATAL: ["NEONATAL"],
	BARIATRIC: ["BARIATRIC"],
};

// ─── Haversine distance ───────────────────────────────────────────────────────

function haversineKm(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number,
): number {
	const R = 6371; // Earth radius in km
	const dLat = ((lat2 - lat1) * Math.PI) / 180;
	const dLng = ((lng2 - lng1) * Math.PI) / 180;
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos((lat1 * Math.PI) / 180) *
			Math.cos((lat2 * Math.PI) / 180) *
			Math.sin(dLng / 2) ** 2;
	return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Scoring helpers ──────────────────────────────────────────────────────────

/**
 * Priority score: how well the ambulance capability matches the emergency.
 * ALS emergency → ALS = 1.0, BLS = 0.3
 * BLS/non-urgent → BLS = 1.0, ALS = 0.8 (overkill)
 */
function computePriorityScore(
	requiredCapability: string,
	ambulanceType: string,
): number {
	const idealTypes = CAPABILITY_TYPE_MAP[requiredCapability] ?? [];
	if (idealTypes.includes(ambulanceType)) return 1.0;
	// ALS ambulance handling a BLS call — over-qualified but acceptable
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
	const idealTypes = CAPABILITY_TYPE_MAP[requiredCapability] ?? [];
	if (idealTypes.includes(ambulanceType)) return 1.0;
	// Overqualified
	return 0.8;
}

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Step 1: Validate the emergency is in a dispatchable state.
 * Step 2: Fetch all AVAILABLE ambulances with an ON_SHIFT driver assigned.
 * Step 3: Filter by capability match.
 * Step 4: Score and rank candidates.
 * Returns top 5 candidates.
 */
const recommendAmbulances = async (
	emergencyId: string,
): Promise<IAmbulanceCandidate[]> => {
	// 1. Fetch emergency
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

	// 2. Fetch available ambulances that have an on-shift driver
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

	// 3. Filter by capability match
	const eligible = availableAmbulances.filter((amb) => {
		if (!amb.driver) return false;

		// Must have the required capability (e.g. "ALS", "BLS", etc.)
		const requiredStr = String(requiredCapability);

		// The ambulance capabilities array stores strings.
		// We also ensure the ambulance type isn't completely wrong.
		const idealTypes = CAPABILITY_TYPE_MAP[requiredStr] ?? [];
		const overqualifiedTypes = ["ADVANCED_LIFE_SUPPORT"]; // ALS can handle BLS calls

		const typeOk =
			idealTypes.includes(amb.type) || overqualifiedTypes.includes(amb.type);

		return typeOk;
	});

	if (eligible.length === 0) {
		return [];
	}

	// 4. Compute distances and find max for normalization
	const withDistance = eligible.map((amb) => {
		const ambLat = Number(amb.currentLat ?? amb.baseLocationLat);
		const ambLng = Number(amb.currentLng ?? amb.baseLocationLng);
		const distanceKm = haversineKm(ambLat, ambLng, emergencyLat, emergencyLng);
		return { amb, distanceKm };
	});

	const maxDistance = Math.max(...withDistance.map((w) => w.distanceKm), 1);

	// 5. Score and rank
	const scored: IAmbulanceCandidate[] = withDistance.map(
		({ amb, distanceKm }) => {
			const distanceScore = 1 - distanceKm / maxDistance;
			const priorityScore = computePriorityScore(
				String(requiredCapability),
				amb.type,
			);
			const typeScore = computeTypeScore(String(requiredCapability), amb.type);

			const score =
				WEIGHTS.distance * distanceScore +
				WEIGHTS.priority * priorityScore +
				WEIGHTS.type * typeScore;

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

	// Sort descending by score, return top 5
	return scored.sort((a, b) => b.score - a.score).slice(0, 5);
};

/**
 * Atomically assigns an ambulance to an emergency using optimistic locking.
 * Uses the ambulance `version` field to prevent duplicate dispatch.
 *
 * Flow:
 * 1. Validate emergency state
 * 2. Validate ambulance is AVAILABLE with an on-shift driver
 * 3. Within a transaction: update ambulance with version check → create Dispatch
 *    → update Emergency status → append IncidentTimeline
 * 4. If 0 rows affected by the ambulance update → 409 Conflict
 */
const createDispatch = async (
	payload: ICreateDispatchPayload,
	dispatcherId: string,
	dispatcherRole: string,
) => {
	const { emergencyId, ambulanceId } = payload;

	// 1. Fetch emergency
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

	// 2. Fetch ambulance with its current driver
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

	if (!ambulance.driver || !ambulance.driver.isOnShift) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This ambulance has no assigned on-shift driver.",
		);
	}

	// 3. Capability check
	const requiredCapability = String(emergency.requiredCapability);
	const idealTypes = CAPABILITY_TYPE_MAP[requiredCapability] ?? [];
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
	const timeoutAt = new Date(
		Date.now() + DISPATCH_TIMEOUT_MINUTES * 60 * 1000,
	);

	// 4. Atomic dispatch inside a transaction
	const result = await prisma.$transaction(async (tx) => {
		// Optimistic lock: update ONLY if status is still AVAILABLE and version matches
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
				driverId: ambulance.driver!.id,
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

/**
 * Driver accepts the dispatch assigned to them.
 *
 * Flow:
 * 1. Verify the calling driver owns this dispatch
 * 2. Verify dispatch is PENDING_ACCEPTANCE and not timed out
 * 3. Transition: Dispatch → ACCEPTED, Emergency → ACTIVE_TRIP
 * 4. Create Trip record
 * 5. Append IncidentTimeline
 */
const acceptDispatch = async (dispatchId: string, userId: string) => {
	// Find the driver profile for the current user
	const driver = await prisma.driver.findUnique({
		where: { userId },
	});

	if (!driver) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Driver profile not found for the authenticated user.",
		);
	}

	// Fetch dispatch
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

	// Ownership check
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

	// Timeout check
	if (new Date() > dispatch.timeoutAt) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"This dispatch has already timed out. Please contact your dispatcher.",
		);
	}

	const result = await prisma.$transaction(async (tx) => {
		// Update dispatch
		const updatedDispatch = await tx.dispatch.update({
			where: { id: dispatchId },
			data: {
				status: DispatchStatus.ACCEPTED,
				acceptedAt: new Date(),
			},
		});

		// Create Trip record
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

		// Move emergency to ACTIVE_TRIP
		await tx.emergencyRequest.update({
			where: { id: dispatch.emergencyId },
			data: { status: EmergencyStatus.ACTIVE_TRIP },
		});

		// Append timeline
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

/**
 * Driver rejects the dispatch assigned to them.
 *
 * Flow:
 * 1. Verify ownership + status PENDING_ACCEPTANCE
 * 2. Dispatch → REJECTED, Ambulance → AVAILABLE (version unchanged, just status reset)
 * 3. Emergency reverts to DISPATCHING (so dispatcher can reassign)
 * 4. Append IncidentTimeline
 */
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
		// Mark dispatch as rejected
		const updatedDispatch = await tx.dispatch.update({
			where: { id: dispatchId },
			data: {
				status: DispatchStatus.REJECTED,
				rejectionReason: payload.reason,
				rejectedAt: new Date(),
			},
		});

		// Return ambulance to available pool
		await tx.ambulance.update({
			where: { id: dispatch.ambulanceId },
			data: { status: AmbulanceStatus.AVAILABLE },
		});

		// Keep emergency in DISPATCHING so dispatcher can reassign
		await tx.emergencyRequest.update({
			where: { id: dispatch.emergencyId },
			data: { status: EmergencyStatus.DISPATCHING },
		});

		// Append timeline
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

/**
 * Dispatcher or Admin cancels an active dispatch.
 *
 * Cancellable states: PENDING_ACCEPTANCE (before driver responds).
 * After acceptance, use trip cancellation instead.
 *
 * Flow:
 * 1. Verify dispatch is PENDING_ACCEPTANCE
 * 2. Dispatch → CANCELLED, Ambulance → AVAILABLE
 * 3. Emergency reverts to DISPATCHING
 * 4. Append IncidentTimeline
 */
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

		// Return ambulance to pool
		await tx.ambulance.update({
			where: { id: dispatch.ambulanceId },
			data: { status: AmbulanceStatus.AVAILABLE },
		});

		// Revert emergency to DISPATCHING so dispatcher can reassign
		await tx.emergencyRequest.update({
			where: { id: dispatch.emergencyId },
			data: { status: EmergencyStatus.DISPATCHING },
		});

		// Append timeline
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
