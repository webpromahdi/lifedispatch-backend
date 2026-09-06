import { Router } from "express";
import { UserRole } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/checkAuth.js";

import { validateRequest } from "../../middleware/validateRequest.js";
import { emergencyController } from "./emergency.controller.js";
import { createEmergencySchema } from "./emergency.validation.js";

const router = Router();

router.post(
	"/create",
	auth(UserRole.PATIENT),
	validateRequest(createEmergencySchema),
	emergencyController.createEmergency,
);

router.get("/", auth(UserRole.PATIENT), emergencyController.getMyEmergencies);

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

export const emergencyRoutes = router;
