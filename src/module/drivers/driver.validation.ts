import { z } from "zod";
import { CertificationLevel } from "../../../generated/prisma/enums.js";

export const createDriverSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required.")
		.max(255, "Name must not exceed 255 characters."),

	email: z
		.string()
		.min(1, "Email is required.")
		.email("Email must be a valid email address."),

	phone: z
		.string()
		.min(1, "Phone must not be empty.")
		.max(20, "Phone must not exceed 20 characters.")
		.optional(),

	password: z
		.string()
		.min(8, "Password must be at least 8 characters.")
		.max(100, "Password must not exceed 100 characters."),

	licenseNumber: z
		.string()
		.min(1, "License number is required.")
		.max(100, "License number must not exceed 100 characters."),

	licenseExpiry: z.iso.date(),

	certificationLevel: z.nativeEnum(CertificationLevel, {
		error: `Invalid certification level. Allowed: ${Object.values(CertificationLevel).join(", ")}`,
	}),

	assignedAmbulanceId: z
		.string()
		.uuid("Assigned ambulance ID must be a valid UUID.")
		.optional(),
});

export const updateDriverSchema = z
	.object({
		licenseNumber: z
			.string()
			.min(1, "License number is required.")
			.max(100, "License number must not exceed 100 characters.")
			.optional(),

		licenseExpiry: z.iso.date().optional(),

		certificationLevel: z
			.nativeEnum(CertificationLevel, {
				error: `Invalid certification level. Allowed: ${Object.values(CertificationLevel).join(", ")}`,
			})
			.optional(),

		assignedAmbulanceId: z
			.string()
			.uuid("Assigned ambulance ID must be a valid UUID.")
			.nullable()
			.optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field must be provided for update.",
	});

export const toggleShiftSchema = z.object({
	action: z.enum(["start", "end"], {
		error: "Action must be either 'start' or 'end'.",
	}),
});
