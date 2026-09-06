import bcrypt from "bcryptjs";
import httpStatus from "http-status";
import { CertificationLevel, UserRole } from "../../generated/prisma/enums.js";
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
		const name = config.tester_driver_name;
		const email = config.tester_driver_email;
		const password = config.tester_driver_password;

		if (!name || !email || !password) {
			throw new AppError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Tester Driver name, email, or password is missing in the .env file.",
			);
		}

		const existing = await prisma.user.findUnique({ where: { email } });
		if (existing) {
			console.log("Tester Driver already exists — skipping.");
			return;
		}

		const hashedPassword = await hashPassword(password);

		await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: UserRole.DRIVER,
				isVerified: true,
				driverProfile: {
					create: {
						licenseNumber: "DL-TEST-001",
						licenseExpiry: new Date(
							new Date().setFullYear(new Date().getFullYear() + 5),
						),
						certificationLevel: CertificationLevel.PARAMEDIC,
					},
				},
			},
		});

		console.log("Tester Driver seeded successfully.");
	} catch (error) {
		console.error("Error seeding Tester Driver:", error);
	}
};

export const seedTesterDispatcher = async () => {
	try {
		const name = config.tester_dispatcher_name;
		const email = config.tester_dispatcher_email;
		const password = config.tester_dispatcher_password;

		if (!name || !email || !password) {
			throw new AppError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Tester Dispatcher name, email, or password is missing in the .env file.",
			);
		}

		const existing = await prisma.user.findUnique({ where: { email } });
		if (existing) {
			console.log("Tester Dispatcher already exists — skipping.");
			return;
		}

		const hashedPassword = await hashPassword(password);

		await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: UserRole.DISPATCHER,
				isVerified: true,
				dispatcherProfile: {
					create: {
						employeeId: "DISP-TEST-001",
					},
				},
			},
		});

		console.log("Tester Dispatcher seeded successfully.");
	} catch (error) {
		console.error("Error seeding Tester Dispatcher:", error);
	}
};

export const seedTesterHospitalStaff = async () => {
	try {
		const name = config.tester_hospital_staff_name;
		const email = config.tester_hospital_staff_email;
		const password = config.tester_hospital_staff_password;

		if (!name || !email || !password) {
			throw new AppError(
				httpStatus.INTERNAL_SERVER_ERROR,
				"Tester Hospital Staff name, email, or password is missing in the .env file.",
			);
		}

		const existing = await prisma.user.findUnique({ where: { email } });
		if (existing) {
			console.log("Tester Hospital Staff already exists — skipping.");
			return;
		}

		let hospital = await prisma.hospital.findFirst({
			where: { isActive: true },
		});

		if (!hospital) {
			hospital = await prisma.hospital.create({
				data: {
					name: "LifeDispatch General Hospital",
					address: "123 Emergency Ave, Medical District",
					lat: 40.7128,
					lng: -74.006,
					phone: "+1-800-555-0199",
					emergencyContact: "+1-800-555-0911",
					totalErBeds: 50,
					availableErBeds: 25,
					capabilities: ["Trauma Center", "Cardiac Care", "Neurology"],
				},
			});
		}

		const hashedPassword = await hashPassword(password);

		await prisma.user.create({
			data: {
				name,
				email,
				password: hashedPassword,
				role: UserRole.HOSPITAL_STAFF,
				isVerified: true,
				hospitalStaffProfile: {
					create: {
						employeeId: "HOSP-TEST-001",
						designation: "ER Manager",
						hospitalId: hospital.id,
					},
				},
			},
		});

		console.log("Tester Hospital Staff seeded successfully.");
	} catch (error) {
		console.error("Error seeding Tester Hospital Staff:", error);
	}
};
