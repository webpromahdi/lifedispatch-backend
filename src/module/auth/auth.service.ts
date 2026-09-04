import { AuthProvider } from "../../../generated/prisma/enums.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../utils/AppError.js";
import { TRegisterPayload } from "./auth.interface.js";
import httpStatus from "http-status";
import bcrypt from "bcryptjs";
import config from "../../config/index.js";

const registerUserIntoDB = async (payload: TRegisterPayload) => {
  const { name, email, password, role, phone } = payload;


  const isUserExist = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExist) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "User already exists with this email",
    );
  }

  const hashedPassword = await bcrypt.hash(
    password,
    Number(config.bcrypt_salt_rounds),
  );

  const createUser = await prisma.user.create({
    data: {
      fullName: name,
      email,
      password: hashedPassword,
      role,
      phone: phone ?? null,
      authProvider: AuthProvider.CREDENTIAL,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: createUser.id },
    omit: { password: true },
  });

  return user;
};

export const authService = {
  registerUserIntoDB,
};