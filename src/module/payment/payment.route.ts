import { Router } from "express";
import { UserRole } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/checkAuth.js";
import { paymentController } from "./payment.controller.js";

const router = Router();

router.post(
	"/:paymentId/initiate",
	auth(UserRole.PATIENT),
	paymentController.initiatePayment,
);

router.get(
	"/:paymentId",
	auth(
		UserRole.PATIENT,
		UserRole.SUPER_ADMIN,
		UserRole.ADMIN,
		UserRole.DISPATCHER,
	),
	paymentController.getPaymentById,
);

router.post("/callback", paymentController.handleCallback);

router.post("/ipn", paymentController.handleIpn);

export const paymentRoutes = router;
