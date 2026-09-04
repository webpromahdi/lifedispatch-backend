/*
  Warnings:

  - The values [RESERVED,DISPATCHED,AT_SCENE,TRANSPORTING,AT_HOSPITAL,RETURNING,OFF_SHIFT,DECOMMISSIONED] on the enum `AmbulanceStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [ASSIGNED,EN_ROUTE,ARRIVED,PATIENT_PICKED_UP,HOSPITAL_SELECTED,TRANSPORTING,AT_HOSPITAL,ESCALATED] on the enum `EmergencyStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [INITIATED,WAIVED] on the enum `PaymentStatus` will be removed. If these variants are still used in the database, this will fail.
  - The `capabilities` column on the `ambulances` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `shiftStatus` on the `drivers` table. All the data in the column will be lost.
  - The `capabilities` column on the `hospitals` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `eventType` on the `incident_timeline` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "AmbulanceStatus_new" AS ENUM ('AVAILABLE', 'BUSY', 'OUT_OF_SERVICE');
ALTER TABLE "public"."ambulances" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ambulances" ALTER COLUMN "status" TYPE "AmbulanceStatus_new" USING ("status"::text::"AmbulanceStatus_new");
ALTER TYPE "AmbulanceStatus" RENAME TO "AmbulanceStatus_old";
ALTER TYPE "AmbulanceStatus_new" RENAME TO "AmbulanceStatus";
DROP TYPE "public"."AmbulanceStatus_old";
ALTER TABLE "ambulances" ALTER COLUMN "status" SET DEFAULT 'AVAILABLE';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "EmergencyStatus_new" AS ENUM ('PENDING', 'PRIORITIZED', 'DISPATCHING', 'ACTIVE_TRIP', 'COMPLETED', 'CANCELLED', 'REASSIGNMENT_REQUIRED');
ALTER TABLE "public"."emergency_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "emergency_requests" ALTER COLUMN "status" TYPE "EmergencyStatus_new" USING ("status"::text::"EmergencyStatus_new");
ALTER TYPE "EmergencyStatus" RENAME TO "EmergencyStatus_old";
ALTER TYPE "EmergencyStatus_new" RENAME TO "EmergencyStatus";
DROP TYPE "public"."EmergencyStatus_old";
ALTER TABLE "emergency_requests" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "PaymentStatus_new" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');
ALTER TABLE "public"."payments" ALTER COLUMN "paymentStatus" DROP DEFAULT;
ALTER TABLE "payments" ALTER COLUMN "paymentStatus" TYPE "PaymentStatus_new" USING ("paymentStatus"::text::"PaymentStatus_new");
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "public"."PaymentStatus_old";
ALTER TABLE "payments" ALTER COLUMN "paymentStatus" SET DEFAULT 'PENDING';
COMMIT;

-- DropForeignKey
ALTER TABLE "dispatches" DROP CONSTRAINT "dispatches_ambulanceId_fkey";

-- DropForeignKey
ALTER TABLE "dispatches" DROP CONSTRAINT "dispatches_dispatchedBy_fkey";

-- DropForeignKey
ALTER TABLE "dispatches" DROP CONSTRAINT "dispatches_driverId_fkey";

-- DropForeignKey
ALTER TABLE "dispatches" DROP CONSTRAINT "dispatches_emergencyId_fkey";

-- DropForeignKey
ALTER TABLE "drivers" DROP CONSTRAINT "drivers_userId_fkey";

-- DropForeignKey
ALTER TABLE "emergency_requests" DROP CONSTRAINT "emergency_requests_patientId_fkey";

-- DropForeignKey
ALTER TABLE "incident_timeline" DROP CONSTRAINT "incident_timeline_emergencyId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_patientId_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_tripId_fkey";

-- DropForeignKey
ALTER TABLE "trips" DROP CONSTRAINT "trips_ambulanceId_fkey";

-- DropForeignKey
ALTER TABLE "trips" DROP CONSTRAINT "trips_dispatchId_fkey";

-- DropForeignKey
ALTER TABLE "trips" DROP CONSTRAINT "trips_driverId_fkey";

-- DropForeignKey
ALTER TABLE "trips" DROP CONSTRAINT "trips_emergencyId_fkey";

-- DropForeignKey
ALTER TABLE "trips" DROP CONSTRAINT "trips_patientId_fkey";

-- AlterTable
ALTER TABLE "ambulances" DROP COLUMN "capabilities",
ADD COLUMN     "capabilities" TEXT[];

-- AlterTable
ALTER TABLE "drivers" DROP COLUMN "shiftStatus",
ADD COLUMN     "isOnShift" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "hospitals" DROP COLUMN "capabilities",
ADD COLUMN     "capabilities" TEXT[];

-- AlterTable
ALTER TABLE "incident_timeline" DROP COLUMN "eventType",
ADD COLUMN     "eventType" VARCHAR(100) NOT NULL;

-- DropEnum
DROP TYPE "AmbulanceCapability";

-- DropEnum
DROP TYPE "HospitalCapability";

-- DropEnum
DROP TYPE "ShiftStatus";

-- DropEnum
DROP TYPE "TimelineEventType";

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_emergencyId_fkey" FOREIGN KEY ("emergencyId") REFERENCES "emergency_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_ambulanceId_fkey" FOREIGN KEY ("ambulanceId") REFERENCES "ambulances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_dispatchedBy_fkey" FOREIGN KEY ("dispatchedBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_requests" ADD CONSTRAINT "emergency_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_timeline" ADD CONSTRAINT "incident_timeline_emergencyId_fkey" FOREIGN KEY ("emergencyId") REFERENCES "emergency_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_emergencyId_fkey" FOREIGN KEY ("emergencyId") REFERENCES "emergency_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_ambulanceId_fkey" FOREIGN KEY ("ambulanceId") REFERENCES "ambulances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
