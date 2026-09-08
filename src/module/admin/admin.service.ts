import httpStatus from "http-status";
import type {
	Prisma,
	UserRole,
	UserStatus,
} from "../../../generated/prisma/browser.js";
import {
	AmbulanceStatus,
	EmergencyPriority,
	EmergencyStatus,
	EmergencyType,
	PaymentStatus,
	UserRole as UserRoleEnum,
} from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";

const getAllUsersFromDB = async (
	page: number,
	limit: number,
	filters: {
		role?: UserRole;
		status?: UserStatus;
		search?: string;
	},
) => {
	const skip = (page - 1) * limit;

	const whereConditions: Prisma.UserWhereInput = {
		isDeleted: false,
	};

	if (filters.role) {
		whereConditions.role = filters.role;
	}

	if (filters.status) {
		whereConditions.status = filters.status;
	}

	if (filters.search) {
		whereConditions.OR = [
			{ name: { contains: filters.search, mode: "insensitive" } },
			{ email: { contains: filters.search, mode: "insensitive" } },
			{ phone: { contains: filters.search, mode: "insensitive" } },
		];
	}

	const [users, total] = await Promise.all([
		prisma.user.findMany({
			where: whereConditions,
			orderBy: { createdAt: "desc" },
			skip,
			take: limit,
			omit: { password: true },
		}),
		prisma.user.count({ where: whereConditions }),
	]);

	return {
		users,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const updateUserStatusInDB = async (
	userId: string,
	status: UserStatus,
	admin: { id: string; role: string; name: string },
) => {
	const user = await prisma.user.findUnique({
		where: { id: userId, isDeleted: false },
	});

	if (!user) {
		throw new AppError(httpStatus.NOT_FOUND, "User not found.");
	}

	if (user.status === status) {
		throw new AppError(
			httpStatus.CONFLICT,
			`User account is already ${status.toLowerCase()}.`,
		);
	}

	const updated = await prisma.$transaction(async (tx) => {
		const updatedUser = await tx.user.update({
			where: { id: userId },
			data: { status },
			omit: { password: true },
		});

		await tx.auditLog.create({
			data: {
				action: "UPDATE_USER_STATUS",
				entity: "USER",
				entityId: userId,
				description: `User status changed from ${user.status} to ${status}`,
				performedBy: admin.id,
				performedByRole: admin.role,
				performedByName: admin.name,
				oldData: { status: user.status },
				newData: { status: status },
			},
		});

		return updatedUser;
	});

	return updated;
};

const getAnalyticsOverview = async () => {
	const [
		activeEmergencies,
		availableAmbulances,
		busyAmbulances,
		outOfServiceAmbulances,
		driversOnShift,
		totalCompletedEmergencies,
		totalCancelledEmergencies,
		totalTrips,
		totalPatients,
		totalDrivers,
		totalHospitals,
		paidRevenue,
		pendingRevenue,
	] = await Promise.all([
		prisma.emergencyRequest.count({
			where: {
				status: {
					in: [
						EmergencyStatus.PENDING,
						EmergencyStatus.PRIORITIZED,
						EmergencyStatus.DISPATCHING,
						EmergencyStatus.ACTIVE_TRIP,
					],
				},
			},
		}),
		prisma.ambulance.count({
			where: { status: AmbulanceStatus.AVAILABLE, deletedAt: null },
		}),
		prisma.ambulance.count({
			where: { status: AmbulanceStatus.BUSY, deletedAt: null },
		}),
		prisma.ambulance.count({
			where: { status: AmbulanceStatus.OUT_OF_SERVICE, deletedAt: null },
		}),
		prisma.driver.count({ where: { isOnShift: true } }),
		prisma.emergencyRequest.count({
			where: { status: EmergencyStatus.COMPLETED },
		}),
		prisma.emergencyRequest.count({
			where: { status: EmergencyStatus.CANCELLED },
		}),
		prisma.trip.count(),
		prisma.user.count({
			where: { role: UserRoleEnum.PATIENT, isDeleted: false },
		}),
		prisma.user.count({
			where: { role: UserRoleEnum.DRIVER, isDeleted: false },
		}),
		prisma.hospital.count(),
		prisma.payment.aggregate({
			where: { paymentStatus: PaymentStatus.PAID },
			_sum: { totalAmount: true },
		}),
		prisma.payment.aggregate({
			where: { paymentStatus: PaymentStatus.PENDING },
			_sum: { totalAmount: true },
		}),
	]);

	return {
		liveOperations: {
			activeEmergencies,
			availableAmbulances,
			busyAmbulances,
			outOfServiceAmbulances,
			driversOnShift,
		},
		historicStats: {
			totalCompletedEmergencies,
			totalCancelledEmergencies,
			totalTrips,
		},
		usersAndResources: {
			totalPatients,
			totalDrivers,
			totalHospitals,
		},
		revenue: {
			totalCollected: Number(paidRevenue._sum.totalAmount ?? 0),
			totalPending: Number(pendingRevenue._sum.totalAmount ?? 0),
		},
	};
};

const getEmergencyAnalytics = async (filters: {
	from?: string;
	to?: string;
}) => {
	const dateFilter: Prisma.EmergencyRequestWhereInput = {};

	if (filters.from || filters.to) {
		dateFilter.createdAt = {
			...(filters.from ? { gte: new Date(filters.from) } : {}),
			...(filters.to ? { lte: new Date(filters.to) } : {}),
		};
	}

	const byStatusCounts = await Promise.all(
		Object.values(EmergencyStatus).map(async (status) => ({
			status,
			count: await prisma.emergencyRequest.count({
				where: { ...dateFilter, status },
			}),
		})),
	);

	const byTypeCounts = await Promise.all(
		Object.values(EmergencyType).map(async (emergencyType) => ({
			type: emergencyType,
			count: await prisma.emergencyRequest.count({
				where: { ...dateFilter, emergencyType },
			}),
		})),
	);

	const byPriorityCounts = await Promise.all(
		Object.values(EmergencyPriority).map(async (priority) => ({
			priority,
			count: await prisma.emergencyRequest.count({
				where: { ...dateFilter, priority },
			}),
		})),
	);

	const [total, escalated, avgResponseTime] = await Promise.all([
		prisma.emergencyRequest.count({ where: dateFilter }),
		prisma.emergencyRequest.count({
			where: { ...dateFilter, isEscalated: true },
		}),
		prisma.emergencyRequest.aggregate({
			where: { ...dateFilter, responseTimeMinutes: { not: null } },
			_avg: { responseTimeMinutes: true },
		}),
	]);

	return {
		total,
		escalated,
		avgResponseTimeMinutes: Number(
			avgResponseTime._avg.responseTimeMinutes ?? 0,
		),
		byStatus: byStatusCounts,
		byType: byTypeCounts,
		byPriority: byPriorityCounts,
	};
};

const getPaymentAnalytics = async (filters: {
	from?: string;
	to?: string;
}) => {
	const dateFilter: Prisma.PaymentWhereInput = {};

	if (filters.from || filters.to) {
		dateFilter.createdAt = {
			...(filters.from ? { gte: new Date(filters.from) } : {}),
			...(filters.to ? { lte: new Date(filters.to) } : {}),
		};
	}

	const byStatusCounts = await Promise.all(
		Object.values(PaymentStatus).map(async (status) => ({
			status,
			count: await prisma.payment.count({
				where: { ...dateFilter, paymentStatus: status },
			}),
		})),
	);

	const [
		totalPayments,
		totalRevenue,
		totalRefunded,
		recentPayments,
	] = await Promise.all([
		prisma.payment.count({ where: dateFilter }),
		prisma.payment.aggregate({
			where: { ...dateFilter, paymentStatus: PaymentStatus.PAID },
			_sum: { totalAmount: true },
		}),
		prisma.payment.aggregate({
			where: { ...dateFilter, paymentStatus: PaymentStatus.REFUNDED },
			_sum: { refundAmount: true },
		}),
		prisma.payment.findMany({
			where: { ...dateFilter, paymentStatus: PaymentStatus.PAID },
			orderBy: { paymentConfirmedAt: "desc" },
			take: 10,
			select: {
				id: true,
				invoiceNumber: true,
				totalAmount: true,
				paymentMethod: true,
				paymentConfirmedAt: true,
				patient: { select: { id: true, name: true } },
			},
		}),
	]);

	return {
		totalPayments,
		totalRevenue: Number(totalRevenue._sum.totalAmount ?? 0),
		totalRefunded: Number(totalRefunded._sum.refundAmount ?? 0),
		byStatus: byStatusCounts,
		recentPayments,
	};
};

const getAuditLogs = async (
	page: number,
	limit: number,
	filters: {
		action?: string;
		entity?: string;
		performedBy?: string;
	},
) => {
	const skip = (page - 1) * limit;

	const whereConditions: Prisma.AuditLogWhereInput = {};

	if (filters.action) {
		whereConditions.action = filters.action;
	}

	if (filters.entity) {
		whereConditions.entity = filters.entity;
	}

	if (filters.performedBy) {
		whereConditions.performedBy = filters.performedBy;
	}

	const [logs, total] = await Promise.all([
		prisma.auditLog.findMany({
			where: whereConditions,
			orderBy: { createdAt: "desc" },
			skip,
			take: limit,
		}),
		prisma.auditLog.count({ where: whereConditions }),
	]);

	return {
		logs,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

export const adminService = {
	getAllUsersFromDB,
	updateUserStatusInDB,
	getAnalyticsOverview,
	getEmergencyAnalytics,
	getPaymentAnalytics,
	getAuditLogs,
};
