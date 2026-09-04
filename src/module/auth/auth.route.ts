import { Router } from "express";
import passport from "passport";
import { validateRequest } from "../../middleware/validateRequest.js";
import { authController } from "./auth.controller.js";
import {
	loginSchema,
	PatientEmailVerifyZodSchema,
	registerSchema,
} from "./auth.validation.js";

const router = Router();

router.post(
	"/register",
	validateRequest(registerSchema),
	authController.register,
);
router.post(
	"/verify-email",
	validateRequest(PatientEmailVerifyZodSchema),
	authController.verifyPatientEmail,
);
router.post("/login", validateRequest(loginSchema), authController.loginUser);
router.post("/refresh-token", authController.refreshToken);

router.get(
	"/google",
	passport.authenticate("google", {
		scope: ["profile", "email"],
		prompt: "select_account",
	}),
);
router.get("/google/callback", authController.googleLoginCallback);

export const authRoutes = router;
