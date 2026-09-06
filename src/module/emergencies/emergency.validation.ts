import { z } from "zod";
import {
	EmergencyPriority,
	EmergencyType,
	RequiredCapability,
} from "../../../generated/prisma/enums.js";

export const createEmergencySchema = z.object({
	emergencyType: z.nativeEnum(EmergencyType, {
		error: `Invalid emergency type. Allowed: ${Object.values(EmergencyType).join(", ")}`,
	}),

	requiredCapability: z.nativeEnum(RequiredCapability, {
		error: `Invalid capability. Allowed: ${Object.values(RequiredCapability).join(", ")}`,
	}),

	description: z
		.string()
		.min(1, "Description is required.")
		.max(1000, "Description must not exceed 1000 characters."),

	locationAddress: z
		.string()
		.min(1, "Location address is required.")
		.max(500, "Location address must not exceed 500 characters."),

	locationLat: z
		.number({ error: "Location latitude must be a number." })
		.min(-90, "Latitude must be between -90 and 90.")
		.max(90, "Latitude must be between -90 and 90."),

	locationLng: z
		.number({ error: "Location longitude must be a number." })
		.min(-180, "Longitude must be between -180 and 180.")
		.max(180, "Longitude must be between -180 and 180."),

	callerName: z
		.string()
		.min(1, "Caller name is required.")
		.max(255, "Caller name must not exceed 255 characters."),

	callerPhone: z
		.string()
		.min(1, "Caller phone is required.")
		.max(20, "Caller phone must not exceed 20 characters."),
});

export const updatePrioritySchema = z.object({
	priority: z.nativeEnum(EmergencyPriority, {
		error: `Invalid priority. Allowed: ${Object.values(EmergencyPriority).join(", ")}`,
	}),
});

export const cancelEmergencySchema = z.object({
	reason: z
		.string()
		.min(1, "Cancellation reason is required.")
		.max(1000, "Reason must not exceed 1000 characters."),
});
