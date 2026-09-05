import { z } from "zod";
import { UserRole } from "../../../generated/prisma/enums.js";

export const registerSchema = z.object({
	name: z
		.string("Name must be a string!")
		.min(3, "Name must be at least 3 characters long!")
		.max(255, "Name is too long!"),

	email: z.email("Invalid email address!"),

	password: z
		.string()
		.min(8, "Password must be minimum 8 characters long.")
		.regex(/[a-z]/, "Password must contain at least 1 lowercase letter.")
		.regex(/[A-Z]/, "Password must contain at least 1 uppercase letter.")
		.regex(/[0-9]/, "Password must contain at least 1 number.")
		.regex(
			/[^A-Za-z0-9]/,
			"Password must contain at least 1 special character.",
		),

	role: z.nativeEnum(UserRole, {
		error:
			"Invalid role. Allowed: PATIENT, DRIVER, HOSPITAL_STAFF, DISPATCHER, ADMIN",
	}),

	phone: z.string().max(20, "Phone number is too long!").optional(),
});

export const PatientEmailVerifyZodSchema = z.object({
	email: z.email("Not email!!"),
	otp: z.string().length(6),
});

export const loginSchema = z.object({
	email: z.email("Invalid email address!"),

	password: z.string().min(1, "Password is required."),
});

export const ForgotPasswordZodSchema = z.object({
	email: z.email(),
});

export const ResetPasswordZodSchema = z.object({
	email: z.email(),
	newPassword: z
		.string()
		.min(8, "Password Must Minimum 8 Characters Long.")
		.regex(/[a-z]/, "Password must contain atleast 1 Lowercase Letter")
		.regex(/[A-Z]/, "Password must contain atleast 1 Uppercase Letter")

		.regex(/[0-9]/, "Password must contain atleast 1 Number")
		.regex(/[^A-Za-z0-9]/, "Password must contain atleast 1 Special Character"),
	otp: z.string().length(6),
});
