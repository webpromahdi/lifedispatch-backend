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

router.get(
	"/analytics/overview",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN),
	adminController.getAnalyticsOverview,
);

router.get(
	"/analytics/emergencies",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN),
	adminController.getEmergencyAnalytics,
);

router.get(
	"/analytics/payments",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN),
	adminController.getPaymentAnalytics,
);

router.get(
	"/audit-logs",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN),
	adminController.getAuditLogs,
);

export const adminRoutes = router;

