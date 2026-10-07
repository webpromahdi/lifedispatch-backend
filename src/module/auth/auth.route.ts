import { Router } from "express";
import passport from "passport";
import { validateRequest } from "../../middleware/validateRequest.js";
import { auth } from "../../middleware/checkAuth.js";
import { authController } from "./auth.controller.js";
import {
	ChangePasswordZodSchema,
	ForgotPasswordZodSchema,
	loginSchema,
	PatientEmailVerifyZodSchema,
	ResetPasswordZodSchema,
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
	authController.verifyUserEmail,
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

router.post(
	"/forgot-password",
	validateRequest(ForgotPasswordZodSchema),
	authController.forgotPassword,
);
router.post(
	"/reset-password",
	validateRequest(ResetPasswordZodSchema),
	authController.resetPassword,
);

// GET /me — returns the authenticated user's full profile (all roles)
router.get("/me", auth(), authController.getMe);

// Protected: only accessible when logged in (even with mustChangePassword: true)
router.post(
	"/change-password",
	auth(),
	validateRequest(ChangePasswordZodSchema),
	authController.changePassword,
);

// Feature 5: Logout routes — require a valid session
// POST /logout      → revoke current refresh token (single-device logout)
// POST /logout-all  → revoke ALL refresh tokens (logout everywhere)
router.post("/logout", auth(), authController.logout);
router.post("/logout-all", auth(), authController.logoutAll);

export const authRoutes = router;
