import { Router } from "express";
import { UserRole } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/checkAuth.js";
import { adminController } from "./admin.controller.js";

const router = Router();

router.get(
	"/users",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN),
	adminController.getAllUsers,
);

router.patch(
	"/users/:id/status",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN),
	adminController.updateUserStatus,
);

export const adminRoutes = router;
