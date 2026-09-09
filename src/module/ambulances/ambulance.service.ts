import httpStatus from "http-status";
import type {
	AmbulanceStatus,
	AmbulanceType,
	Prisma,
} from "../../../generated/prisma/browser.js";
import { UserRole } from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type {
	ICreateAmbulancePayload,
	IUpdateAmbulancePayload,
} from "./ambulance.interface.js";

const ambulanceExtendedDetails = {
	driver: {
		include: {
			user: {
				omit: { password: true },
			},
		},
	},
	hospital: true,
} satisfies Prisma.AmbulanceInclude;

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
			registrationDocumentUrl: payload.registrationDocumentUrl,
		},
		include: ambulanceExtendedDetails,
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
			include: ambulanceExtendedDetails,
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
		include: ambulanceExtendedDetails,
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

	if (payload.hospitalId) {
		await assertHospitalExists(payload.hospitalId);
	}

	const { lastServiceDate, nextServiceDue, ...rest } = payload;

	const updated = await prisma.ambulance.update({
		where: { id: ambulanceId },
		data: {
			...rest,
			lastServiceDate: lastServiceDate ? new Date(lastServiceDate) : undefined,
			nextServiceDue: nextServiceDue ? new Date(nextServiceDue) : undefined,
		},
		include: ambulanceExtendedDetails,
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
