import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import type { Prisma } from "../../../generated/prisma/browser.js";
import {
	HospitalDiversionStatus,
	UserRole,
} from "../../../generated/prisma/enums.js";
import config from "../../config/index.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type {
	ICreateHospitalPayload,
	IUpdateDiversionPayload,
	IUpdateHospitalPayload,
} from "./hospital.interface.js";

const hospitalBasicInclude = {
	staff: {
		include: {
			user: {
				omit: { password: true },
			},
		},
	},
} satisfies Prisma.HospitalInclude;

const createHospitalIntoDB = async (payload: ICreateHospitalPayload) => {
	const emailConflict = await prisma.user.findUnique({
		where: { email: payload.staffEmail },
	});

	if (emailConflict) {
		throw new AppError(
			httpStatus.CONFLICT,
			`A user with email "${payload.staffEmail}" already exists.`,
		);
	}

	if (payload.staffEmployeeId) {
		const employeeIdConflict = await prisma.hospitalStaff.findUnique({
			where: { employeeId: payload.staffEmployeeId },
		});

		if (employeeIdConflict) {
			throw new AppError(
				httpStatus.CONFLICT,
				`Employee ID "${payload.staffEmployeeId}" is already in use.`,
			);
		}
	}

	if (payload.availableErBeds > payload.totalErBeds) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Available ER beds cannot exceed total ER beds.",
		);
	}

	const hashedPassword = await bcrypt.hash(
		payload.staffPassword,
		Number(config.bcrypt_salt_rounds),
	);

	const result = await prisma.$transaction(async (tx) => {
		const staffUser = await tx.user.create({
			data: {
				name: payload.staffName,
				email: payload.staffEmail,
				phone: payload.staffPhone ?? null,
				password: hashedPassword,
				role: UserRole.HOSPITAL_STAFF,
				isVerified: true,
			},
			omit: { password: true },
		});

		const hospital = await tx.hospital.create({
			data: {
				name: payload.name,
				address: payload.address,
				lat: payload.lat,
				lng: payload.lng,
				phone: payload.phone,
				emergencyContact: payload.emergencyContact,
				capabilities: payload.capabilities,
				totalErBeds: payload.totalErBeds,
				availableErBeds: payload.availableErBeds,
			},
		});

		const hospitalStaff = await tx.hospitalStaff.create({
			data: {
				userId: staffUser.id,
				hospitalId: hospital.id,
				designation: payload.staffDesignation ?? null,
				employeeId: payload.staffEmployeeId ?? null,
				canManageStaff: true,
			},
		});

		return { hospital, staffUser, hospitalStaff };
	});

	return {
		hospital: result.hospital,
		firstStaff: {
			...result.staffUser,
			staffProfile: result.hospitalStaff,
		},
	};
};

const getAllHospitalsFromDB = async (
	page: number,
	limit: number,
	filters: {
		diversionStatus?: HospitalDiversionStatus;
		isActive?: boolean;
		search?: string;
	},
) => {
	const skip = (page - 1) * limit;
	const whereConditions: Prisma.HospitalWhereInput = {};

	if (filters.diversionStatus) {
		whereConditions.diversionStatus = filters.diversionStatus;
	}

	if (filters.isActive !== undefined) {
		whereConditions.isActive = filters.isActive;
	}

	if (filters.search) {
		whereConditions.OR = [
			{ name: { contains: filters.search, mode: "insensitive" } },
			{ address: { contains: filters.search, mode: "insensitive" } },
		];
	}

	const [hospitals, total] = await Promise.all([
		prisma.hospital.findMany({
			where: whereConditions,
			orderBy: { createdAt: "desc" },
			skip,
			take: limit,
			include: {
				_count: {
					select: { staff: true },
				},
			},
		}),
		prisma.hospital.count({ where: whereConditions }),
	]);

	return {
		hospitals,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const updateHospitalInDB = async (
	hospitalId: string,
	payload: IUpdateHospitalPayload,
) => {
	const hospital = await prisma.hospital.findUnique({
		where: { id: hospitalId, isActive: true },
	});

	if (!hospital) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Hospital not found or is no longer active.",
		);
	}

	const resolvedTotal =
		payload.totalErBeds !== undefined
			? payload.totalErBeds
			: hospital.totalErBeds;
	const resolvedAvailable =
		payload.availableErBeds !== undefined
			? payload.availableErBeds
			: Number(hospital.availableErBeds);

	if (resolvedAvailable > resolvedTotal) {
		throw new AppError(
			httpStatus.BAD_REQUEST,
			"Available ER beds cannot exceed total ER beds.",
		);
	}

	const updated = await prisma.hospital.update({
		where: { id: hospitalId },
		data: {
			...payload,
		},
		include: hospitalBasicInclude,
	});

	return updated;
};

const updateDiversionInDB = async (
	hospitalId: string,
	payload: IUpdateDiversionPayload,
) => {
	const hospital = await prisma.hospital.findUnique({
		where: { id: hospitalId, isActive: true },
	});

	if (!hospital) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Hospital not found or is no longer active.",
		);
	}

	// When updating availableErBeds, ensure it doesn't exceed totalErBeds
	if (payload.availableErBeds !== undefined) {
		if (payload.availableErBeds > hospital.totalErBeds) {
			throw new AppError(
				httpStatus.BAD_REQUEST,
				"Available ER beds cannot exceed total ER beds.",
			);
		}
	}

	// diversionReason is only relevant when diverting or closed
	const isAccepting =
		payload.diversionStatus === HospitalDiversionStatus.ACCEPTING;

	const updated = await prisma.hospital.update({
		where: { id: hospitalId },
		data: {
			diversionStatus: payload.diversionStatus,
			diversionReason: isAccepting ? null : (payload.diversionReason ?? null),
			diversionSetAt: isAccepting ? null : new Date(),
			availableErBeds:
				payload.availableErBeds !== undefined
					? payload.availableErBeds
					: undefined,
		},
		include: hospitalBasicInclude,
	});

	return updated;
};

export const hospitalService = {
	createHospitalIntoDB,
	getAllHospitalsFromDB,
	updateHospitalInDB,
	updateDiversionInDB,
};
