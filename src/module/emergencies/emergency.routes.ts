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
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PATIENT, UserRole.DISPATCHER),
	emergencyController.getAllEmergencies,
);

router.get(
	"/:id",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		UserRole.PATIENT,
		UserRole.DISPATCHER,
		UserRole.DRIVER,
		UserRole.HOSPITAL_STAFF,
	),
	emergencyController.getEmergencyById,
);

router.patch(
	"/:id/priority",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DISPATCHER),
	validateRequest(updatePrioritySchema),
	emergencyController.updatePriority,
);

router.post(
	"/:id/cancel",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.PATIENT, UserRole.DISPATCHER),
	validateRequest(cancelEmergencySchema),
	emergencyController.cancelEmergency,
);

export const emergencyRoutes = router;
