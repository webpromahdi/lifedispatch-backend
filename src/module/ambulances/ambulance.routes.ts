import { Router } from "express";
import { UserRole } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { ambulanceController } from "./ambulance.controller.js";
import {
	createAmbulanceSchema,
	updateAmbulanceSchema,
	updateAmbulanceStatusSchema,
} from "./ambulance.validation.js";

const router = Router();

router.post(
	"/",
	auth(UserRole.ADMIN),
	validateRequest(createAmbulanceSchema),
	ambulanceController.createAmbulance,
);

router.get(
	"/",
	auth(UserRole.ADMIN, UserRole.DISPATCHER),
	ambulanceController.getAllAmbulances,
);

router.get(
	"/:id",
	auth(UserRole.ADMIN, UserRole.DISPATCHER),
	ambulanceController.getAmbulanceById,
);

router.patch(
	"/:id",
	auth(UserRole.ADMIN),
	validateRequest(updateAmbulanceSchema),
	ambulanceController.updateAmbulance,
);

router.patch(
	"/:id/status",
	auth(UserRole.ADMIN, UserRole.DRIVER),
	validateRequest(updateAmbulanceStatusSchema),
	ambulanceController.updateAmbulanceStatus,
);

export const ambulanceRoutes = router;
