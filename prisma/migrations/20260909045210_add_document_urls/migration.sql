/*
  Warnings:

  - You are about to drop the column `paymentGatewayRef` on the `payments` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[transactionId]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `registrationDocumentUrl` to the `ambulances` table without a default value. This is not possible if the table is not empty.
  - Added the required column `licenseDocumentUrl` to the `drivers` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ambulances" ADD COLUMN     "registrationDocumentUrl" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "certificationDocumentUrl" TEXT,
ADD COLUMN     "licenseDocumentUrl" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "paymentGatewayRef",
ADD COLUMN     "transactionId" VARCHAR(255);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "entity" VARCHAR(100) NOT NULL,
    "entityId" UUID,
    "description" TEXT,
    "performedBy" UUID NOT NULL,
    "performedByRole" VARCHAR(50) NOT NULL,
    "performedByName" VARCHAR(255) NOT NULL,
    "ipAddress" VARCHAR(45),
    "oldData" JSONB,
    "newData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_performedBy_idx" ON "audit_logs"("performedBy");

-- CreateIndex
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs"("entity");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_transactionId_key" ON "payments"("transactionId");
