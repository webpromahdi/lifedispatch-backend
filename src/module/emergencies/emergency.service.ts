import httpStatus from "http-status";
import { EmergencyStatus, UserRole } from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type { ICreateEmergencyPayload } from "./emergency.interface.js";

const BLOCKING_STATUSES: EmergencyStatus[] = [
	EmergencyStatus.PENDING,
	EmergencyStatus.PRIORITIZED,
	EmergencyStatus.DISPATCHING,
	EmergencyStatus.ACTIVE_TRIP,
];

const generateIncidentNumber = async (): Promise<string> => {
	const year = new Date().getFullYear();
	const count = await prisma.emergencyRequest.count();
	const padded = String(count + 1).padStart(6, "0");
	return `INC-${year}-${padded}`;
};

const createEmergencyIntoDB = async (
	payload: ICreateEmergencyPayload,
	patientId: string,
) => {
	const existingActive = await prisma.emergencyRequest.findFirst({
		where: {
			patientId,
			status: { in: BLOCKING_STATUSES },
		},
	});

	if (existingActive) {
		throw new AppError(
			httpStatus.CONFLICT,
			"You already have an active emergency request. Please wait for it to be resolved before creating a new one.",
		);
	}

	const incidentNumber = await generateIncidentNumber();

	const result = await prisma.$transaction(async (tx) => {
		const emergency = await tx.emergencyRequest.create({
			data: {
				incidentNumber,
				patientId,
				emergencyType: payload.emergencyType,
				requiredCapability: payload.requiredCapability,
				description: payload.description,
				locationAddress: payload.locationAddress,
				locationLat: payload.locationLat,
				locationLng: payload.locationLng,
				callerName: payload.callerName,
				callerPhone: payload.callerPhone,
				status: EmergencyStatus.PENDING,
			},
			include: {
				patient: {
					omit: {
						password: true,
					},
				},
			},
		});

		await tx.incidentTimeline.create({
			data: {
				emergencyId: emergency.id,
				eventType: "EMERGENCY_CREATED",
				newValue: EmergencyStatus.PENDING,
				triggeredBy: patientId,
				triggeredByRole: "PATIENT",
				notes: `Emergency request ${incidentNumber} created by patient.`,
			},
		});

		return emergency;
	});

	return result;
};

const getMyEmergencies = async (
	patientId: string,
	page: number,
	limit: number,
) => {
	const skip = (page - 1) * limit;

	const [emergencies, total] = await Promise.all([
		prisma.emergencyRequest.findMany({
			where: { patientId },
			orderBy: { createdAt: "desc" },
			skip,
			take: limit,
			include: {
				patient: {
					omit: {
						password: true,
					},
				},
			},
		}),
		prisma.emergencyRequest.count({ where: { patientId } }),
	]);

	return {
		emergencies,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const getEmergencyById = async (
	emergencyId: string,
	requesterId: string,
	requesterRole: UserRole,
) => {
	const emergency = await prisma.emergencyRequest.findUnique({
		where: { id: emergencyId },
		include: {
			patient: {
				omit: { password: true },
			},
			timeline: {
				orderBy: { createdAt: "asc" },
			},
			dispatches: {
				orderBy: { createdAt: "desc" },
				include: {
					ambulance: true,
					driver: {
						include: {
							user: { omit: { password: true } },
						},
					},
				},
			},
		},
	});

	if (!emergency) {
		throw new AppError(httpStatus.NOT_FOUND, "Emergency request not found.");
	}

	if (
		requesterRole === UserRole.PATIENT &&
		emergency.patientId !== requesterId
	) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You do not have permission to view this emergency.",
		);
	}

	return emergency;
};

export const emergencyService = {
	createEmergencyIntoDB,
	getMyEmergencies,
	getEmergencyById,
};
