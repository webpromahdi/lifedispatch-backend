import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import type {
	CertificationLevel,
	Prisma,
} from "../../../generated/prisma/browser.js";
import { UserRole } from "../../../generated/prisma/enums.js";
import config from "../../config/index.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import type {
	ICreateDriverPayload,
	IUpdateDriverPayload,
} from "./driver.interface.js";

const driverExtendedDetails = {
	user: {
		omit: { password: true },
	},
	ambulance: true,
} satisfies Prisma.DriverInclude;

const assertAmbulanceExists = async (ambulanceId: string) => {
	const ambulance = await prisma.ambulance.findUnique({
		where: { id: ambulanceId, deletedAt: null },
	});

	if (!ambulance) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			`Ambulance with ID "${ambulanceId}" not found.`,
		);
	}
};

const createDriverIntoDB = async (payload: ICreateDriverPayload) => {
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
				`A user with phone "${payload.phone}" already exists.`,
			);
		}
	}

	const licenseConflict = await prisma.driver.findUnique({
		where: { licenseNumber: payload.licenseNumber },
	});

	if (licenseConflict) {
		throw new AppError(
			httpStatus.CONFLICT,
			`A driver with license number "${payload.licenseNumber}" already exists.`,
		);
	}

	if (payload.assignedAmbulanceId) {
		await assertAmbulanceExists(payload.assignedAmbulanceId);

		const ambulanceTaken = await prisma.driver.findFirst({
			where: { assignedAmbulanceId: payload.assignedAmbulanceId },
		});

		if (ambulanceTaken) {
			throw new AppError(
				httpStatus.CONFLICT,
				"This ambulance is already assigned to another driver.",
			);
		}
	}

	const hashedPassword = await bcrypt.hash(
		payload.password,
		Number(config.bcrypt_salt_rounds),
	);

	const user = await prisma.user.create({
		data: {
			name: payload.name,
			email: payload.email,
			phone: payload.phone ?? null,
			password: hashedPassword,
			role: UserRole.DRIVER,
			isVerified: true,
			driverProfile: {
				create: {
					licenseNumber: payload.licenseNumber,
					licenseExpiry: new Date(payload.licenseExpiry),
					certificationLevel: payload.certificationLevel,
					assignedAmbulanceId: payload.assignedAmbulanceId ?? null,
				},
			},
		},
		omit: { password: true },
		include: {
			driverProfile: {
				include: { ambulance: true },
			},
		},
	});

	return user;
};

const getAllDriversFromDB = async (
	page: number,
	limit: number,
	filters: {
		isOnShift?: boolean;
		certificationLevel?: CertificationLevel;
	},
) => {
	const skip = (page - 1) * limit;
	const whereConditions: Prisma.DriverWhereInput = {};

	if (filters.isOnShift !== undefined) {
		whereConditions.isOnShift = filters.isOnShift;
	}

	if (filters.certificationLevel) {
		whereConditions.certificationLevel = filters.certificationLevel;
	}

	const [drivers, total] = await Promise.all([
		prisma.driver.findMany({
			where: whereConditions,
			orderBy: { createdAt: "desc" },
			skip,
			take: limit,
			include: driverExtendedDetails,
		}),
		prisma.driver.count({ where: whereConditions }),
	]);

	return {
		drivers,
		meta: {
			page,
			limit,
			total,
			totalPages: Math.ceil(total / limit),
		},
	};
};

const updateDriverInDB = async (
	driverId: string,
	payload: IUpdateDriverPayload,
) => {
	const driver = await prisma.driver.findUnique({
		where: { id: driverId },
	});

	if (!driver) {
		throw new AppError(httpStatus.NOT_FOUND, "Driver profile not found.");
	}

	if (payload.licenseNumber && payload.licenseNumber !== driver.licenseNumber) {
		const conflict = await prisma.driver.findUnique({
			where: { licenseNumber: payload.licenseNumber },
		});

		if (conflict) {
			throw new AppError(
				httpStatus.CONFLICT,
				`A driver with license number "${payload.licenseNumber}" already exists.`,
			);
		}
	}

	if (payload.assignedAmbulanceId) {
		await assertAmbulanceExists(payload.assignedAmbulanceId);

		const ambulanceTaken = await prisma.driver.findFirst({
			where: {
				assignedAmbulanceId: payload.assignedAmbulanceId,
				id: { not: driverId },
			},
		});

		if (ambulanceTaken) {
			throw new AppError(
				httpStatus.CONFLICT,
				"This ambulance is already assigned to another driver.",
			);
		}
	}

	const { licenseExpiry, ...rest } = payload;

	const updated = await prisma.driver.update({
		where: { id: driverId },
		data: {
			...rest,
			licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : undefined,
		},
		include: driverExtendedDetails,
	});

	return updated;
};

const toggleShiftInDB = async (userId: string, action: "start" | "end") => {
	const driver = await prisma.driver.findUnique({
		where: { userId },
	});

	if (!driver) {
		throw new AppError(
			httpStatus.NOT_FOUND,
			"Driver profile not found for the authenticated user.",
		);
	}

	if (action === "start") {
		if (driver.isOnShift) {
			throw new AppError(
				httpStatus.CONFLICT,
				"Shift is already active. End the current shift before starting a new one.",
			);
		}

		const updated = await prisma.driver.update({
			where: { userId },
			data: {
				isOnShift: true,
				shiftStart: new Date(),
				shiftEnd: null,
			},
			include: driverExtendedDetails,
		});

		return updated;
	}

	if (!driver.isOnShift) {
		throw new AppError(httpStatus.CONFLICT, "No active shift to end.");
	}

	const updated = await prisma.driver.update({
		where: { userId },
		data: {
			isOnShift: false,
			shiftEnd: new Date(),
		},
		include: driverExtendedDetails,
	});

	return updated;
};

export const driverService = {
	createDriverIntoDB,
	getAllDriversFromDB,
	updateDriverInDB,
	toggleShiftInDB,
};
