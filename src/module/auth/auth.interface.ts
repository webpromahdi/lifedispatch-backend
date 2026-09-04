import type { UserRole } from "../../../generated/prisma/enums.js";

export type TRegisterPayload = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
};

export type TLoginPayload = {
  email: string;
  password: string;
};
