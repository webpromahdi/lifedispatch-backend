import app from "./app.js";
import config from "./config/index.js";
import { transporter } from "./lib/nodemailer.js";
import { prisma } from "./lib/prisma.js";
import { redisClient } from "./lib/redis.js";
import {
	seedSuperAdmin,
	seedTesterAdmin,
	seedTesterDispatcher,
	seedTesterDriver,
	seedTesterHospitalStaff,
} from "./utils/seed.js";

async function main() {
	try {
		await prisma.$connect();
		console.log("Database connected successfully");

		await redisClient.connect();
		console.log("Redis Connected Successfully.");

		await transporter.verify();
		console.log("Nodemailer Connected Successfully.");

		// Seed default users
		await seedSuperAdmin();
		await seedTesterAdmin();
		await seedTesterDriver();
		await seedTesterDispatcher();
		await seedTesterHospitalStaff();

		app.listen(config.port, () => {
			console.log(`Example app listening on port ${config.port}`);
		});
	} catch (err) {
		console.log("Error starting the server", err);
		await prisma.$disconnect();
		process.exit(1);
	}
}

main();
