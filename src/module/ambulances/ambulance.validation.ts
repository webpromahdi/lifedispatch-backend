import { z } from "zod";
import {
	AmbulanceStatus,
	AmbulanceType,
} from "../../../generated/prisma/enums.js";

export const createAmbulanceSchema = z.object({
	registrationNumber: z
		.string()
		.min(1, "Registration number is required.")
		.max(50, "Registration number must not exceed 50 characters."),

	type: z.nativeEnum(AmbulanceType, {
		error: `Invalid ambulance type. Allowed: ${Object.values(AmbulanceType).join(", ")}`,
	}),

	capabilities: z
		.array(z.string().min(1, "Capability must not be empty."))
		.min(1, "At least one capability is required."),

	baseLocationLat: z
		.number({ error: "Base location latitude must be a number." })
		.min(-90, "Latitude must be between -90 and 90.")
		.max(90, "Latitude must be between -90 and 90."),

	baseLocationLng: z
		.number({ error: "Base location longitude must be a number." })
		.min(-180, "Longitude must be between -180 and 180.")
		.max(180, "Longitude must be between -180 and 180."),

	hospitalId: z
		.string()
		.uuid("Hospital ID must be a valid UUID.")
		.optional(),

	lastServiceDate: z.iso.date().optional(),

	nextServiceDue: z.iso.date().optional(),

	manufacturedYear: z
		.number({ error: "Manufactured year must be a number." })
		.int("Manufactured year must be an integer.")
		.min(1900, "Manufactured year must be after 1900.")
		.max(
			new Date().getFullYear() + 1,
			"Manufactured year cannot be in the future.",
		)
		.optional(),
});

export const updateAmbulanceSchema = z
	.object({
		registrationNumber: z
			.string()
			.min(1, "Registration number is required.")
			.max(50, "Registration number must not exceed 50 characters.")
			.optional(),

		type: z
			.nativeEnum(AmbulanceType, {
				error: `Invalid ambulance type. Allowed: ${Object.values(AmbulanceType).join(", ")}`,
			})
			.optional(),

		capabilities: z
			.array(z.string().min(1, "Capability must not be empty."))
			.min(1, "At least one capability is required.")
			.optional(),

		baseLocationLat: z
			.number({ error: "Base location latitude must be a number." })
			.min(-90, "Latitude must be between -90 and 90.")
			.max(90, "Latitude must be between -90 and 90.")
			.optional(),

		baseLocationLng: z
			.number({ error: "Base location longitude must be a number." })
			.min(-180, "Longitude must be between -180 and 180.")
			.max(180, "Longitude must be between -180 and 180.")
			.optional(),

		currentLat: z
			.number({ error: "Current latitude must be a number." })
			.min(-90, "Latitude must be between -90 and 90.")
			.max(90, "Latitude must be between -90 and 90.")
			.optional(),

		currentLng: z
			.number({ error: "Current longitude must be a number." })
			.min(-180, "Longitude must be between -180 and 180.")
			.max(180, "Longitude must be between -180 and 180.")
			.optional(),

		hospitalId: z
			.string()
			.uuid("Hospital ID must be a valid UUID.")
			.nullable()
			.optional(),

		lastServiceDate: z.iso.date().optional(),

		nextServiceDue: z.iso.date().optional(),

		manufacturedYear: z
			.number({ error: "Manufactured year must be a number." })
			.int("Manufactured year must be an integer.")
			.min(1900, "Manufactured year must be after 1900.")
			.max(
				new Date().getFullYear() + 1,
				"Manufactured year cannot be in the future.",
			)
			.optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field must be provided for update.",
	});

export const updateAmbulanceStatusSchema = z.object({
	status: z.nativeEnum(AmbulanceStatus, {
		error: `Invalid ambulance status. Allowed: ${Object.values(AmbulanceStatus).join(", ")}`,
	}),
});
