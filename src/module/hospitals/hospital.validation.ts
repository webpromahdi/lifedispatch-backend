import { z } from "zod";
import { HospitalDiversionStatus } from "../../../generated/prisma/enums.js";

export const createHospitalSchema = z.object({
	name: z
		.string()
		.min(1, "Hospital name is required.")
		.max(255, "Hospital name must not exceed 255 characters."),

	address: z
		.string()
		.min(1, "Address is required.")
		.max(1000, "Address must not exceed 1000 characters."),

	lat: z
		.number({ error: "Latitude must be a number." })
		.min(-90, "Latitude must be between -90 and 90.")
		.max(90, "Latitude must be between -90 and 90."),

	lng: z
		.number({ error: "Longitude must be a number." })
		.min(-180, "Longitude must be between -180 and 180.")
		.max(180, "Longitude must be between -180 and 180."),

	phone: z
		.string()
		.min(1, "Phone is required.")
		.max(20, "Phone must not exceed 20 characters."),

	emergencyContact: z
		.string()
		.min(1, "Emergency contact is required.")
		.max(20, "Emergency contact must not exceed 20 characters."),

	capabilities: z
		.array(z.string().min(1, "Capability must not be empty."))
		.min(1, "At least one capability is required."),

	totalErBeds: z
		.number({ error: "Total ER beds must be a number." })
		.int("Total ER beds must be an integer.")
		.min(0, "Total ER beds must be a non-negative integer."),

	availableErBeds: z
		.number({ error: "Available ER beds must be a number." })
		.int("Available ER beds must be an integer.")
		.min(0, "Available ER beds must be a non-negative integer."),

	staffName: z
		.string()
		.min(1, "Staff name is required.")
		.max(255, "Staff name must not exceed 255 characters."),

	staffEmail: z
		.string()
		.min(1, "Staff email is required.")
		.email("Staff email must be a valid email address."),

	staffPassword: z
		.string()
		.min(8, "Staff password must be at least 8 characters.")
		.max(100, "Staff password must not exceed 100 characters."),

	staffPhone: z
		.string()
		.min(1, "Staff phone must not be empty.")
		.max(20, "Staff phone must not exceed 20 characters.")
		.optional(),

	staffDesignation: z
		.string()
		.min(1, "Staff designation must not be empty.")
		.max(100, "Staff designation must not exceed 100 characters.")
		.optional(),

	staffEmployeeId: z
		.string()
		.min(1, "Employee ID must not be empty.")
		.max(100, "Employee ID must not exceed 100 characters.")
		.optional(),
});

export const updateHospitalSchema = z
	.object({
		name: z
			.string()
			.min(1, "Hospital name is required.")
			.max(255, "Hospital name must not exceed 255 characters.")
			.optional(),

		address: z
			.string()
			.min(1, "Address is required.")
			.max(1000, "Address must not exceed 1000 characters.")
			.optional(),

		lat: z
			.number({ error: "Latitude must be a number." })
			.min(-90, "Latitude must be between -90 and 90.")
			.max(90, "Latitude must be between -90 and 90.")
			.optional(),

		lng: z
			.number({ error: "Longitude must be a number." })
			.min(-180, "Longitude must be between -180 and 180.")
			.max(180, "Longitude must be between -180 and 180.")
			.optional(),

		phone: z
			.string()
			.min(1, "Phone is required.")
			.max(20, "Phone must not exceed 20 characters.")
			.optional(),

		emergencyContact: z
			.string()
			.min(1, "Emergency contact is required.")
			.max(20, "Emergency contact must not exceed 20 characters.")
			.optional(),

		capabilities: z
			.array(z.string().min(1, "Capability must not be empty."))
			.min(1, "At least one capability is required.")
			.optional(),

		totalErBeds: z
			.number({ error: "Total ER beds must be a number." })
			.int("Total ER beds must be an integer.")
			.min(0, "Total ER beds must be a non-negative integer.")
			.optional(),

		availableErBeds: z
			.number({ error: "Available ER beds must be a number." })
			.int("Available ER beds must be an integer.")
			.min(0, "Available ER beds must be a non-negative integer.")
			.optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field must be provided for update.",
	});

export const updateDiversionSchema = z.object({
	diversionStatus: z.nativeEnum(HospitalDiversionStatus, {
		error: `Invalid diversion status. Allowed: ${Object.values(HospitalDiversionStatus).join(", ")}`,
	}),

	diversionReason: z
		.string()
		.min(1, "Diversion reason must not be empty.")
		.max(1000, "Diversion reason must not exceed 1000 characters.")
		.optional(),

	availableErBeds: z
		.number({ error: "Available ER beds must be a number." })
		.int("Available ER beds must be an integer.")
		.min(0, "Available ER beds must be a non-negative integer.")
		.optional(),
});

export const createStaffSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required.")
		.max(255, "Name must not exceed 255 characters."),

	email: z
		.string()
		.min(1, "Email is required.")
		.email("Email must be a valid email address."),

	password: z
		.string()
		.min(8, "Password must be at least 8 characters.")
		.max(100, "Password must not exceed 100 characters."),

	phone: z
		.string()
		.min(1, "Phone must not be empty.")
		.max(20, "Phone must not exceed 20 characters.")
		.optional(),

	designation: z
		.string()
		.min(1, "Designation must not be empty.")
		.max(100, "Designation must not exceed 100 characters.")
		.optional(),

	employeeId: z
		.string()
		.min(1, "Employee ID must not be empty.")
		.max(100, "Employee ID must not exceed 100 characters.")
		.optional(),

	canManageStaff: z.boolean().optional(),
});

export const updateStaffSchema = z
	.object({
		name: z
			.string()
			.min(1, "Name must not be empty.")
			.max(255, "Name must not exceed 255 characters.")
			.optional(),

		phone: z
			.string()
			.min(1, "Phone must not be empty.")
			.max(20, "Phone must not exceed 20 characters.")
			.optional(),

		designation: z
			.string()
			.min(1, "Designation must not be empty.")
			.max(100, "Designation must not exceed 100 characters.")
			.optional(),

		employeeId: z
			.string()
			.min(1, "Employee ID must not be empty.")
			.max(100, "Employee ID must not exceed 100 characters.")
			.nullable()
			.optional(),

		canManageStaff: z.boolean().optional(),
	})
	.refine((data) => Object.keys(data).length > 0, {
		message: "At least one field must be provided for update.",
	});

export const toggleShiftSchema = z.object({
	action: z.enum(["start", "end"], {
		error: "Action must be either 'start' or 'end'.",
	}),
});
