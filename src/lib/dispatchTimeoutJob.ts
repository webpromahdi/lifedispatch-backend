import { AmbulanceStatus, DispatchStatus, EmergencyStatus } from "../../generated/prisma/enums.js";
import { prisma } from "./prisma.js";

/**
 * Interval between timeout-sweep runs (milliseconds).
 * 30 seconds is aggressive enough to bound the window where a timed-out
 * dispatch continues to hold an ambulance BUSY.
 */
const SWEEP_INTERVAL_MS = 30_000;

/**
 * sweepTimedOutDispatches
 *
 * Finds every Dispatch that is still in PENDING_ACCEPTANCE and whose
 * timeoutAt has passed. For each one it atomically:
 *   1. Marks the Dispatch → TIMED_OUT
 *   2. Releases the Ambulance → AVAILABLE
 *   3. Transitions the Emergency → REASSIGNMENT_REQUIRED
 *   4. Appends a DISPATCH_TIMED_OUT IncidentTimeline event
 *
 * All four writes happen inside a single Prisma transaction so the DB
 * never ends up in a partial state.
 */
async function sweepTimedOutDispatches(): Promise<void> {
	const now = new Date();

	// Find all candidates in one query — avoids N+1 per dispatch.
	const timedOutDispatches = await prisma.dispatch.findMany({
		where: {
			status: DispatchStatus.PENDING_ACCEPTANCE,
			timeoutAt: { lt: now },
		},
		select: {
			id: true,
			ambulanceId: true,
			emergencyId: true,
			driverId: true,
			timeoutAt: true,
		},
	});

	if (timedOutDispatches.length === 0) {
		return;
	}

	console.log(
		`[DispatchTimeoutJob] Found ${timedOutDispatches.length} timed-out dispatch(es). Processing…`,
	);

	// Process each stale dispatch in its own transaction so one failure
	// doesn't roll back the others.
	for (const dispatch of timedOutDispatches) {
		try {
			await prisma.$transaction(async (tx) => {
				// 1. Mark dispatch TIMED_OUT
				await tx.dispatch.update({
					where: { id: dispatch.id },
					data: {
						status: DispatchStatus.TIMED_OUT,
					},
				});

				// 2. Release ambulance back to AVAILABLE
				await tx.ambulance.update({
					where: { id: dispatch.ambulanceId },
					data: { status: AmbulanceStatus.AVAILABLE },
				});

				// 3. Transition emergency to REASSIGNMENT_REQUIRED
				await tx.emergencyRequest.update({
					where: { id: dispatch.emergencyId },
					data: { status: EmergencyStatus.REASSIGNMENT_REQUIRED },
				});

				// 4. Append immutable timeline event
				await tx.incidentTimeline.create({
					data: {
						emergencyId: dispatch.emergencyId,
						eventType: "DISPATCH_TIMED_OUT",
						oldValue: DispatchStatus.PENDING_ACCEPTANCE,
						newValue: DispatchStatus.TIMED_OUT,
						triggeredBy: dispatch.driverId,
						triggeredByRole: "SYSTEM",
						notes: `Dispatch timed out at ${dispatch.timeoutAt.toISOString()}. Ambulance released. Emergency moved to REASSIGNMENT_REQUIRED.`,
					},
				});
			});

			console.log(
				`[DispatchTimeoutJob] Dispatch ${dispatch.id} → TIMED_OUT | Ambulance ${dispatch.ambulanceId} → AVAILABLE | Emergency ${dispatch.emergencyId} → REASSIGNMENT_REQUIRED`,
			);
		} catch (err) {
			// Log but don't crash the job — next sweep will retry any that fail.
			console.error(
				`[DispatchTimeoutJob] Failed to process dispatch ${dispatch.id}:`,
				err,
			);
		}
	}
}

/**
 * startDispatchTimeoutJob
 *
 * Kicks off the recurring sweep and returns a handle so the caller can
 * clear the interval during graceful shutdown.
 */
export function startDispatchTimeoutJob(): ReturnType<typeof setInterval> {
	console.log(
		`[DispatchTimeoutJob] Started. Sweeping every ${SWEEP_INTERVAL_MS / 1000}s.`,
	);

	// Run once immediately so the first sweep doesn't wait a full interval
	// after server start (catches any leftovers from a restart mid-timeout).
	sweepTimedOutDispatches().catch((err) =>
		console.error("[DispatchTimeoutJob] Initial sweep error:", err),
	);

	return setInterval(() => {
		sweepTimedOutDispatches().catch((err) =>
			console.error("[DispatchTimeoutJob] Sweep error:", err),
		);
	}, SWEEP_INTERVAL_MS);
}
