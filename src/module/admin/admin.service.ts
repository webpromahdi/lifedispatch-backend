import httpStatus from "http-status";
import type { Prisma, UserRole, UserStatus } from "../../../generated/prisma/browser.js";
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

const updateUserStatusInDB = async (userId: string, status: UserStatus) => {
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

	const updated = await prisma.user.update({
		where: { id: userId },
		data: { status },
		omit: { password: true },
	});

	return updated;
};

export const adminService = {
	getAllUsersFromDB,
	updateUserStatusInDB,
};
