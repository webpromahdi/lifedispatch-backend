import { Router } from "express";
import { UserRole } from "../../../generated/prisma/enums.js";
import { auth } from "../../middleware/checkAuth.js";
import { validateRequest } from "../../middleware/validateRequest.js";
import { dispatchController } from "./dispatch.controller.js";
import {
	cancelDispatchSchema,
	createDispatchSchema,
	recommendSchema,
	rejectDispatchSchema,
} from "./dispatch.validation.js";

const router = Router();

router.post(
	"/recommend",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DISPATCHER),
	validateRequest(recommendSchema),
	dispatchController.recommendAmbulances,
);

router.post(
	"/create",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DISPATCHER),
	validateRequest(createDispatchSchema),
	dispatchController.createDispatch,
);

router.post(
	"/:id/accept",
	auth(UserRole.DRIVER),
	dispatchController.acceptDispatch,
);

router.post(
	"/:id/reject",
	auth(UserRole.DRIVER),
	validateRequest(rejectDispatchSchema),
	dispatchController.rejectDispatch,
);

router.post(
	"/:id/cancel",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DISPATCHER),
	validateRequest(cancelDispatchSchema),
	dispatchController.cancelDispatch,
);

export const dispatchRoutes = router;
