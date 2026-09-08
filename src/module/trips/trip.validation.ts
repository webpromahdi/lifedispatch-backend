import { z } from "zod";

export const updateTripStatusSchema = z.object({
	status: z
		.string()
		.refine((v) => ["ACTIVE", "CANCELLED"].includes(v), {
			message: "Status must be ACTIVE or CANCELLED.",
		}),
});

export const selectHospitalSchema = z.object({
	hospitalId: z.string().uuid("Hospital ID must be a valid UUID."),
});

export const completeTripSchema = z.object({
	distanceKm: z
		.number()
		.positive("distanceKm must be a positive number.")
		.max(9999.99, "distanceKm exceeds maximum allowed value."),
	arrivedAtHospitalAt: z
		.string()
		.datetime({ message: "arrivedAtHospitalAt must be a valid ISO 8601 datetime." })
		.optional(),
});
