-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('PATIENT', 'DISPATCHER', 'DRIVER', 'HOSPITAL_STAFF', 'ADMIN');

-- CreateEnum
CREATE TYPE "BloodType" AS ENUM ('A_POSITIVE', 'A_NEGATIVE', 'B_POSITIVE', 'B_NEGATIVE', 'AB_POSITIVE', 'AB_NEGATIVE', 'O_POSITIVE', 'O_NEGATIVE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AmbulanceType" AS ENUM ('BASIC_LIFE_SUPPORT', 'ADVANCED_LIFE_SUPPORT', 'NEONATAL', 'BARIATRIC', 'PATIENT_TRANSPORT');

-- CreateEnum
CREATE TYPE "AmbulanceStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'DISPATCHED', 'AT_SCENE', 'TRANSPORTING', 'AT_HOSPITAL', 'RETURNING', 'OFF_SHIFT', 'OUT_OF_SERVICE', 'DECOMMISSIONED');

-- CreateEnum
CREATE TYPE "AmbulanceCapability" AS ENUM ('CARDIAC_MONITOR', 'VENTILATOR', 'INCUBATOR', 'DEFIBRILLATOR', 'BARIATRIC_EQUIPMENT', 'NEONATAL_INCUBATOR', 'CPAP', 'MEDICATION_PUMP');

-- CreateEnum
CREATE TYPE "CertificationLevel" AS ENUM ('EMT_BASIC', 'EMT_ADVANCED', 'PARAMEDIC');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('ON_SHIFT', 'OFF_SHIFT');

-- CreateEnum
CREATE TYPE "HospitalDiversionStatus" AS ENUM ('ACCEPTING', 'DIVERTING', 'CLOSED');

-- CreateEnum
CREATE TYPE "HospitalCapability" AS ENUM ('TRAUMA_CENTER', 'CARDIAC_CENTER', 'STROKE_CENTER', 'NEONATAL_ICU', 'BURN_UNIT', 'PSYCHIATRIC_UNIT', 'PEDIATRIC_UNIT', 'ORTHOPEDIC_CENTER');

-- CreateEnum
CREATE TYPE "EmergencyType" AS ENUM ('CARDIAC', 'TRAUMA', 'RESPIRATORY', 'NEUROLOGICAL', 'OBSTETRIC', 'PEDIATRIC', 'PSYCHIATRIC', 'OTHER');

-- CreateEnum
CREATE TYPE "RequiredCapability" AS ENUM ('ALS', 'BLS', 'NEONATAL', 'BARIATRIC');

-- CreateEnum
CREATE TYPE "EmergencyPriority" AS ENUM ('P1_CRITICAL', 'P2_EMERGENCY', 'P3_URGENT', 'P4_NON_URGENT', 'P5_ROUTINE');

-- CreateEnum
CREATE TYPE "EmergencyStatus" AS ENUM ('PENDING', 'PRIORITIZED', 'DISPATCHING', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'PATIENT_PICKED_UP', 'HOSPITAL_SELECTED', 'TRANSPORTING', 'AT_HOSPITAL', 'COMPLETED', 'CANCELLED', 'REASSIGNMENT_REQUIRED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('PENDING_ACCEPTANCE', 'ACCEPTED', 'REJECTED', 'TIMED_OUT', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'INITIATED', 'PAID', 'FAILED', 'REFUNDED', 'WAIVED');

-- CreateEnum
CREATE TYPE "TimelineEventType" AS ENUM ('STATUS_CHANGED', 'AMBULANCE_ASSIGNED', 'AMBULANCE_REJECTED', 'AMBULANCE_TIMED_OUT', 'PRIORITY_CHANGED', 'NOTE_ADDED', 'HOSPITAL_SELECTED', 'HOSPITAL_NOTIFIED', 'ESCALATED', 'REASSIGNMENT_REQUIRED', 'CANCELLED', 'BILLING_GENERATED', 'PAYMENT_RECEIVED');

-- CreateTable
CREATE TABLE "ambulances" (
    "id" UUID NOT NULL,
    "registrationNumber" VARCHAR(50) NOT NULL,
    "type" "AmbulanceType" NOT NULL,
    "status" "AmbulanceStatus" NOT NULL DEFAULT 'AVAILABLE',
    "capabilities" "AmbulanceCapability"[],
    "baseLocationLat" DECIMAL(10,7) NOT NULL,
    "baseLocationLng" DECIMAL(10,7) NOT NULL,
    "currentLat" DECIMAL(10,7),
    "currentLng" DECIMAL(10,7),
    "version" INTEGER NOT NULL DEFAULT 0,
    "lastServiceDate" DATE,
    "nextServiceDue" DATE,
    "manufacturedYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ambulances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispatches" (
    "id" UUID NOT NULL,
    "emergencyId" UUID NOT NULL,
    "ambulanceId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "dispatchedBy" UUID NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'PENDING_ACCEPTANCE',
    "dispatchScore" DECIMAL(8,4),
    "rejectionReason" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "timeoutAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drivers" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "licenseNumber" VARCHAR(100) NOT NULL,
    "licenseExpiry" DATE NOT NULL,
    "certificationLevel" "CertificationLevel" NOT NULL,
    "shiftStatus" "ShiftStatus" NOT NULL DEFAULT 'OFF_SHIFT',
    "shiftStart" TIMESTAMP(3),
    "shiftEnd" TIMESTAMP(3),
    "totalTripsCompleted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "assignedAmbulanceId" UUID,

    CONSTRAINT "drivers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_requests" (
    "id" UUID NOT NULL,
    "incidentNumber" VARCHAR(30) NOT NULL,
    "patientId" UUID NOT NULL,
    "callerPhone" VARCHAR(20) NOT NULL,
    "callerName" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "emergencyType" "EmergencyType" NOT NULL,
    "requiredCapability" "RequiredCapability" NOT NULL,
    "priority" "EmergencyPriority",
    "prioritySetBy" UUID,
    "status" "EmergencyStatus" NOT NULL DEFAULT 'PENDING',
    "locationAddress" TEXT NOT NULL,
    "locationLat" DECIMAL(10,7) NOT NULL,
    "locationLng" DECIMAL(10,7) NOT NULL,
    "dispatcherNotes" TEXT,
    "isEscalated" BOOLEAN NOT NULL DEFAULT false,
    "escalationReason" TEXT,
    "slaTargetMinutes" INTEGER,
    "responseTimeMinutes" DECIMAL(8,2),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "cancelledBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emergency_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitals" (
    "id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "emergencyContact" VARCHAR(20) NOT NULL,
    "capabilities" "HospitalCapability"[],
    "totalErBeds" INTEGER NOT NULL,
    "availableErBeds" INTEGER NOT NULL,
    "diversionStatus" "HospitalDiversionStatus" NOT NULL DEFAULT 'ACCEPTING',
    "diversionReason" TEXT,
    "diversionSetAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "hospitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_timeline" (
    "id" UUID NOT NULL,
    "emergencyId" UUID NOT NULL,
    "eventType" "TimelineEventType" NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT,
    "triggeredBy" UUID,
    "triggeredByRole" VARCHAR(50),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tripId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "invoiceNumber" VARCHAR(30) NOT NULL,
    "baseFare" DECIMAL(10,2) NOT NULL,
    "distanceCharge" DECIMAL(10,2) NOT NULL,
    "waitingCharge" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "additionalCharges" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(5) NOT NULL DEFAULT 'USD',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" VARCHAR(50),
    "paymentGatewayRef" VARCHAR(255),
    "paymentInitiatedAt" TIMESTAMP(3),
    "paymentConfirmedAt" TIMESTAMP(3),
    "refundAmount" DECIMAL(10,2),
    "refundReason" TEXT,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trips" (
    "id" UUID NOT NULL,
    "dispatchId" UUID NOT NULL,
    "emergencyId" UUID NOT NULL,
    "ambulanceId" UUID NOT NULL,
    "driverId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "hospitalId" UUID,
    "departedAt" TIMESTAMP(3),
    "arrivedAtSceneAt" TIMESTAMP(3),
    "patientPickedUpAt" TIMESTAMP(3),
    "hospitalSelectedAt" TIMESTAMP(3),
    "departedToHospitalAt" TIMESTAMP(3),
    "arrivedAtHospitalAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "distanceKm" DECIMAL(8,2),
    "status" "TripStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "UserRole" NOT NULL,
    "fullName" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "email" VARCHAR(255),
    "password" VARCHAR(255) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "emergencyContactName" VARCHAR(255),
    "emergencyContactPhone" VARCHAR(20),
    "bloodType" "BloodType",
    "knownConditions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ambulances_registrationNumber_key" ON "ambulances"("registrationNumber");

-- CreateIndex
CREATE INDEX "dispatches_emergencyId_idx" ON "dispatches"("emergencyId");

-- CreateIndex
CREATE INDEX "dispatches_ambulanceId_idx" ON "dispatches"("ambulanceId");

-- CreateIndex
CREATE INDEX "dispatches_status_idx" ON "dispatches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_userId_key" ON "drivers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_licenseNumber_key" ON "drivers"("licenseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "drivers_assignedAmbulanceId_key" ON "drivers"("assignedAmbulanceId");

-- CreateIndex
CREATE UNIQUE INDEX "emergency_requests_incidentNumber_key" ON "emergency_requests"("incidentNumber");

-- CreateIndex
CREATE INDEX "emergency_requests_status_idx" ON "emergency_requests"("status");

-- CreateIndex
CREATE INDEX "emergency_requests_patientId_idx" ON "emergency_requests"("patientId");

-- CreateIndex
CREATE INDEX "emergency_requests_priority_idx" ON "emergency_requests"("priority");

-- CreateIndex
CREATE INDEX "emergency_requests_createdAt_idx" ON "emergency_requests"("createdAt");

-- CreateIndex
CREATE INDEX "incident_timeline_emergencyId_idx" ON "incident_timeline"("emergencyId");

-- CreateIndex
CREATE INDEX "incident_timeline_createdAt_idx" ON "incident_timeline"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_tripId_key" ON "payments"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_invoiceNumber_key" ON "payments"("invoiceNumber");

-- CreateIndex
CREATE INDEX "payments_patientId_idx" ON "payments"("patientId");

-- CreateIndex
CREATE INDEX "payments_paymentStatus_idx" ON "payments"("paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "trips_dispatchId_key" ON "trips"("dispatchId");

-- CreateIndex
CREATE INDEX "trips_emergencyId_idx" ON "trips"("emergencyId");

-- CreateIndex
CREATE INDEX "trips_status_idx" ON "trips"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_emergencyId_fkey" FOREIGN KEY ("emergencyId") REFERENCES "emergency_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_ambulanceId_fkey" FOREIGN KEY ("ambulanceId") REFERENCES "ambulances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dispatches" ADD CONSTRAINT "dispatches_dispatchedBy_fkey" FOREIGN KEY ("dispatchedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drivers" ADD CONSTRAINT "drivers_assignedAmbulanceId_fkey" FOREIGN KEY ("assignedAmbulanceId") REFERENCES "ambulances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_requests" ADD CONSTRAINT "emergency_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_requests" ADD CONSTRAINT "emergency_requests_prioritySetBy_fkey" FOREIGN KEY ("prioritySetBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_requests" ADD CONSTRAINT "emergency_requests_cancelledBy_fkey" FOREIGN KEY ("cancelledBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_timeline" ADD CONSTRAINT "incident_timeline_emergencyId_fkey" FOREIGN KEY ("emergencyId") REFERENCES "emergency_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "trips"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "dispatches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_emergencyId_fkey" FOREIGN KEY ("emergencyId") REFERENCES "emergency_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_ambulanceId_fkey" FOREIGN KEY ("ambulanceId") REFERENCES "ambulances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trips" ADD CONSTRAINT "trips_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "hospitals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
