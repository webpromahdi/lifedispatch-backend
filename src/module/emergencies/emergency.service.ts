import httpStatus from "http-status";
import type {
	EmergencyPriority,
	EmergencyType,
	Prisma,
} from "../../../generated/prisma/browser.js";
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

const getAllEmergenciesFromDB = async (
	patientId: string,
	page: number,
	limit: number,
	filters: {
		status?: EmergencyStatus;
		emergencyType?: EmergencyType;
		priority?: EmergencyPriority;
	},
) => {
	const skip = (page - 1) * limit;
	const whereConditions: Prisma.EmergencyRequestWhereInput = {};

	if (patientId) {
		whereConditions.patientId = patientId;
	}

	if (filters.status) whereConditions.status = filters.status;
	if (filters.emergencyType)
		whereConditions.emergencyType = filters.emergencyType;
	if (filters.priority) whereConditions.priority = filters.priority;

	const [emergencies, total] = await Promise.all([
		prisma.emergencyRequest.findMany({
			where: whereConditions,
			orderBy: { createdAt: "desc" },
			skip,
			take: limit,
			include: {
				patient: {
					select: {
						id: true,
						name: true,
						email: true,
						phone: true,
						role: true,
					},
				},
			},
		}),
		prisma.emergencyRequest.count({ where: whereConditions }),
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

const updatePriority = async (
	emergencyId: string,
	priority: EmergencyPriority,
	dispatcherId: string,
	dispatcherRole: UserRole,
) => {
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
			`Cannot update priority of a ${emergency.status.toLowerCase()} emergency.`,
		);
	}

	const newStatus =
		emergency.status === EmergencyStatus.PENDING
			? EmergencyStatus.PRIORITIZED
			: emergency.status;

	const updatedEmergency = await prisma.$transaction(async (tx) => {
		const updated = await tx.emergencyRequest.update({
			where: { id: emergencyId },
			data: {
				priority,
				prioritySetBy: dispatcherId,
				status: newStatus,
			},
		});

		await tx.incidentTimeline.create({
			data: {
				emergencyId,
				eventType: "PRIORITY_UPDATED",
				oldValue: emergency.priority || "UNASSIGNED",
				newValue: priority,
				triggeredBy: dispatcherId,
				triggeredByRole: dispatcherRole,
				notes: `Emergency priority updated to ${priority}.`,
			},
		});

		if (newStatus !== emergency.status) {
			await tx.incidentTimeline.create({
				data: {
					emergencyId,
					eventType: "STATUS_UPDATED",
					oldValue: emergency.status,
					newValue: newStatus,
					triggeredBy: dispatcherId,
					triggeredByRole: dispatcherRole,
					notes: `Emergency status updated to ${newStatus}.`,
				},
			});
		}

		return updated;
	});

	return updatedEmergency;
};

const cancelEmergency = async (
	emergencyId: string,
	reason: string,
	userId: string,
	userRole: UserRole,
) => {
	const emergency = await prisma.emergencyRequest.findUnique({
		where: { id: emergencyId },
	});

	if (!emergency) {
		throw new AppError(httpStatus.NOT_FOUND, "Emergency request not found.");
	}

	if (userRole === UserRole.PATIENT && emergency.patientId !== userId) {
		throw new AppError(
			httpStatus.FORBIDDEN,
			"You do not have permission to cancel this emergency.",
		);
	}

	if (
		emergency.status === EmergencyStatus.CANCELLED ||
		emergency.status === EmergencyStatus.COMPLETED
	) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			`Emergency is already ${emergency.status.toLowerCase()}.`,
		);
	}

	const updatedEmergency = await prisma.$transaction(async (tx) => {
		const updated = await tx.emergencyRequest.update({
			where: { id: emergencyId },
			data: {
				status: EmergencyStatus.CANCELLED,
				cancelledAt: new Date(),
				cancellationReason: reason,
				cancelledBy: userId,
			},
		});

		await tx.incidentTimeline.create({
			data: {
				emergencyId,
				eventType: "EMERGENCY_CANCELLED",
				oldValue: emergency.status,
				newValue: EmergencyStatus.CANCELLED,
				triggeredBy: userId,
				triggeredByRole: userRole,
				notes: `Emergency cancelled. Reason: ${reason}`,
			},
		});

		return updated;
	});

	return updatedEmergency;
};

export const emergencyService = {
	createEmergencyIntoDB,
	getAllEmergenciesFromDB,
	getEmergencyById,
	updatePriority,
	cancelEmergency,
};
