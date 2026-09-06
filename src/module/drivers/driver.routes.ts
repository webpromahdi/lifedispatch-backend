import { Router } from "express";
import { UserRole } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { driverController } from "./driver.controller.js";
import {
	createDriverSchema,
	toggleShiftSchema,
	updateDriverSchema,
} from "./driver.validation.js";

const router = Router();

router.post(
	"/create",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN),
	validateRequest(createDriverSchema),
	driverController.createDriver,
);

router.get(
	"/",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DISPATCHER),
	driverController.getAllDrivers,
);

router.patch(
	"/me/shift",
	auth(UserRole.DRIVER),
	validateRequest(toggleShiftSchema),
	driverController.toggleShift,
);

router.patch(
	"/:id",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN),
	validateRequest(updateDriverSchema),
	driverController.updateDriver,
);

export const driverRoutes = router;
