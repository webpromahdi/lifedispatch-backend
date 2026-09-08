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

// POST /api/v1/dispatch/recommend
// Dispatcher: Run algorithm → return ranked ambulance candidates
router.post(
	"/recommend",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DISPATCHER),
	validateRequest(recommendSchema),
	dispatchController.recommendAmbulances,
);

// POST /api/v1/dispatch
// Dispatcher: Assign ambulance (atomic + optimistic lock)
router.post(
	"/",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DISPATCHER),
	validateRequest(createDispatchSchema),
	dispatchController.createDispatch,
);

// POST /api/v1/dispatch/:id/accept
// Driver: Accept dispatch
router.post(
	"/:id/accept",
	auth(UserRole.DRIVER),
	dispatchController.acceptDispatch,
);

// POST /api/v1/dispatch/:id/reject
// Driver: Reject dispatch with reason
router.post(
	"/:id/reject",
	auth(UserRole.DRIVER),
	validateRequest(rejectDispatchSchema),
	dispatchController.rejectDispatch,
);

// POST /api/v1/dispatch/:id/cancel
// Dispatcher / Admin: Cancel a pending dispatch
router.post(
	"/:id/cancel",
	auth(UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.DISPATCHER),
	validateRequest(cancelDispatchSchema),
	dispatchController.cancelDispatch,
);

export const dispatchRoutes = router;
