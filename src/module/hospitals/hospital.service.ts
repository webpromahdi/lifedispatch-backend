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
	ICreateStaffPayload,
	IUpdateDiversionPayload,
	IUpdateHospitalPayload,
	IUpdateStaffPayload,
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

	if (payload.staffPhone) {
		const phoneConflict = await prisma.user.findUnique({
			where: { phone: payload.staffPhone },
		});

		if (phoneConflict) {
			throw new AppError(
				httpStatus.CONFLICT,
				`A user with phone number "${payload.staffPhone}" already exists.`,
			);
		}
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

const createStaffIntoDB = async (
	hospitalId: string,
	payload: ICreateStaffPayload,
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

	const emailConflict = await prisma.user.findUnique({
		where: { email: payload.email },
	});

	if (emailConflict) {
		throw new AppError(
			httpStatus.CONFLICT,
			`A user with email "${payload.email}" already exists.`,
		);
	}

	if (payload.phone) {
		const phoneConflict = await prisma.user.findUnique({
			where: { phone: payload.phone },
		});

		if (phoneConflict) {
			throw new AppError(
				httpStatus.CONFLICT,
				`A user with phone number "${payload.phone}" already exists.`,
			);
		}
	}

	if (payload.employeeId) {
		const employeeIdConflict = await prisma.hospitalStaff.findUnique({
			where: { employeeId: payload.employeeId },
		});

		if (employeeIdConflict) {
			throw new AppError(
				httpStatus.CONFLICT,
				`Employee ID "${payload.employeeId}" is already in use.`,
			);
		}
	}

	const hashedPassword = await bcrypt.hash(
		payload.password,
		Number(config.bcrypt_salt_rounds),
	);

	const result = await prisma.$transaction(async (tx) => {
		const newUser = await tx.user.create({
			data: {
				name: payload.name,
				email: payload.email,
				phone: payload.phone ?? null,
				password: hashedPassword,
				role: UserRole.HOSPITAL_STAFF,
				isVerified: true,
			},
			omit: { password: true },
		});

		const staffRecord = await tx.hospitalStaff.create({
			data: {
				userId: newUser.id,
				hospitalId,
				designation: payload.designation ?? null,
				employeeId: payload.employeeId ?? null,
				canManageStaff: payload.canManageStaff ?? false,
			},
		});

		return { ...newUser, staffProfile: staffRecord };
	});

	return result;
};

const getAllStaffFromDB = async (
	hospitalId: string,
	page: number,
	limit: number,
	filters: {
		canManageStaff?: boolean;
		isOnShift?: boolean;
		search?: string;
	},
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

	const skip = (page - 1) * limit;
	const whereConditions: Prisma.HospitalStaffWhereInput = { hospitalId };

	if (filters.canManageStaff !== undefined) {
		whereConditions.canManageStaff = filters.canManageStaff;
	}

	if (filters.isOnShift !== undefined) {
		whereConditions.isOnShift = filters.isOnShift;
	}

	if (filters.search) {
		whereConditions.user = {
			OR: [
				{ name: { contains: filters.search, mode: "insensitive" } },
				{ email: { contains: filters.search, mode: "insensitive" } },
			],
		};
	}

	const [staff, total] = await Promise.all([
		prisma.hospitalStaff.findMany({
			where: whereConditions,
			orderBy: { createdAt: "desc" },
			skip,
			take: limit,
			include: {
				user: {
					omit: { password: true },
				},
			},
		}),
		prisma.hospitalStaff.count({ where: whereConditions }),
	]);

	return {
		staff,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const updateStaffInDB = async (
	hospitalId: string,
	staffId: string,
	payload: IUpdateStaffPayload,
) => {
	const staffRecord = await prisma.hospitalStaff.findFirst({
		where: { id: staffId, hospitalId },
	});

	if (!staffRecord) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Staff member not found in this hospital.",
		);
	}

	if (payload.employeeId && payload.employeeId !== staffRecord.employeeId) {
		const conflict = await prisma.hospitalStaff.findUnique({
			where: { employeeId: payload.employeeId },
		});
		if (conflict) {
			throw new AppError(
				httpStatus.CONFLICT,
				`Employee ID "${payload.employeeId}" is already in use.`,
			);
		}
	}

	const { name, phone, ...staffFields } = payload;

	await prisma.$transaction(async (tx) => {
		if (name !== undefined || phone !== undefined) {
			await tx.user.update({
				where: { id: staffRecord.userId },
				data: {
					name: name ?? undefined,
					phone: phone ?? undefined,
				},
			});
		}

		await tx.hospitalStaff.update({
			where: { id: staffId },
			data: staffFields,
		});
	});

	const updated = await prisma.hospitalStaff.findUnique({
		where: { id: staffId },
		include: {
			user: { omit: { password: true } },
		},
	});

	return updated;
};

const deleteStaffInDB = async (hospitalId: string, staffId: string) => {
	const staffRecord = await prisma.hospitalStaff.findFirst({
		where: { id: staffId, hospitalId },
	});

	if (!staffRecord) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Staff member not found in this hospital.",
		);
	}

	// Enforce at least 1 active staff invariant
	const activeStaffCount = await prisma.hospitalStaff.count({
		where: { hospitalId },
	});

	if (activeStaffCount <= 1) {
		throw new AppError(
			httpStatus.CONFLICT,
			"Cannot delete the last active staff member of a hospital.",
		);
	}

	await prisma.user.delete({
		where: { id: staffRecord.userId },
	});
};

const toggleShiftInDB = async (userId: string, action: "start" | "end") => {
	const staffRecord = await prisma.hospitalStaff.findUnique({
		where: { userId },
	});

	if (!staffRecord) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Hospital staff profile not found for the authenticated user.",
		);
	}

	if (action === "start") {
		if (staffRecord.isOnShift) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Shift is already active. End the current shift before starting a new one.",
			);
		}

		return prisma.hospitalStaff.update({
			where: { userId },
			data: {
				isOnShift: true,
				shiftStart: new Date(),
				shiftEnd: null,
			},
			include: { user: { omit: { password: true } } },
		});
	}

	if (!staffRecord.isOnShift) {
		throw new AppError(httpStatus.CONFLICT, "No active shift to end.");
	}

	return prisma.hospitalStaff.update({
		where: { userId },
		data: {
			isOnShift: false,
			shiftEnd: new Date(),
		},
		include: { user: { omit: { password: true } } },
	});
};

export const hospitalService = {
	createHospitalIntoDB,
	getAllHospitalsFromDB,
	updateHospitalInDB,
	updateDiversionInDB,
	createStaffIntoDB,
	getAllStaffFromDB,
	updateStaffInDB,
	deleteStaffInDB,
	toggleShiftInDB,
};
