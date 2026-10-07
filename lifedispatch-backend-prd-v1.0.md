# Product Requirements Document (PRD)
## LifeDispatch — Emergency Ambulance Dispatch System (EADS)

> **Version:** 1.0 — Production-Ready Backend
> **Generated:** 2026-09-09 (Source of truth: live codebase + blueprint.md + FEATURES_AND_APIS.md)
> **Architecture:** Node.js · Express.js · Prisma ORM 5.15+ · PostgreSQL · Zod · Passport.js · Cloudinary · Multer

---

## 1. Overview & Business Context

### 1.1 Core Purpose

**LifeDispatch** is a production-grade backend platform that manages the **complete lifecycle of a medical emergency** — from the moment a caller reports an incident to the final payment receipt after hospital drop-off. It orchestrates patients, dispatchers, ambulance crews, and hospitals through a **state-driven, role-enforced workflow** built on top of real-world Computer-Aided Dispatch (CAD) and Medical Priority Dispatch System (MPDS) concepts.

The system solves the critical coordination problem inherent in emergency medical services:
- Eliminating double-booking of ambulance units via optimistic concurrency control
- Ensuring capability-matched ambulance assignment (ALS vs. BLS vs. NEONATAL)
- Providing an auditable, immutable event trail for every emergency incident
- Managing hospital capacity and diversion status to guide drivers to the right facility
- Automating billing upon trip completion and integrating with a real payment gateway

### 1.2 User Personas & Target Audience

