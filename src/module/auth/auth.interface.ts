import type { UserRole, UserStatus } from "../../../generated/prisma/enums.js";

export type TRegisterPayload = {
	name: string;
	email: string;
	password: string;
	role: UserRole;
	phone?: string;
};

export type TLoginUser = {
	id: string;
	name: string;
	email: string | null;
	role: UserRole;
	status: UserStatus;
};
