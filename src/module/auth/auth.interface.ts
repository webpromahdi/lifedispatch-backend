import type { UserRole, UserStatus } from "../../../generated/prisma/enums.js";

export interface IRegisterPayload {
	name: string;
	email: string;
	password: string;
	role: UserRole;
	phone?: string;
}

export interface IVerifyEmailPayload {
	email: string;
	otp: string;
}

export interface ILoginUser {
	id: string;
	name: string;
	email: string | null;
	role: UserRole;
	status: UserStatus;
}

export interface IForgotPasswordPayload {
	email: string;
}
export interface IResetPasswordPayload {
	email: string;
	newPassword: string;
	otp: string;
}
