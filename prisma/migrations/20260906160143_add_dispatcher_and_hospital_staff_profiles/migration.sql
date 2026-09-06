-- CreateTable
CREATE TABLE "dispatchers" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "employeeId" VARCHAR(100),
    "isOnShift" BOOLEAN NOT NULL DEFAULT false,
    "shiftStart" TIMESTAMP(3),
    "shiftEnd" TIMESTAMP(3),
    "totalDispatchesHandled" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital_staff" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "employeeId" VARCHAR(100),
    "designation" VARCHAR(100),
    "isOnShift" BOOLEAN NOT NULL DEFAULT false,
    "shiftStart" TIMESTAMP(3),
    "shiftEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_staff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispatchers_userId_key" ON "dispatchers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "dispatchers_employeeId_key" ON "dispatchers"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_staff_userId_key" ON "hospital_staff"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_staff_employeeId_key" ON "hospital_staff"("employeeId");

-- AddForeignKey
ALTER TABLE "dispatchers" ADD CONSTRAINT "dispatchers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_staff" ADD CONSTRAINT "hospital_staff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospital_staff" ADD CONSTRAINT "hospital_staff_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
