import { Router } from "express";
import { UserRole } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/checkAuth.js";

import { validateRequest } from "../../middleware/validateRequest.js";
import { emergencyController } from "./emergency.controller.js";
import {
	cancelEmergencySchema,
	createEmergencySchema,
	updatePrioritySchema,
} from "./emergency.validation.js";

const router = Router();

router.post(
	"/create",
	auth(UserRole.PATIENT),
	validateRequest(createEmergencySchema),
	emergencyController.createEmergency,
);

router.get(
	"/",
	auth(UserRole.PATIENT, UserRole.ADMIN, UserRole.DISPATCHER),
	emergencyController.getAllEmergencies,
);

router.get(
	"/:id",
	auth(
		UserRole.PATIENT,
		UserRole.DISPATCHER,
		UserRole.DRIVER,
		UserRole.HOSPITAL_STAFF,
		UserRole.ADMIN,
	),
	emergencyController.getEmergencyById,
);

router.patch(
	"/:id/priority",
	auth(UserRole.DISPATCHER, UserRole.ADMIN),
	validateRequest(updatePrioritySchema),
	emergencyController.updatePriority,
);

router.post(
	"/:id/cancel",
	auth(UserRole.PATIENT, UserRole.DISPATCHER, UserRole.ADMIN),
	validateRequest(cancelEmergencySchema),
	emergencyController.cancelEmergency,
);

export const emergencyRoutes = router;
