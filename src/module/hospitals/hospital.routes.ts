import { Router } from "express";
import { UserRole } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { hospitalController } from "./hospital.controller.js";
import {
	createHospitalSchema,
	updateDiversionSchema,
	updateHospitalSchema,
} from "./hospital.validation.js";

const router = Router();

router.post(
	"/create",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN),
	validateRequest(createHospitalSchema),
	hospitalController.createHospital,
);

router.get(
	"/",
	auth(
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		UserRole.DISPATCHER,
		UserRole.DRIVER,
	),
	hospitalController.getAllHospitals,
);

router.patch(
	"/:id",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HOSPITAL_STAFF),
	validateRequest(updateHospitalSchema),
	hospitalController.updateHospital,
);

router.patch(
	"/:id/diversion",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HOSPITAL_STAFF),
	validateRequest(updateDiversionSchema),
	hospitalController.updateDiversion,
);

export const hospitalRoutes = router;
