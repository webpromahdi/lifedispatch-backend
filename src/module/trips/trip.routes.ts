import { Router } from "express";
import { UserRole } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { tripController } from "./trip.controller.js";
import {
	selectHospitalSchema,
	updateTripStatusSchema,
} from "./trip.validation.js";

const router = Router();

router.get(
	"/:id",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		UserRole.DISPATCHER,
		UserRole.DRIVER,
		UserRole.PATIENT,
	),
	tripController.getTripById,
);

router.patch(
	"/:id/status",
	auth(UserRole.DRIVER),
	validateRequest(updateTripStatusSchema),
	tripController.updateTripStatus,
);

router.patch(
	"/:id/hospital",
	auth(
		UserRole.DRIVER,
		UserRole.DISPATCHER,
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
	),
	validateRequest(selectHospitalSchema),
	tripController.selectHospital,
);

export const tripRoutes = router;
