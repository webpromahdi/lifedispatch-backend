import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import { UserRole } from "../../generated/prisma/enums.js";
import config from "../config/index.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "./AppError.js";

const hashPassword = async (password: string): Promise<string> => {
	return bcrypt.hash(password, Number(config.bcrypt_salt_rounds));
};

const seedUser = async (opts: {
	label: string;
	role: UserRole;
	nameKey: string | undefined;
	emailKey: string | undefined;
	passwordKey: string | undefined;
}) => {
	const { label, role, nameKey, emailKey, passwordKey } = opts;

	if (!nameKey || !emailKey || !passwordKey) {
		throw new AppError(
			httpStatus.INTERNAL_SERVER_ERROR,
			`${label} name, email, or password is missing in the .env file.`,
		);
	}

	const existing = await prisma.user.findUnique({
		where: { email: emailKey },
	});

	if (existing) {
		console.log(`${label} already exists — skipping.`);
		return;
	}

	const hashedPassword = await hashPassword(passwordKey);

	await prisma.user.create({
		data: {
			name: nameKey,
			email: emailKey,
			password: hashedPassword,
			role,
			isVerified: true,
		},
	});

	console.log(`${label} seeded successfully.`);
};

export const seedSuperAdmin = async () => {
	try {
		await seedUser({
			label: "Super Admin",
			role: UserRole.SUPER_ADMIN,
			nameKey: config.super_admin_name,
			emailKey: config.super_admin_email,
			passwordKey: config.super_admin_password,
		});
	} catch (error) {
		console.error("Error seeding Super Admin:", error);
	}
};

export const seedTesterAdmin = async () => {
	try {
		await seedUser({
			label: "Tester Admin",
			role: UserRole.ADMIN,
			nameKey: config.tester_admin_name,
			emailKey: config.tester_admin_email,
			passwordKey: config.tester_admin_password,
		});
	} catch (error) {
		console.error("Error seeding Tester Admin:", error);
	}
};

export const seedTesterDriver = async () => {
	try {
		await seedUser({
			label: "Tester Driver",
			role: UserRole.DRIVER,
			nameKey: config.tester_driver_name,
			emailKey: config.tester_driver_email,
			passwordKey: config.tester_driver_password,
		});
	} catch (error) {
		console.error("Error seeding Tester Driver:", error);
	}
};

export const seedTesterDispatcher = async () => {
	try {
		await seedUser({
			label: "Tester Dispatcher",
			role: UserRole.DISPATCHER,
			nameKey: config.tester_dispatcher_name,
			emailKey: config.tester_dispatcher_email,
			passwordKey: config.tester_dispatcher_password,
		});
	} catch (error) {
		console.error("Error seeding Tester Dispatcher:", error);
	}
};

export const seedTesterHospitalStaff = async () => {
	try {
		await seedUser({
			label: "Tester Hospital Staff",
			role: UserRole.HOSPITAL_STAFF,
			nameKey: config.tester_hospital_staff_name,
			emailKey: config.tester_hospital_staff_email,
			passwordKey: config.tester_hospital_staff_password,
		});
	} catch (error) {
		console.error("Error seeding Tester Hospital Staff:", error);
	}
};
