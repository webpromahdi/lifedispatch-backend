import { Router } from "express";
import { UserRole } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { hospitalController } from "./hospital.controller.js";
import {
	createHospitalSchema,
	createStaffSchema,
	toggleShiftSchema,
	updateDiversionSchema,
	updateHospitalSchema,
	updateStaffSchema,
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
	"/staff/me/shift",
	auth(UserRole.HOSPITAL_STAFF),
	validateRequest(toggleShiftSchema),
	hospitalController.toggleShift,
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

router.post(
	"/:id/staff/create",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HOSPITAL_STAFF),
	validateRequest(createStaffSchema),
	hospitalController.createStaff,
);

router.get(
	"/:id/staff",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HOSPITAL_STAFF),
	hospitalController.getAllStaff,
);

router.patch(
	"/:id/staff/:staffId",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HOSPITAL_STAFF),
	validateRequest(updateStaffSchema),
	hospitalController.updateStaff,
);

router.delete(
	"/:id/staff/:staffId",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.HOSPITAL_STAFF),
	hospitalController.deleteStaff,
);

export const hospitalRoutes = router;
