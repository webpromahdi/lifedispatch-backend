import httpStatus from "http-status";
import type { AmbulanceStatus, AmbulanceType, Prisma } from "../../../generated/prisma/browser.js";
import { UserRole } from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type {
	ICreateAmbulancePayload,
	IUpdateAmbulancePayload,
} from "./ambulance.interface.js";

// Reusable include block for all single-record queries
const ambulanceFullInclude = {
	driver: {
		include: {
			user: {
				omit: { password: true as const },
			},
		},
	},
	hospital: {
		select: {
			id: true,
			name: true,
			address: true,
			phone: true,
			diversionStatus: true,
		},
	},
} satisfies Prisma.AmbulanceInclude;

// Validate a hospital exists and is not deleted
const assertHospitalExists = async (hospitalId: string) => {
	const hospital = await prisma.hospital.findUnique({
		where: { id: hospitalId, deletedAt: null },
	});
	if (!hospital) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			`Hospital with ID "${hospitalId}" not found.`,
		);
	}
};

const createAmbulanceIntoDB = async (payload: ICreateAmbulancePayload) => {
	const existing = await prisma.ambulance.findUnique({
		where: { registrationNumber: payload.registrationNumber },
	});

	if (existing) {
		throw new AppError(
			httpStatus.CONFLICT,
			`An ambulance with registration number "${payload.registrationNumber}" already exists.`,
		);
	}

	if (payload.hospitalId) {
		await assertHospitalExists(payload.hospitalId);
	}

	const ambulance = await prisma.ambulance.create({
		data: {
			registrationNumber: payload.registrationNumber,
			type: payload.type,
			capabilities: payload.capabilities,
			baseLocationLat: payload.baseLocationLat,
			baseLocationLng: payload.baseLocationLng,
			hospitalId: payload.hospitalId ?? null,
			lastServiceDate: payload.lastServiceDate
				? new Date(payload.lastServiceDate)
				: undefined,
			nextServiceDue: payload.nextServiceDue
				? new Date(payload.nextServiceDue)
				: undefined,
			manufacturedYear: payload.manufacturedYear,
		},
		include: ambulanceFullInclude,
	});

	return ambulance;
};

const getAllAmbulancesFromDB = async (
	page: number,
	limit: number,
	filters: {
		status?: AmbulanceStatus;
		type?: AmbulanceType;
	},
) => {
	const skip = (page - 1) * limit;
	const whereConditions: Prisma.AmbulanceWhereInput = {
		deletedAt: null,
	};

	if (filters.status) whereConditions.status = filters.status;
	if (filters.type) whereConditions.type = filters.type;

	const [ambulances, total] = await Promise.all([
		prisma.ambulance.findMany({
			where: whereConditions,
			orderBy: { createdAt: "desc" },
			skip,
			take: limit,
			include: {
				driver: {
					include: {
						user: {
							select: {
								id: true,
								name: true,
								email: true,
								phone: true,
								role: true,
							},
						},
					},
				},
				hospital: {
					select: {
						id: true,
						name: true,
						address: true,
						phone: true,
						diversionStatus: true,
					},
				},
			},
		}),
		prisma.ambulance.count({ where: whereConditions }),
	]);

	return {
		ambulances,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const getAmbulanceById = async (ambulanceId: string) => {
	const ambulance = await prisma.ambulance.findUnique({
		where: { id: ambulanceId, deletedAt: null },
		include: ambulanceFullInclude,
	});

	if (!ambulance) {
		throw new AppError(httpStatus.NOT_FOUND, "Ambulance not found.");
	}

	return ambulance;
};

const updateAmbulanceInDB = async (
	ambulanceId: string,
	payload: IUpdateAmbulancePayload,
) => {
	const ambulance = await prisma.ambulance.findUnique({
		where: { id: ambulanceId, deletedAt: null },
	});

	if (!ambulance) {
		throw new AppError(httpStatus.NOT_FOUND, "Ambulance not found.");
	}

	// Check for registration number conflict if being changed
	if (
		payload.registrationNumber &&
		payload.registrationNumber !== ambulance.registrationNumber
	) {
		const conflict = await prisma.ambulance.findUnique({
			where: { registrationNumber: payload.registrationNumber },
		});
		if (conflict) {
			throw new AppError(
				httpStatus.CONFLICT,
				`An ambulance with registration number "${payload.registrationNumber}" already exists.`,
			);
		}
	}

	// Validate hospital exists when hospitalId is being set (not cleared)
	if (payload.hospitalId) {
		await assertHospitalExists(payload.hospitalId);
	}

	const updated = await prisma.ambulance.update({
		where: { id: ambulanceId },
		data: {
			registrationNumber: payload.registrationNumber,
			type: payload.type,
			capabilities: payload.capabilities,
			baseLocationLat: payload.baseLocationLat,
			baseLocationLng: payload.baseLocationLng,
			currentLat: payload.currentLat,
			currentLng: payload.currentLng,
			// Allow explicit null to detach the hospital relation
			...(payload.hospitalId !== undefined && {
				hospitalId: payload.hospitalId,
			}),
			lastServiceDate: payload.lastServiceDate
				? new Date(payload.lastServiceDate)
				: undefined,
			nextServiceDue: payload.nextServiceDue
				? new Date(payload.nextServiceDue)
				: undefined,
			manufacturedYear: payload.manufacturedYear,
		},
		include: ambulanceFullInclude,
	});

	return updated;
};

const updateAmbulanceStatusInDB = async (
	ambulanceId: string,
	status: AmbulanceStatus,
	requesterId: string,
	requesterRole: UserRole,
) => {
	const ambulance = await prisma.ambulance.findUnique({
		where: { id: ambulanceId, deletedAt: null },
		include: { driver: true },
	});

	if (!ambulance) {
		throw new AppError(httpStatus.NOT_FOUND, "Ambulance not found.");
	}

	// Drivers can only update the status of their own assigned ambulance
	if (requesterRole === UserRole.DRIVER) {
		if (!ambulance.driver || ambulance.driver.userId !== requesterId) {
			throw new AppError(
				httpStatus.FORBIDDEN,
				"You can only update the status of your own assigned ambulance.",
			);
		}
	}

	const updated = await prisma.ambulance.update({
		where: { id: ambulanceId },
		data: { status },
	});

	return updated;
};

export const ambulanceService = {
	createAmbulanceIntoDB,
	getAllAmbulancesFromDB,
	getAmbulanceById,
	updateAmbulanceInDB,
	updateAmbulanceStatusInDB,
};
