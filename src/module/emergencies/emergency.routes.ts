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

export const emergencyRoutes = router;
