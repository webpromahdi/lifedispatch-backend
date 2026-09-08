import { z } from "zod";

export const recommendSchema = z.object({
	emergencyId: z.string().uuid("Emergency ID must be a valid UUID."),
});

export const createDispatchSchema = z.object({
	emergencyId: z.string().uuid("Emergency ID must be a valid UUID."),
	ambulanceId: z.string().uuid("Ambulance ID must be a valid UUID."),
});

export const rejectDispatchSchema = z.object({
	reason: z
		.string()
		.min(1, "Rejection reason is required.")
		.max(1000, "Rejection reason must not exceed 1000 characters."),
});

export const cancelDispatchSchema = z.object({
	reason: z
		.string()
		.min(1, "Cancellation reason is required.")
		.max(1000, "Cancellation reason must not exceed 1000 characters."),
});
