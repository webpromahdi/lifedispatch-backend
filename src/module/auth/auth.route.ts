import { Router } from "express";
import { validateRequest } from "../../middleware/validateRequest.js";
import { authController } from "./auth.controller.js";
import { registerSchema } from "./auth.validation.js";

const router = Router();

router.post(
	"/register",
	validateRequest(registerSchema),
	authController.register,
);

export const authRoutes = router;