The system enforces a **6-role RBAC** model, verified in [enums.prisma](file:///d:/level-2/lifedispatch/lifedispatch-backend/prisma/schema/enums.prisma) and [admin.routes.ts](file:///d:/level-2/lifedispatch/lifedispatch-backend/src/module/admin/admin.routes.ts):

| Role | Description | Key Responsibilities |
|------|-------------|---------------------|
| `SUPER_ADMIN` | Platform owner | Full access to all modules, analytics, and user management |
| `ADMIN` | Operations manager | Manage fleet, hospitals, users, analytics; create dispatches |
| `PATIENT` | Service consumer | Create emergency requests, track trips, initiate payment |
| `DISPATCHER` | Emergency coordinator | Prioritize emergencies, run recommendation engine, assign ambulances |
| `DRIVER` | Field crew | Accept/reject dispatches, update trip milestones, complete trips |
| `HOSPITAL_STAFF` | Receiving facility | Manage hospital details, diversion status, and staff shifts |

Each role maps to a specific persona:

**Patient**
Patients use the system during a medical crisis, usually from a mobile phone. They need an ambulance to arrive quickly, and they need to know its exact ETA. Their main frustrations in traditional systems are placing a call and waiting with no updates, or receiving a confusing bill days later.

**Dispatcher**
Dispatchers work in a noisy control room, managing several emergencies at once across multiple screens. Their job is to clear the queue by matching the right ambulance to the patient's medical needs. They get frustrated when they try to assign an ambulance only to find another dispatcher just booked it, or when they send a unit that lacks the right medical equipment.

**Driver**
Drivers operate inside a moving ambulance. They deal with traffic, sirens, and direct patient care. They need clear routing to the patient and the hospital, along with simple buttons to update their trip status. They get frustrated by complex software interfaces, being dispatched to a hospital that has no open beds, or receiving assignments right as their shift ends.

**Hospital Staff**
Hospital staff manage the emergency room front desk. They need to control patient flow so the facility does not get overwhelmed. They get frustrated when ambulances arrive unannounced while the ER is at full capacity, often because the hospital's diversion status was not updated in real time.

**Admin**
Admins work in a back office. They keep the fleet operational, manage driver shifts, and track revenue. They struggle with fragmented audit trails when investigating a complaint. They also face compliance risks if drivers operate with expired licenses or ambulances miss their service dates.

**Super Admin**
Super Admins manage the technical health and security of the platform. They provision admin accounts, monitor system-wide analytics, and audit security events.

### 1.3 Problem Statement

Traditional EMS coordination suffers from:
- Manual phone-based ambulance assignment causing delays and double-booking
- No structured priority triaging system (P1–P5)
- Lack of real-time visibility for dispatchers into ambulance availability, location, and capability
- No automated billing tied to completed trips
- No immutable audit trail for compliance and incident review

LifeDispatch addresses each of these systematically through its modular, transactional backend.

### 1.4 In-Scope vs. Out-of-Scope (Non-Goals)

To prevent scope creep, the following boundaries define what version 1.0 of the backend does and does not include.

**In-Scope**
- A complete REST API for the six user roles.
- Optimistic concurrency control for ambulance dispatching.
- Haversine-based distance scoring for ambulance recommendations.
- Integration with SSLCommerz for payment processing in BDT.
- On-demand PDF invoice generation for completed trips.
- Manual tracking of hospital diversion status and ER bed capacity.

**Out-of-Scope (Non-Goals)**
- **Push Notifications & WebSockets:** The backend does not push events to clients. Drivers check for new dispatches by polling a specific endpoint (`GET /api/v1/dispatch/me`).
- **Live IoT GPS Streaming:** The system accepts location updates via standard HTTP requests. It does not maintain continuous WebSocket connections for live vehicle tracking.
- **Automated Hospital Integration:** The system does not connect to hospital electronic health record (EHR) systems to read bed capacity automatically. Hospital staff update capacity manually.
- **In-App Communication:** The backend does not support in-app chat or voice calls between dispatchers, drivers, and patients.
- **Multi-currency Payments:** The payment gateway supports only BDT via SSLCommerz. International gateways like Stripe are excluded.
- **Frontend Applications:** This project covers the backend API only. Client applications (mobile or web) are built separately.

---

## 2. Core Features & Functional Requirements

### Feature Set 1: Authentication & Identity Management

**User Story 1.1** — As a new patient, I want to register an account so that I can create emergency requests.
**Acceptance Criteria:**
- `POST /api/v1/auth/register` accepts `name`, `email`, `password`, and optional medical fields
- New users default to `role: PATIENT`, `status: ACTIVE`, `isVerified: false`
- Password is never returned in any response (omitted via `omit: { password: true }`)

**User Story 1.2** — As a registered user, I want to log in and receive tokens so that I can authenticate subsequent requests.
**Acceptance Criteria:**
- `POST /api/v1/auth/login` returns an access token (JWT) and refresh token; login is blocked with HTTP 403 for accounts with `status: SUSPENDED` or `status: DELETED`
- `POST /api/v1/auth/refresh-token` exchanges a valid, non-revoked refresh token for a new access token (with automatic token rotation)
- Google OAuth flow via `GET /api/v1/auth/google` and `/google/callback` supported via Passport.js

**User Story 1.3** — As a user who forgot my password, I want to reset it securely.
**Acceptance Criteria:**
- `POST /api/v1/auth/forgot-password` initiates password reset via OTP
- `POST /api/v1/auth/reset-password` completes the reset with the OTP; on success, all existing sessions are revoked

**User Story 1.4** — As an admin, I want to provision accounts for drivers and hospital staff securely, so the system can enforce a mandatory password change on their first login.
**Acceptance Criteria:**
- Admin creation endpoints (`POST /api/v1/drivers/create`, `POST /api/v1/hospitals/create`, and staff endpoints) auto-generate a secure 32-character temporary password.
- New users for these roles are created with `mustChangePassword: true` and `isVerified: false`.
- The system automatically emails the temporary credentials to the user.
- A global middleware blocks all protected endpoints (except `/api/v1/auth/change-password`) for users with `mustChangePassword: true`.
- `POST /api/v1/auth/change-password` securely updates the password, clears the flag, sets `isVerified: true`, sends a confirmation email, and revokes all prior sessions.

**User Story 1.5** — As a user, I want to log out or revoke my session so that a lost device or compromised token cannot keep accessing my account.
**Acceptance Criteria:**
- Each refresh token issued at login or registration is tracked server-side in a Redis Set keyed by `refresh-tokens:{userId}` with a 7-day TTL.
- `POST /api/v1/auth/logout` removes the current refresh token from the Redis set, immediately invalidating it; both auth cookies are cleared.
- `POST /api/v1/auth/logout-all` deletes the entire Redis set for the user, invalidating every active session across all devices — useful after a password change or suspected compromise.
- `POST /api/v1/auth/refresh-token` validates that the incoming token exists in the Redis set before issuing a new access token; a revoked token yields HTTP 401.
- Access tokens are short-lived (24 hours) and are not individually blocklisted; revoking the refresh token is sufficient to bound the risk window.

**User Story 1.6** — As an admin, I want a suspended or deleted user to immediately lose all access so that account suspension or deletion is not merely a cosmetic flag.
**Acceptance Criteria:**
- The auth middleware (`checkAuth`) re-fetches the user's current `status` and `isDeleted` from the database on every authenticated request — not only at login time.
- A request carrying a valid access token from an account that has been suspended or deleted after token issuance is rejected with HTTP 403 at the middleware level, before any controller logic runs.
- `POST /api/v1/auth/refresh-token` enforces the same check: a suspended or deleted user cannot silently obtain a new access token by using their refresh token.

**User Story 1.7** — As a logged-in user, I want to fetch my own profile so that I can display it on my profile page.
**Acceptance Criteria:**
- `GET /api/v1/auth/me` returns the authenticated user's full profile
- Password is never returned (`omit: { password: true }`)
- Soft-deleted users (`isDeleted: true`) receive HTTP 404
- Accessible to all authenticated roles (no role restriction)
- User identity is read from the JWT payload already verified by `checkAuth` middleware

---


### Feature Set 2: Emergency Request Lifecycle

**User Story 2.1** — As a patient, I want to report a medical emergency so that an ambulance can be dispatched.
**Acceptance Criteria:**
- `POST /api/v1/emergencies/create` requires: `emergencyType`, `requiredCapability`, `description`, `locationAddress`, `locationLat`, `locationLng`, `callerName`, `callerPhone`
- A unique `incidentNumber` is auto-generated in the format `INC-{YEAR}-{000001}`
- Status defaults to `PENDING`
- An `IncidentTimeline` event `EMERGENCY_CREATED` is appended atomically in the same transaction
- **Blocking constraint:** A patient with any active emergency in `[PENDING, PRIORITIZED, DISPATCHING, ACTIVE_TRIP]` statuses cannot create a new one (HTTP 409 CONFLICT)

**User Story 2.2** — As a dispatcher, I want to assign a priority level to an emergency so that the most critical cases are handled first.
**Acceptance Criteria:**
- `PATCH /api/v1/emergencies/:id/priority` sets priority to `P1_CRITICAL`, `P2_EMERGENCY`, `P3_URGENT`, `P4_NON_URGENT`, or `P5_ROUTINE`
- If emergency is `PENDING`, status automatically upgrades to `PRIORITIZED` upon priority assignment
- Timeline events `PRIORITY_UPDATED` and `STATUS_UPDATED` (if status changed) are appended atomically
- Blocked for emergencies in `CANCELLED` or `COMPLETED` status

**User Story 2.3** — As a patient or dispatcher, I want to cancel an active emergency with a reason.
**Acceptance Criteria:**
- `POST /api/v1/emergencies/:id/cancel` requires `reason` in the request body
- A patient can only cancel their own emergencies (enforced via ownership check)
- Blocked for already `CANCELLED` or `COMPLETED` emergencies
- Sets `cancelledAt`, `cancellationReason`, `cancelledBy` and appends `EMERGENCY_CANCELLED` timeline event

---

### Feature Set 3: Ambulance Fleet Management

**User Story 3.1** — As an admin, I want to register ambulances in the fleet so that they can be assigned to emergencies.
**Acceptance Criteria:**
- `POST /api/v1/ambulances/create` requires `registrationNumber` (unique), `type`, `baseLocationLat`, `baseLocationLng`
- Optional: `capabilities[]`, `hospitalId`, `lastServiceDate`, `nextServiceDue`, `manufacturedYear`, `registrationDocument` (File via Cloudinary)
- Default status: `AVAILABLE`

**User Story 3.2** — As a dispatcher, I want to view available ambulances so that I can make informed dispatch decisions.
**Acceptance Criteria:**
- `GET /api/v1/ambulances` returns paginated fleet list accessible to `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`
- Soft-deleted ambulances (`deletedAt != null`) are excluded from all queries
- `PATCH /api/v1/ambulances/:id/status` allows updating `AmbulanceStatus` to `AVAILABLE`, `BUSY`, or `OUT_OF_SERVICE`

---

### Feature Set 4: Dispatch Algorithm & Workflow

**User Story 4.1** — As a dispatcher, I want the system to recommend the best-scored ambulances for an emergency.
**Acceptance Criteria:**
- `POST /api/v1/dispatch/recommend` requires `emergencyId`
- Emergency must be in `PRIORITIZED` or `DISPATCHING` status
- Candidates are ambulances with `status: AVAILABLE`, `deletedAt: null`, and an assigned driver with `isOnShift: true` and an unexpired license
- Candidates filtered by `capabilityTypeMap`: `ALS → [ADVANCED_LIFE_SUPPORT]`, `BLS → [BASIC_LIFE_SUPPORT, PATIENT_TRANSPORT]`, `NEONATAL → [NEONATAL]`, `BARIATRIC → [BARIATRIC]`; `ADVANCED_LIFE_SUPPORT` is always overqualified-acceptable
- Note: Ambulances with an overdue service date will still be included but flagged with `serviceOverdue: true`
- **Scoring algorithm** (weights sum to 1.0):
  - Distance score: `1 - distanceKm / maxDistance` (weight: **0.5**) — uses Haversine formula, prefers `currentLat/Lng` over `baseLocation`
  - Priority score: exact capability match = `1.0`, overqualified = `0.8`, underqualified = `0.5` (weight: **0.3**)
  - Type score: exact match = `1.0`, overqualified = `0.8` (weight: **0.2**)
- Returns top 5 candidates sorted by composite score descending, with full `scoreBreakdown`

**User Story 4.2** — As a dispatcher, I want to assign an ambulance to an emergency with a built-in acceptance timeout.
**Acceptance Criteria:**
- `POST /api/v1/dispatch/create` requires `emergencyId` and `ambulanceId`
- Pre-dispatch validations: emergency must be `PRIORITIZED` or `DISPATCHING`, ambulance must be `AVAILABLE`, driver must be `isOnShift: true`, driver license must not be expired, capability check must pass
- **Optimistic locking:** Uses `ambulance.version` field — transaction updates ambulance status to `BUSY` only if `version` matches read value (`updateMany count === 0` → HTTP 409: "Ambulance was just reserved by another dispatcher")
- Dispatch record created with `status: PENDING_ACCEPTANCE`, `timeoutAt = now + 2 minutes`. If ambulance service is overdue, returns a `serviceOverdueWarning` along with the success message.
- Emergency status transitions to `DISPATCHING`
- Appends `AMBULANCE_DISPATCHED` timeline event with timeout ISO string in notes

**User Story 4.3** — As a driver, I want to accept a dispatch assignment so that a trip can begin.
**Acceptance Criteria:**
- `POST /api/v1/dispatch/:id/accept` — driver must be the assigned driver for this dispatch
- Blocked if dispatch is not `PENDING_ACCEPTANCE` or if `new Date() > dispatch.timeoutAt` (HTTP 400: timed out)
- On success (atomic transaction): dispatch → `ACCEPTED`, `acceptedAt` set; new `Trip` created with `status: ACTIVE`; emergency → `ACTIVE_TRIP`; `DISPATCH_ACCEPTED` timeline event appended

**User Story 4.4** — As a driver, I want to reject a dispatch with a reason.
**Acceptance Criteria:**
- `POST /api/v1/dispatch/:id/reject` requires `reason`; driver ownership enforced
- On success: dispatch → `REJECTED`, `rejectedAt` set, `rejectionReason` stored; ambulance → `AVAILABLE`; emergency → `DISPATCHING` (remains reassignable); `DISPATCH_REJECTED` timeline event appended

**User Story 4.5** — As a dispatcher, I want to cancel an active dispatch manually.
**Acceptance Criteria:**
- `POST /api/v1/dispatch/:id/cancel` — can only cancel dispatches in `PENDING_ACCEPTANCE` status
- On success: dispatch → `CANCELLED`; ambulance → `AVAILABLE`; emergency → `DISPATCHING`; `DISPATCH_CANCELLED` timeline event appended with actor role in notes

**User Story 4.6** — As a driver, I want to see dispatches assigned to me so that I can accept or reject them without relying on an external notification system.
**Acceptance Criteria:**
- `GET /api/v1/dispatch/me` — accessible to `DRIVER` only; returns all dispatches in `PENDING_ACCEPTANCE` status assigned to the authenticated driver, ordered by `createdAt DESC`
- Response includes full emergency context (`incidentNumber`, `emergencyType`, `priority`, `locationAddress`, `locationLat/Lng`, `description`, `callerName`, `callerPhone`) and ambulance details (`registrationNumber`, `type`, `capabilities`) — everything needed to render an accept/reject UI
- `timeoutAt` is always present in the response so the frontend can display a live countdown timer without any additional calls
- Designed for polling — returns an empty array (not a 404) when no pending dispatches exist, making it safe to call on a short interval
- `GET /api/v1/dispatch/:id` — accessible to `DRIVER`, `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`; fetches full detail of a single dispatch record including related driver, ambulance, emergency, and linked trip (if any); `DRIVER` role is restricted to their own dispatch (HTTP 403 if not the assigned driver); admin roles have unrestricted access
- **Route ordering constraint:** `GET /me` is registered before `GET /:id` in the Express router to prevent the literal string `"me"` from being captured as an ID parameter

---

### Feature Set 5: Trip Lifecycle Management

**User Story 5.1** — As a driver, I want to update trip milestones so that stakeholders can track real-time progress.
**Acceptance Criteria:**
- `PATCH /api/v1/trips/:id/status` — driver ownership enforced; trip must be `ACTIVE`
- Payload-driven timestamp updates (e.g., `departedAt`, `arrivedAtSceneAt`, `patientPickedUpAt`)
- **Blocked:** Cannot set `COMPLETED` via this endpoint — must use `POST /complete`
- If `CANCELLED` submitted: dispatch → `COMPLETED`, ambulance → `AVAILABLE`, emergency → `CANCELLED`, `TRIP_CANCELLED` timeline event appended

**User Story 5.2** — As a driver, I want to select the destination hospital based on capacity and diversion status.
**Acceptance Criteria:**
- `PATCH /api/v1/trips/:id/hospital` — accessible to `DRIVER`, `DISPATCHER`, `SUPER_ADMIN`, `ADMIN`
- Trip must be `ACTIVE`; hospital must exist in the system
- Sets `hospitalId`, `hospitalSelectedAt` on the trip
- Appends `HOSPITAL_SELECTED` timeline event with hospital name

**User Story 5.3** — As a driver, I want to complete a trip so that billing is automatically generated.
**Acceptance Criteria:**
- `POST /api/v1/trips/:id/complete` — driver ownership enforced; trip must be `ACTIVE`; no existing payment for this trip
- Payload: `distanceKm` (required), `arrivedAtHospitalAt` (optional, defaults to `now()`)
- **Fare calculation:**
  - `baseFare` = **500 BDT** (fixed)
  - `distanceCharge` = `distanceKm x 35 BDT/km`
  - `totalAmount` = `baseFare + distanceCharge`; currency defaults to `BDT`
- Atomic transaction: trip → `COMPLETED`, dispatch → `COMPLETED`, ambulance → `AVAILABLE`, emergency → `COMPLETED`, `responseTimeMinutes` calculated from `emergency.createdAt` to `now()`, `Payment` created (`status: PENDING`), `TRIP_COMPLETED` timeline event appended
- **PDF Invoice** generated in-memory via PDFKit after DB transaction; returned in response (format: `INV-{base36 timestamp}-{random 4-char}`)

---

### Feature Set 6: Hospital Management

**User Story 6.1** — As a hospital staff member, I want to update our diversion status and ER bed capacity so that drivers are directed to appropriate facilities.
**Acceptance Criteria:**
- `PATCH /api/v1/hospitals/:id/diversion` sets `diversionStatus` to `ACCEPTING`, `DIVERTING`, or `CLOSED`; stores `diversionReason`, `diversionSetAt`, and allows updating `availableErBeds`
- `GET /api/v1/hospitals` supports filtering by `hasCapacity=true` to only return hospitals with available ER beds
- `GET /api/v1/hospitals/:id` returns full hospital detail including `totalErBeds`, `availableErBeds`, and derived `occupancyPercent`
- Accessible to `SUPER_ADMIN`, `ADMIN`, `HOSPITAL_STAFF`

**User Story 6.2** — As an admin, I want to manage hospital staff rosters.
**Acceptance Criteria:**
- `POST /api/v1/hospitals/:id/staff/create` adds a new `HospitalStaff` profile linked to an existing `User`
- `GET /api/v1/hospitals/:id/staff` lists all staff for a hospital
- `PATCH /api/v1/hospitals/:id/staff/:staffId` updates staff details (designation, `canManageStaff`)
- `DELETE /api/v1/hospitals/:id/staff/:staffId` soft-deactivates a staff member
- `PATCH /api/v1/hospitals/staff/me/shift` allows hospital staff to toggle `isOnShift`

---

### Feature Set 7: Payment Gateway Integration

**User Story 7.1** — As a patient, I want to pay my trip invoice online so that I can settle my bill.
**Acceptance Criteria:**
- `POST /api/v1/payment/:paymentId/initiate` — patient must own this record; blocked if already `PAID`
- Generates `transactionId` in format `LD-{invoiceNumber}-{timestamp}`
- Posts session to **SSLCommerz sandbox** (`sandbox.sslcommerz.com`) with customer and product info
- Returns `{ gatewayUrl, transactionId }` on success

**User Story 7.2** — As the system, I want to process payment gateway callbacks and IPN notifications securely.
**Acceptance Criteria:**
- `POST /api/v1/payment/callback` — public; verifies `transactionId` matches stored value; on `status=success`, validates with SSLCommerz validation API; payment → `PAID` if `VALID/VALIDATED`, `FAILED` otherwise; redirects to `{frontend_url}/payment/result?status=...`
- `POST /api/v1/payment/ipn` — public, idempotent (skips already-`PAID` records); verifies via SSLCommerz; sets `PAID` or `FAILED`
- **Tamper detection:** HTTP 400 if `transactionId` in callback doesn't match DB record

---

### Feature Set 8: Admin Analytics & Audit

**User Story 8.1** — As an admin, I want a real-time dashboard overview so that I can monitor system health.
**Acceptance Criteria:**
- `GET /api/v1/admin/analytics/overview` returns:
  - `liveOperations`: `activeEmergencies` (PENDING, PRIORITIZED, DISPATCHING, ACTIVE_TRIP), `availableAmbulances`, `busyAmbulances`, `outOfServiceAmbulances`, `driversOnShift`
  - `historicStats`: `totalCompletedEmergencies`, `totalCancelledEmergencies`, `totalTrips`
  - `usersAndResources`: `totalPatients`, `totalDrivers`, `totalHospitals`
  - `revenue`: `totalCollected` (SUM of PAID), `totalPending` (SUM of PENDING)
- All counts executed in parallel via `Promise.all`

**User Story 8.2** — As an admin, I want emergency analytics with date filtering so that I can track operational KPIs.
**Acceptance Criteria:**
- `GET /api/v1/admin/analytics/emergencies` supports optional `from` and `to` date filters
- Returns: `total`, `escalated`, `avgResponseTimeMinutes`, breakdown `byStatus`, `byType`, `byPriority`
- Each breakdown iterates over all enum values and counts them individually

**User Story 8.3** — As an admin, I want to view and filter the system audit log.
**Acceptance Criteria:**
- `GET /api/v1/admin/audit-logs` — paginated (default limit: **20**), filterable by `action`, `entity`, `performedBy` (UUID)
- Ordered by `createdAt DESC`
- Actions populating AuditLog: `UPDATE_USER_STATUS`, `CREATE_DISPATCH`, `CANCEL_DISPATCH`, `UPDATE_PRIORITY` (captures `oldData`, `newData`, `performedByRole`, `performedByName`, and `ipAddress`)

---

## 3. Data Flows & Module Architecture

### 3.1 Module Structure

```
src/module/
├── admin/       → admin.controller.ts, admin.service.ts, admin.routes.ts
├── ambulances/  → controller, service, routes, validation
├── auth/        → controller, service, routes, validation, interface
├── dispatch/    → controller, service, routes, validation, interface
├── drivers/     → controller, service, routes, validation
├── emergencies/ → controller, service, routes, validation, interface
├── hospitals/   → controller, service, routes, validation, interface
├── payment/     → controller, service, routes
└── trips/       → controller, service, routes, validation, interface
```

### 3.2 Complete Emergency Lifecycle Data Flow

```
PATIENT creates emergency
    → status: PENDING
    → IncidentTimeline: EMERGENCY_CREATED

DISPATCHER sets priority
    → status: PENDING → PRIORITIZED (if was PENDING)
    → IncidentTimeline: PRIORITY_UPDATED, STATUS_UPDATED

DISPATCHER runs /recommend
    → Haversine scoring on available, on-shift ambulances

DISPATCHER creates dispatch
    → Ambulance: AVAILABLE → BUSY (optimistic lock via version)
    → Dispatch: PENDING_ACCEPTANCE + timeoutAt (now + 2 min)
    → Emergency: → DISPATCHING
    → IncidentTimeline: AMBULANCE_DISPATCHED

DRIVER accepts
    → Dispatch: → ACCEPTED
    → Trip: created (status: ACTIVE)
    → Emergency: → ACTIVE_TRIP
    → IncidentTimeline: DISPATCH_ACCEPTED

DRIVER updates milestones
    → Trip: departedAt, arrivedAtSceneAt, patientPickedUpAt

DRIVER/DISPATCHER selects hospital
    → Trip: hospitalId, hospitalSelectedAt
    → IncidentTimeline: HOSPITAL_SELECTED

DRIVER completes trip
    → Trip: COMPLETED, distanceKm, arrivedAtHospitalAt, completedAt
    → Dispatch: → COMPLETED
    → Ambulance: BUSY → AVAILABLE
    → Emergency: → COMPLETED + responseTimeMinutes
    → Payment: created (PENDING), invoiceNumber generated
    → IncidentTimeline: TRIP_COMPLETED
    → PDF Invoice: generated in-memory via PDFKit

PATIENT initiates payment
    → Payment: transactionId set, paymentInitiatedAt set
    → SSLCommerz session created → returns gatewayUrl

GATEWAY sends callback/IPN
    → Validation API called
    → Payment: → PAID (paymentConfirmedAt, paymentMethod set)
        or → FAILED
```

### 3.3 Enum Reference — Live Values from enums.prisma

| Enum | Values |
|------|--------|
| `UserRole` | `SUPER_ADMIN`, `ADMIN`, `PATIENT`, `DISPATCHER`, `DRIVER`, `HOSPITAL_STAFF` |
| `UserStatus` | `ACTIVE`, `SUSPENDED`, `DELETED` |
| `AuthProvider` | `GOOGLE`, `CREDENTIAL` |
| `BloodType` | `A_POSITIVE`, `A_NEGATIVE`, `B_POSITIVE`, `B_NEGATIVE`, `AB_POSITIVE`, `AB_NEGATIVE`, `O_POSITIVE`, `O_NEGATIVE`, `UNKNOWN` |
| `AmbulanceType` | `BASIC_LIFE_SUPPORT`, `ADVANCED_LIFE_SUPPORT`, `NEONATAL`, `BARIATRIC`, `PATIENT_TRANSPORT` |
| `AmbulanceStatus` | `AVAILABLE`, `BUSY`, `OUT_OF_SERVICE` |
| `CertificationLevel` | `EMT_BASIC`, `EMT_ADVANCED`, `PARAMEDIC` |
| `HospitalDiversionStatus` | `ACCEPTING`, `DIVERTING`, `CLOSED` |
| `EmergencyType` | `CARDIAC`, `TRAUMA`, `RESPIRATORY`, `NEUROLOGICAL`, `OBSTETRIC`, `PEDIATRIC`, `PSYCHIATRIC`, `OTHER` |
| `RequiredCapability` | `ALS`, `BLS`, `NEONATAL`, `BARIATRIC` |
| `EmergencyPriority` | `P1_CRITICAL`, `P2_EMERGENCY`, `P3_URGENT`, `P4_NON_URGENT`, `P5_ROUTINE` |
| `EmergencyStatus` | `PENDING`, `PRIORITIZED`, `DISPATCHING`, `ACTIVE_TRIP`, `COMPLETED`, `CANCELLED`, `REASSIGNMENT_REQUIRED` |
| `DispatchStatus` | `PENDING_ACCEPTANCE`, `ACCEPTED`, `REJECTED`, `TIMED_OUT`, `CANCELLED`, `COMPLETED` |
| `TripStatus` | `ACTIVE`, `COMPLETED`, `CANCELLED` |
| `PaymentStatus` | `PENDING`, `PAID`, `FAILED`, `CANCELLED`, `REFUNDED` |

### 3.4 Capability-to-Ambulance Type Mapping (Live Logic in dispatch.service.ts)

| Required Capability | Eligible Ambulance Types |
|---------------------|--------------------------|
| `ALS` | `ADVANCED_LIFE_SUPPORT` |
| `BLS` | `BASIC_LIFE_SUPPORT`, `PATIENT_TRANSPORT` |
| `NEONATAL` | `NEONATAL` |
| `BARIATRIC` | `BARIATRIC` |
| *(any)* | `ADVANCED_LIFE_SUPPORT` (always overqualified-acceptable) |

### 3.5 Key Database Models — Field Highlights

**User** (`users`): UUID PK, `role`, `status`, `isDeleted` Boolean (soft-delete flag), `authProvider`, optional `bloodType`, `emergencyContactName/Phone`, `knownConditions`. Both `isDeleted` and `deletedAt` exist (dual soft-delete mechanism — see Section 4.3).

**Ambulance** (`ambulances`): `version` INT for optimistic locking, `capabilities String[]`, `registrationDocumentUrl` (Cloudinary URL), `baseLocationLat/Lng` (always set), `currentLat/Lng` (nullable, preferred by scoring algorithm), `deletedAt` for soft delete.

**Driver** (`drivers`): `assignedAmbulanceId` (unique — 1:1 ambulance link), `licenseDocumentUrl` (Cloudinary URL), `licenseExpiry Date`, `certificationLevel`, `totalTripsCompleted`, shift fields (`isOnShift`, `shiftStart`, `shiftEnd`).

**EmergencyRequest** (`emergency_requests`): `incidentNumber` unique VARCHAR(30), `isEscalated Boolean`, `escalationReason`, `slaTargetMinutes`, `responseTimeMinutes Decimal(8,2)`. DB indexes on `status`, `patientId`, `priority`, `createdAt`.

**Dispatch** (`dispatches`): `dispatchScore Decimal(8,4)` nullable, `timeoutAt` required (set at creation), `acceptedAt/rejectedAt` nullable. Indexed on `emergencyId`, `ambulanceId`, `status`.

**Trip** (`trips`): 7 nullable timestamp milestone fields, `distanceKm Decimal(8,2)`, 1:1 with `Dispatch` (`dispatchId @unique`), 1:1 with `Payment`.

**Payment** (`payments`): `baseFare`, `distanceCharge`, `waitingCharge`, `additionalCharges`, `discount`, `totalAmount` — all `Decimal(10,2)`. `refundAmount`, `refundReason`, `refundedAt` available in schema. Currency default: `"BDT"`.

**AuditLog** (`audit_logs`): `action VARCHAR(100)`, `entity VARCHAR(100)`, `entityId UUID`, `performedBy UUID`, `performedByRole`, `performedByName`, `ipAddress VARCHAR(45)` (captured on every write), `oldData/newData JSON`. No FK constraints — entity refs are strings.

**IncidentTimeline** (`incident_timeline`): append-only, `eventType VARCHAR(100)`, `oldValue/newValue Text`, `triggeredBy UUID`, `triggeredByRole VARCHAR(50)`, `notes Text`. Indexed on `emergencyId`, `createdAt`.

---

## 4. Edge Cases, Business Logic & Constraints

### 4.1 Pagination Rules

Enforced uniformly in all list controllers:
- `page`: `Math.max(1, Number(req.query.page) || 1)` — minimum 1, never 0 or negative
- `limit`: `Math.min(100, Math.max(1, Number(req.query.limit) || 10))` — bounded [1, 100], default 10
- **Exception:** Audit logs default limit is **20** (not 10), as coded in [admin.controller.ts L154](file:///d:/level-2/lifedispatch/lifedispatch-backend/src/module/admin/admin.controller.ts#L154)
- All list responses include `meta: { page, limit, total, totalPages }`

### 4.2 Invalid Filter Graceful Degradation

Implemented in [admin.controller.ts getAllUsers](file:///d:/level-2/lifedispatch/lifedispatch-backend/src/module/admin/admin.controller.ts#L23):
- If `role` query param is a non-empty string NOT in `validRoles[]`, `hasInvalidFilter` flag is set
- If `status` is invalid, same flag is set
- If `hasInvalidFilter === true`, controller **short-circuits** and returns HTTP 200 with `data: [], meta: { total: 0, totalPages: 0 }` — **does NOT throw an error or 400**

### 4.3 Soft-Delete Strategy — Two Mechanisms in Use

| Model | Soft-Delete Field | Active Record Filter |
|-------|------------------|---------------------|
| `User` | `isDeleted: Boolean` | `WHERE isDeleted = false` |
| `Ambulance` | `deletedAt: DateTime?` | `WHERE deletedAt IS NULL` |
| `Hospital` | `deletedAt: DateTime?` | `WHERE deletedAt IS NULL` |

> [!WARNING]
> `User` has BOTH `isDeleted Boolean` AND `deletedAt DateTime?` fields. All active-record queries use only `isDeleted: false`. Setting a user's `status` to `DELETED` via the admin endpoint does **not** set `isDeleted: true` or `deletedAt` — only the `status` enum is updated.

### 4.4 Optimistic Concurrency Control (Ambulance Double-Booking Prevention)

Implemented in [dispatch.service.ts L285-L305](file:///d:/level-2/lifedispatch/lifedispatch-backend/src/module/dispatch/dispatch.service.ts#L285):

```
1. Read ambulance.version at query time (e.g., v=3)
2. Inside Prisma $transaction:
   updateMany WHERE id=X AND status=AVAILABLE AND version=3
   → SET status=BUSY, version=4
3. If updated.count === 0 → 409 CONFLICT
   "Ambulance was just reserved by another dispatcher. Please select a different unit."
4. If updated.count === 1 → success, proceed to create Dispatch record
```

### 4.5 Dispatch Timeout Enforcement

- Timeout window: **2 minutes** (`const dispatchTimeoutMinutes = 2` in [dispatch.service.ts L18](file:///d:/level-2/lifedispatch/lifedispatch-backend/src/module/dispatch/dispatch.service.ts#L18))
- Enforced **reactively at accept-time**: `if (new Date() > dispatch.timeoutAt) → HTTP 400`
- The `TIMED_OUT` DispatchStatus enum exists in schema but **no background job** auto-sets it
- Timeout is only detected when a driver attempts to accept a stale dispatch

### 4.6 Emergency Creation Guard (Patient Blocking)

A patient cannot create a new emergency if any of their existing emergencies are in:
`[PENDING, PRIORITIZED, DISPATCHING, ACTIVE_TRIP]`

Verified in [emergency.service.ts L12-L41](file:///d:/level-2/lifedispatch/lifedispatch-backend/src/module/emergencies/emergency.service.ts#L12). HTTP 409: "You already have an active emergency request."

### 4.7 Patient Ownership Enforcement

- **Emergency view/cancel:** `if (role === PATIENT && emergency.patientId !== requesterId) → 403`
- **Trip view:** `if (role === PATIENT && trip.patientId !== userId) → 403`
- **Payment initiate/view:** `if (payment.patientId !== userId) → 403` (applies to ALL callers — see Sync Delta #3)

### 4.8 Driver Ownership Enforcement

- **Dispatch accept/reject:** `if (dispatch.driverId !== driver.id) → 403 FORBIDDEN`
- **Trip status update/complete:** `if (trip.driverId !== driver.id) → 403 FORBIDDEN`
- Driver profile always looked up via `userId` (JWT claim), then `driver.id` used for ownership comparison

### 4.9 Emergency Status Transition Guard Matrix

| Current Status | updatePriority | createDispatch | recommendAmbulances | cancelEmergency |
|---------------|:--------------:|:--------------:|:-------------------:|:---------------:|
| `PENDING` | ✅ (→ PRIORITIZED) | ❌ | ❌ | ✅ |
| `PRIORITIZED` | ✅ | ✅ | ✅ | ✅ |
| `DISPATCHING` | ✅ | ✅ | ✅ | ✅ |
| `ACTIVE_TRIP` | ✅ | ❌ | ❌ | ✅ |
| `COMPLETED` | ❌ | ❌ | ❌ | ❌ |
| `CANCELLED` | ❌ | ❌ | ❌ | ❌ |

### 4.10 Trip Completion Idempotency Guard

Before completing a trip, [trip.service.ts L371-L376](file:///d:/level-2/lifedispatch/lifedispatch-backend/src/module/trips/trip.service.ts#L371) checks:
```typescript
if (trip.payment) {
  throw new AppError(httpStatus.CONFLICT, "An invoice for this trip already exists.");
}
```
Prevents duplicate invoices and double-billing.

### 4.11 Search & Filter Logic

- **Users** (`GET /admin/users`): Full-text OR search across `name`, `email`, `phone` using `contains` + `mode: "insensitive"`
- **Emergencies** (`GET /emergencies`): Filters by `status`, `emergencyType`, `priority` — **no free-text search**
- **Audit Logs** (`GET /admin/audit-logs`): Exact-match filters on `action`, `entity`, `performedBy` (UUID)

### 4.12 Fare Calculation Constants (Hardcoded)

From [trip.service.ts L18-L19](file:///d:/level-2/lifedispatch/lifedispatch-backend/src/module/trips/trip.service.ts#L18):
- Base fare: **500 BDT** (`FARE_BASE_BDT = 500`)
- Distance rate: **35 BDT per km** (`FARE_PER_KM_BDT = 35`)
- `waitingCharge`, `additionalCharges`, `discount` are schema fields defaulting to `0` — no logic currently populates them
- Final: `totalAmount = round((500 + distanceKm * 35) * 100) / 100`

---

## 5. Open Questions & Sync Delta

### 5.1 Discrepancies Between Documentation and Live Code

| # | Documentation Claim | Live Code Reality | Severity |
|---|--------------------|--------------------|----------|
| 1 | FEATURES_AND_APIS.md title says **48 APIs**; summary table shows **50** | Live code has 50 verified endpoints across 9 modules | Low — doc inconsistency |
| 2 | Audit-logs default limit implied as 10 (same as others) | Live `admin.controller.ts:154` uses default **20** | Low |
| 3 | `GET /payment/:paymentId` allows ADMIN/DISPATCHER per route guard | Service `getPaymentById` throws **403 for non-patient** via `patientId !== userId` check | **HIGH** — admins cannot view payments |
| 4 | Blueprint implies `REASSIGNMENT_REQUIRED` status used on driver rejection | Live code sets emergency to `DISPATCHING` on rejection/cancel — never transitions to `REASSIGNMENT_REQUIRED` | Medium |
| 5 | `TIMED_OUT` DispatchStatus in schema implies background automation | No cron/job auto-sets `TIMED_OUT`; timeout enforced only reactively on accept attempt | Medium |
| 6 | `dispatchScore` field on Dispatch model suggests score is saved | `createDispatch` does NOT persist `dispatchScore` — field remains null after dispatch creation | Low — data gap |
| 7 | `isEscalated`, `escalationReason`, `slaTargetMinutes` on EmergencyRequest | No live service code reads or writes these fields — dead schema fields | Low |
| 8 | `User.deletedAt` and `User.isDeleted` both exist in schema | `updateUserStatus` with `status: DELETED` only sets the `status` enum; does NOT set `isDeleted: true` or `deletedAt` | Medium — soft-delete gap |
| 9 | `Dispatcher` model exists in schema with `totalDispatchesHandled` | No dedicated dispatcher management module/endpoints implemented | Low |


---

## 6. Complete API Reference (56 Endpoints)

| # | Module | Method | Endpoint | Auth | Authorized Roles |
|---|--------|--------|----------|:----:|------------------|
| 1 | Auth | POST | `/api/v1/auth/register` | No | Public |
| 2 | Auth | POST | `/api/v1/auth/verify-email` | No | Public |
| 3 | Auth | POST | `/api/v1/auth/login` | No | Public |
| 4 | Auth | POST | `/api/v1/auth/refresh-token` | No | Public |
| 5 | Auth | GET | `/api/v1/auth/google` | No | Public |
| 6 | Auth | GET | `/api/v1/auth/google/callback` | No | Public |
| 7 | Auth | POST | `/api/v1/auth/forgot-password` | No | Public |
| 8 | Auth | POST | `/api/v1/auth/reset-password` | No | Public |
| 9 | Auth | POST | `/api/v1/auth/logout` | Yes | All Roles |
| 10 | Auth | POST | `/api/v1/auth/logout-all` | Yes | All Roles |
| 56 | Auth | GET | `/api/v1/auth/me` | Yes | All Roles |
| 11 | Emergencies | POST | `/api/v1/emergencies/create` | Yes | PATIENT |
| 12 | Emergencies | GET | `/api/v1/emergencies/` | Yes | SUPER_ADMIN, ADMIN, PATIENT, DISPATCHER |
| 13 | Emergencies | GET | `/api/v1/emergencies/:id` | Yes | SUPER_ADMIN, ADMIN, PATIENT, DISPATCHER, DRIVER, HOSPITAL_STAFF |
| 14 | Emergencies | PATCH | `/api/v1/emergencies/:id/priority` | Yes | SUPER_ADMIN, ADMIN, DISPATCHER |
| 15 | Emergencies | POST | `/api/v1/emergencies/:id/cancel` | Yes | SUPER_ADMIN, ADMIN, PATIENT, DISPATCHER |
| 16 | Ambulances | POST | `/api/v1/ambulances/create` | Yes | SUPER_ADMIN, ADMIN |
| 17 | Ambulances | GET | `/api/v1/ambulances/` | Yes | SUPER_ADMIN, ADMIN, DISPATCHER |
| 18 | Ambulances | GET | `/api/v1/ambulances/:id` | Yes | SUPER_ADMIN, ADMIN, DISPATCHER |
| 19 | Ambulances | PATCH | `/api/v1/ambulances/:id` | Yes | SUPER_ADMIN, ADMIN |
| 20 | Ambulances | PATCH | `/api/v1/ambulances/:id/status` | Yes | SUPER_ADMIN, ADMIN, DRIVER |
| 21 | Drivers | POST | `/api/v1/drivers/create` | Yes | SUPER_ADMIN, ADMIN |
| 22 | Drivers | GET | `/api/v1/drivers/` | Yes | SUPER_ADMIN, ADMIN, DISPATCHER |
| 23 | Drivers | PATCH | `/api/v1/drivers/me/shift` | Yes | DRIVER |
| 24 | Drivers | PATCH | `/api/v1/drivers/:id` | Yes | SUPER_ADMIN, ADMIN |
| 25 | Hospitals | POST | `/api/v1/hospitals/create` | Yes | SUPER_ADMIN, ADMIN |
| 26 | Hospitals | GET | `/api/v1/hospitals/` | Yes | SUPER_ADMIN, ADMIN, DISPATCHER, DRIVER |
| 27 | Hospitals | GET | `/api/v1/hospitals/:id` | Yes | SUPER_ADMIN, ADMIN, DISPATCHER, DRIVER |
| 28 | Hospitals | PATCH | `/api/v1/hospitals/staff/me/shift` | Yes | HOSPITAL_STAFF |
| 29 | Hospitals | PATCH | `/api/v1/hospitals/:id` | Yes | SUPER_ADMIN, ADMIN, HOSPITAL_STAFF |
| 30 | Hospitals | PATCH | `/api/v1/hospitals/:id/diversion` | Yes | SUPER_ADMIN, ADMIN, HOSPITAL_STAFF |
| 31 | Hospitals | POST | `/api/v1/hospitals/:id/staff/create` | Yes | SUPER_ADMIN, ADMIN, HOSPITAL_STAFF |
| 32 | Hospitals | GET | `/api/v1/hospitals/:id/staff` | Yes | SUPER_ADMIN, ADMIN, HOSPITAL_STAFF |
| 33 | Hospitals | PATCH | `/api/v1/hospitals/:id/staff/:staffId` | Yes | SUPER_ADMIN, ADMIN, HOSPITAL_STAFF |
| 34 | Hospitals | DELETE | `/api/v1/hospitals/:id/staff/:staffId` | Yes | SUPER_ADMIN, ADMIN, HOSPITAL_STAFF |
| 35 | Dispatch | POST | `/api/v1/dispatch/recommend` | Yes | SUPER_ADMIN, ADMIN, DISPATCHER |
| 36 | Dispatch | POST | `/api/v1/dispatch/create` | Yes | SUPER_ADMIN, ADMIN, DISPATCHER |
| 37 | Dispatch | GET | `/api/v1/dispatch/me` | Yes | DRIVER |
| 38 | Dispatch | GET | `/api/v1/dispatch/:id` | Yes | SUPER_ADMIN, ADMIN, DISPATCHER, DRIVER |
| 39 | Dispatch | POST | `/api/v1/dispatch/:id/accept` | Yes | DRIVER |
| 40 | Dispatch | POST | `/api/v1/dispatch/:id/reject` | Yes | DRIVER |
| 41 | Dispatch | POST | `/api/v1/dispatch/:id/cancel` | Yes | SUPER_ADMIN, ADMIN, DISPATCHER |
| 42 | Trips | GET | `/api/v1/trips/:id` | Yes | SUPER_ADMIN, ADMIN, DISPATCHER, DRIVER, PATIENT |
| 43 | Trips | PATCH | `/api/v1/trips/:id/status` | Yes | DRIVER |
| 44 | Trips | PATCH | `/api/v1/trips/:id/hospital` | Yes | SUPER_ADMIN, ADMIN, DISPATCHER, DRIVER |
| 45 | Trips | POST | `/api/v1/trips/:id/complete` | Yes | DRIVER |
| 46 | Payment | POST | `/api/v1/payment/:paymentId/initiate` | Yes | PATIENT |
| 47 | Payment | GET | `/api/v1/payment/:paymentId` | Yes | PATIENT, SUPER_ADMIN, ADMIN, DISPATCHER |
| 48 | Payment | POST | `/api/v1/payment/callback` | No | System/Gateway |
| 49 | Payment | POST | `/api/v1/payment/ipn` | No | System/Gateway |
| 50 | Admin | GET | `/api/v1/admin/users` | Yes | SUPER_ADMIN, ADMIN |
| 51 | Admin | PATCH | `/api/v1/admin/users/:id/status` | Yes | SUPER_ADMIN, ADMIN |
| 52 | Admin | GET | `/api/v1/admin/analytics/overview` | Yes | SUPER_ADMIN, ADMIN |
| 53 | Admin | GET | `/api/v1/admin/analytics/emergencies` | Yes | SUPER_ADMIN, ADMIN |
| 54 | Admin | GET | `/api/v1/admin/analytics/payments` | Yes | SUPER_ADMIN, ADMIN |
| 55 | Admin | GET | `/api/v1/admin/audit-logs` | Yes | SUPER_ADMIN, ADMIN |

---

*PRD generated by Antigravity AI — source of truth: live codebase verified 2026-09-09*
