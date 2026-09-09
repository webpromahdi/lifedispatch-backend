# 📡 API Reference — LifeDispatch

> **Base URL:** `http://localhost:5000/api/v1`
> **Auth header:** `Authorization: Bearer <access_token>` (required on all ✅ endpoints)
> **Total endpoints:** 50 across 9 modules

---

## Quick Navigation

- [Authentication](#1-authentication)
- [Emergencies](#2-emergencies)
- [Ambulances](#3-ambulances)
- [Drivers](#4-drivers)
- [Hospitals](#5-hospitals)
- [Dispatch](#6-dispatch)
- [Trips](#7-trips)
- [Payment](#8-payment)
- [Admin](#9-admin)

---

## Role Reference

| Role | Description |
|---|---|
| `SUPER_ADMIN` | Full platform access |
| `ADMIN` | Operations manager — fleet, hospitals, users, analytics |
| `PATIENT` | Service consumer — creates emergencies, initiates payments |
| `DISPATCHER` | Emergency coordinator — prioritizes, assigns ambulances |
| `DRIVER` | Field crew — accepts dispatches, updates trip milestones |
| `HOSPITAL_STAFF` | Receiving facility — manages diversion status and staff |

---

## 1. Authentication

> All endpoints in this module are **public** (no token required).

| # | Method | Endpoint | Description |
|---|---|---|---|
| 1 | `POST` | `/auth/register` | Register a new user (defaults to `PATIENT` role) |
| 2 | `POST` | `/auth/verify-email` | Verify email address with token |
| 3 | `POST` | `/auth/login` | Login — returns `accessToken` + `refreshToken` |
| 4 | `POST` | `/auth/refresh-token` | Exchange a valid refresh token for a new access token |
| 5 | `GET` | `/auth/google` | Initiate Google OAuth flow |
| 6 | `GET` | `/auth/google/callback` | Google OAuth callback handler |
| 7 | `POST` | `/auth/forgot-password` | Trigger password reset email |
| 8 | `POST` | `/auth/reset-password` | Complete password reset with token |

### Request / Response Examples

<details>
<summary><code>POST /auth/register</code></summary>

**Request Body:**
```json
{
  "name": "Rafi Uddin",
  "email": "rafi@example.com",
  "password": "SecurePass123!"
}
```

**Response `201`:**
```json
{
  "success": true,
  "message": "User registered successfully.",
  "data": {
    "id": "cm8vt3k2p0000ld08g4x7z9qr",
    "name": "Rafi Uddin",
    "email": "rafi@example.com",
    "role": "PATIENT"
  }
}
```
</details>

<details>
<summary><code>POST /auth/login</code></summary>

**Request Body:**
```json
{
  "email": "rafi@example.com",
  "password": "SecurePass123!"
}
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiJ9..."
  }
}
```
</details>

---

## 2. Emergencies

| # | Method | Endpoint | Auth | Authorized Roles |
|---|---|---|---|---|
| 9 | `POST` | `/emergencies/create` | ✅ | `PATIENT` |
| 10 | `GET` | `/emergencies/` | ✅ | `SUPER_ADMIN`, `ADMIN`, `PATIENT`, `DISPATCHER` |
| 11 | `GET` | `/emergencies/:id` | ✅ | All roles |
| 12 | `PATCH` | `/emergencies/:id/priority` | ✅ | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` |
| 13 | `POST` | `/emergencies/:id/cancel` | ✅ | `SUPER_ADMIN`, `ADMIN`, `PATIENT`, `DISPATCHER` |

### Notes
- **Blocking rule:** A patient cannot create a new emergency while they have an active one in `PENDING`, `PRIORITIZED`, `DISPATCHING`, or `ACTIVE_TRIP` status → HTTP `409`.
- **Incident number** is auto-generated in format `INC-{YEAR}-{000001}`.
- Priority values: `P1_CRITICAL`, `P2_EMERGENCY`, `P3_URGENT`, `P4_NON_URGENT`, `P5_ROUTINE`.
- Emergency types: `CARDIAC`, `TRAUMA`, `RESPIRATORY`, `NEUROLOGICAL`, `OBSTETRIC`, `PEDIATRIC`, `PSYCHIATRIC`, `OTHER`.

### Status Transition Matrix

| Current Status | Set Priority | Create Dispatch | Recommend | Cancel |
|---|:---:|:---:|:---:|:---:|
| `PENDING` | ✅ → `PRIORITIZED` | ❌ | ❌ | ✅ |
| `PRIORITIZED` | ✅ | ✅ | ✅ | ✅ |
| `DISPATCHING` | ✅ | ✅ | ✅ | ✅ |
| `ACTIVE_TRIP` | ✅ | ❌ | ❌ | ✅ |
| `COMPLETED` | ❌ | ❌ | ❌ | ❌ |
| `CANCELLED` | ❌ | ❌ | ❌ | ❌ |

### Request / Response Examples

<details>
<summary><code>POST /emergencies/create</code></summary>

**Request Body:**
```json
{
  "emergencyType": "CARDIAC",
  "requiredCapability": "ALS",
  "description": "Patient unresponsive, suspected cardiac arrest.",
  "locationAddress": "House 12, Road 5, Dhanmondi, Dhaka",
  "locationLat": 23.7461,
  "locationLng": 90.3742,
  "callerName": "Nusrat Jahan",
  "callerPhone": "+8801712345678"
}
```

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "id": "cm8vt3k2p0000ld08g4x7z9qr",
    "incidentNumber": "INC-2026-000001",
    "status": "PENDING",
    "priority": null,
    "emergencyType": "CARDIAC",
    "requiredCapability": "ALS"
  }
}
```
</details>

<details>
<summary><code>PATCH /emergencies/:id/priority</code></summary>

**Request Body:**
```json
{
  "priority": "P1_CRITICAL"
}
```

**Response `200`:** Emergency status transitions from `PENDING` → `PRIORITIZED` automatically.
</details>

---

## 3. Ambulances

| # | Method | Endpoint | Auth | Authorized Roles |
|---|---|---|---|---|
| 14 | `POST` | `/ambulances/create` | ✅ | `SUPER_ADMIN`, `ADMIN` |
| 15 | `GET` | `/ambulances/` | ✅ | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` |
| 16 | `GET` | `/ambulances/:id` | ✅ | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` |
| 17 | `PATCH` | `/ambulances/:id` | ✅ | `SUPER_ADMIN`, `ADMIN` |
| 18 | `PATCH` | `/ambulances/:id/status` | ✅ | `SUPER_ADMIN`, `ADMIN`, `DRIVER` |

### Notes
- `registrationNumber` must be unique across the fleet.
- Status values: `AVAILABLE`, `BUSY`, `OUT_OF_SERVICE`.
- Ambulance types: `BASIC_LIFE_SUPPORT`, `ADVANCED_LIFE_SUPPORT`, `NEONATAL`, `BARIATRIC`, `PATIENT_TRANSPORT`.
- Supports file upload (`registrationDocument`) via `multipart/form-data` — stored on Cloudinary.
- Soft-deleted records (`deletedAt != null`) are excluded from all queries.

### Request / Response Examples

<details>
<summary><code>POST /ambulances/create</code></summary>

**Request (`multipart/form-data`):**
```
registrationNumber: Dhaka-Metro-ALS-0042
type: ADVANCED_LIFE_SUPPORT
baseLocationLat: 23.8103
baseLocationLng: 90.4125
capabilities[]: ADVANCED_LIFE_SUPPORT
```

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "id": "cm8vt4n1q0003ld08r2m5y6wk",
    "registrationNumber": "Dhaka-Metro-ALS-0042",
    "type": "ADVANCED_LIFE_SUPPORT",
    "status": "AVAILABLE",
    "version": 1
  }
}
```
</details>

---

## 4. Drivers

| # | Method | Endpoint | Auth | Authorized Roles |
|---|---|---|---|---|
| 19 | `POST` | `/drivers/create` | ✅ | `SUPER_ADMIN`, `ADMIN` |
| 20 | `GET` | `/drivers/` | ✅ | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` |
| 21 | `PATCH` | `/drivers/me/shift` | ✅ | `DRIVER` |
| 22 | `PATCH` | `/drivers/:id` | ✅ | `SUPER_ADMIN`, `ADMIN` |

### Notes
- Each driver is linked 1:1 to an ambulance (`assignedAmbulanceId` is unique).
- Only drivers with `isOnShift: true` are eligible for dispatch assignment.
- Certification levels: `EMT_BASIC`, `EMT_ADVANCED`, `PARAMEDIC`.
- Supports `licenseDocument` file upload via `multipart/form-data`.

### Request / Response Examples

<details>
<summary><code>PATCH /drivers/me/shift</code></summary>

**Request Body:**
```json
{
  "isOnShift": true
}
```

**Response `200`:** Driver's `isOnShift`, `shiftStart`, and `shiftEnd` are updated.
</details>

---

## 5. Hospitals

| # | Method | Endpoint | Auth | Authorized Roles |
|---|---|---|---|---|
| 23 | `POST` | `/hospitals/create` | ✅ | `SUPER_ADMIN`, `ADMIN` |
| 24 | `GET` | `/hospitals/` | ✅ | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `DRIVER` |
| 25 | `PATCH` | `/hospitals/staff/me/shift` | ✅ | `HOSPITAL_STAFF` |
| 26 | `PATCH` | `/hospitals/:id` | ✅ | `SUPER_ADMIN`, `ADMIN`, `HOSPITAL_STAFF` |
| 27 | `PATCH` | `/hospitals/:id/diversion` | ✅ | `SUPER_ADMIN`, `ADMIN`, `HOSPITAL_STAFF` |
| 28 | `POST` | `/hospitals/:id/staff/create` | ✅ | `SUPER_ADMIN`, `ADMIN`, `HOSPITAL_STAFF` |
| 29 | `GET` | `/hospitals/:id/staff` | ✅ | `SUPER_ADMIN`, `ADMIN`, `HOSPITAL_STAFF` |
| 30 | `PATCH` | `/hospitals/:id/staff/:staffId` | ✅ | `SUPER_ADMIN`, `ADMIN`, `HOSPITAL_STAFF` |
| 31 | `DELETE` | `/hospitals/:id/staff/:staffId` | ✅ | `SUPER_ADMIN`, `ADMIN`, `HOSPITAL_STAFF` |

### Notes
- Diversion status values: `ACCEPTING`, `DIVERTING`, `CLOSED`.
- `DELETE /staff/:staffId` is a **soft deactivation**, not a hard delete.

### Request / Response Examples

<details>
<summary><code>PATCH /hospitals/:id/diversion</code></summary>

**Request Body:**
```json
{
  "diversionStatus": "DIVERTING",
  "diversionReason": "ICU at full capacity."
}
```

**Response `200`:** Sets `diversionStatus`, `diversionReason`, and `diversionSetAt`.
</details>

---

## 6. Dispatch

| # | Method | Endpoint | Auth | Authorized Roles |
|---|---|---|---|---|
| 32 | `POST` | `/dispatch/recommend` | ✅ | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` |
| 33 | `POST` | `/dispatch/create` | ✅ | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` |
| 34 | `POST` | `/dispatch/:id/accept` | ✅ | `DRIVER` |
| 35 | `POST` | `/dispatch/:id/reject` | ✅ | `DRIVER` |
| 36 | `POST` | `/dispatch/:id/cancel` | ✅ | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` |

### Scoring Algorithm (weights sum to 1.0)

| Factor | Weight | Logic |
|---|---|---|
| Distance | **0.50** | `1 - distanceKm / maxDistance` (Haversine; prefers `currentLat/Lng` over base location) |
| Capability Match | **0.30** | Exact = `1.0`, Overqualified = `0.8`, Underqualified = `0.5` |
| Type Match | **0.20** | Exact = `1.0`, Overqualified = `0.8` |

### Capability → Ambulance Type Mapping

| Required Capability | Eligible Ambulance Types |
|---|---|
| `ALS` | `ADVANCED_LIFE_SUPPORT` |
| `BLS` | `BASIC_LIFE_SUPPORT`, `PATIENT_TRANSPORT` |
| `NEONATAL` | `NEONATAL` |
| `BARIATRIC` | `BARIATRIC` |
| *(any)* | `ADVANCED_LIFE_SUPPORT` (always overqualified-acceptable) |

### Dispatch Timeout
- Acceptance window: **2 minutes** from creation.
- Enforced reactively at accept-time. No background job auto-expires dispatches.

### Request / Response Examples

<details>
<summary><code>POST /dispatch/recommend</code></summary>

**Request Body:**
```json
{
  "emergencyId": "cm8vt3k2p0000ld08g4x7z9qr"
}
```

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "ambulanceId": "cm8vt4n1q0003ld08r2m5y6wk",
      "registrationNumber": "Dhaka-Metro-ALS-0042",
      "totalScore": 0.92,
      "scoreBreakdown": {
        "distanceScore": 0.95,
        "priorityScore": 1.0,
        "typeScore": 1.0
      },
      "distanceKm": 1.2,
      "driver": { "name": "Rakibul Hasan", "certificationLevel": "PARAMEDIC" }
    }
  ]
}
```
</details>

<details>
<summary><code>POST /dispatch/create</code></summary>

**Request Body:**
```json
{
  "emergencyId": "cm8vt3k2p0000ld08g4x7z9qr",
  "ambulanceId": "cm8vt4n1q0003ld08r2m5y6wk"
}
```

**On success:** Ambulance → `BUSY`, Dispatch → `PENDING_ACCEPTANCE` (timeout 2 min), Emergency → `DISPATCHING`.

> **Optimistic locking:** If another dispatcher reserved the ambulance simultaneously → HTTP `409`.
</details>

<details>
<summary><code>POST /dispatch/:id/reject</code></summary>

**Request Body:**
```json
{
  "reason": "Vehicle mechanical issue, unable to respond."
}
```

**On success:** Dispatch → `REJECTED`, Ambulance → `AVAILABLE`, Emergency → `DISPATCHING` (reassignable).
</details>

---

## 7. Trips

| # | Method | Endpoint | Auth | Authorized Roles |
|---|---|---|---|---|
| 37 | `GET` | `/trips/:id` | ✅ | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `DRIVER`, `PATIENT` |
| 38 | `PATCH` | `/trips/:id/status` | ✅ | `DRIVER` |
| 39 | `PATCH` | `/trips/:id/hospital` | ✅ | `SUPER_ADMIN`, `ADMIN`, `DISPATCHER`, `DRIVER` |
| 40 | `POST` | `/trips/:id/complete` | ✅ | `DRIVER` |

### Notes
- Trip status cannot be set to `COMPLETED` via `PATCH /status` — use `POST /complete`.
- Completing a trip **auto-generates a Payment record** and a **PDF invoice** (PDFKit, in-memory).
- Idempotency guard: if a payment already exists for the trip → HTTP `409`.

### Fare Formula
```
baseFare        = 500 BDT
distanceCharge  = distanceKm × 35 BDT
totalAmount     = round((500 + distanceKm × 35) × 100) / 100
```

### Request / Response Examples

<details>
<summary><code>PATCH /trips/:id/status</code></summary>

**Request Body (milestone update):**
```json
{
  "status": "ACTIVE",
  "departedAt": "2026-09-09T08:10:00.000Z",
  "arrivedAtSceneAt": "2026-09-09T08:22:00.000Z"
}
```
</details>

<details>
<summary><code>POST /trips/:id/complete</code></summary>

**Request Body:**
```json
{
  "distanceKm": 8.5,
  "arrivedAtHospitalAt": "2026-09-09T09:05:00.000Z"
}
```

**Auto-calculated fare for this example:**
- Base: `500 BDT`
- Distance: `8.5 km × 35 = 297.50 BDT`
- **Total: `797.50 BDT`**

**On success:** Trip → `COMPLETED`, Dispatch → `COMPLETED`, Ambulance → `AVAILABLE`, Emergency → `COMPLETED`, Payment created (`PENDING`), PDF invoice returned.
</details>

---

## 8. Payment

| # | Method | Endpoint | Auth | Authorized Roles |
|---|---|---|---|---|
| 41 | `POST` | `/payment/:paymentId/initiate` | ✅ | `PATIENT` |
| 42 | `GET` | `/payment/:paymentId` | ✅ | `PATIENT`, `SUPER_ADMIN`, `ADMIN`, `DISPATCHER` |
| 43 | `POST` | `/payment/callback` | ❌ | System/Gateway (SSLCommerz) |
| 44 | `POST` | `/payment/ipn` | ❌ | System/Gateway (SSLCommerz) |

### Notes
- **Gateway:** SSLCommerz (sandbox: `https://sandbox.sslcommerz.com`).
- `transactionId` format: `LD-{invoiceNumber}-{timestamp}`.
- `/callback` — redirects browser to `{FRONTEND_URL}/payment/result?status=...`.
- `/ipn` — idempotent; skips already-`PAID` records.
- **Tamper detection:** `transactionId` in callback is cross-verified against DB → HTTP `400` on mismatch.

### Payment Status Flow
```
PENDING  →  PAID     (SSLCommerz validation returns VALID/VALIDATED)
         →  FAILED   (validation returns anything else)
```

### Request / Response Examples

<details>
<summary><code>POST /payment/:paymentId/initiate</code></summary>

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "gatewayUrl": "https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=pay&SESSIONKEY=...",
    "transactionId": "LD-INV-2026-0001-1725868800000"
  }
}
```
</details>

---

## 9. Admin

| # | Method | Endpoint | Auth | Authorized Roles |
|---|---|---|---|---|
| 45 | `GET` | `/admin/users` | ✅ | `SUPER_ADMIN`, `ADMIN` |
| 46 | `PATCH` | `/admin/users/:id/status` | ✅ | `SUPER_ADMIN`, `ADMIN` |
| 47 | `GET` | `/admin/analytics/overview` | ✅ | `SUPER_ADMIN`, `ADMIN` |
| 48 | `GET` | `/admin/analytics/emergencies` | ✅ | `SUPER_ADMIN`, `ADMIN` |
| 49 | `GET` | `/admin/analytics/payments` | ✅ | `SUPER_ADMIN`, `ADMIN` |
| 50 | `GET` | `/admin/audit-logs` | ✅ | `SUPER_ADMIN`, `ADMIN` |

### Pagination (all list endpoints)

| Param | Default | Bounds | Notes |
|---|---|---|---|
| `page` | `1` | min `1` | |
| `limit` | `10` | `[1, 100]` | Audit logs default to `20` |

Response always includes: `meta: { page, limit, total, totalPages }`.

### Filters

| Endpoint | Available Filters |
|---|---|
| `GET /admin/users` | `role`, `status`, `search` (name / email / phone — case-insensitive) |
| `GET /admin/analytics/emergencies` | `from` (date), `to` (date) |
| `GET /admin/audit-logs` | `action`, `entity`, `performedBy` (UUID — exact match) |

### Request / Response Examples

<details>
<summary><code>GET /admin/analytics/overview</code></summary>

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "liveOperations": {
      "activeEmergencies": 3,
      "availableAmbulances": 12,
      "busyAmbulances": 3,
      "outOfServiceAmbulances": 1,
      "driversOnShift": 8
    },
    "historicStats": {
      "totalCompletedEmergencies": 214,
      "totalCancelledEmergencies": 17,
      "totalTrips": 214
    },
    "usersAndResources": {
      "totalPatients": 530,
      "totalDrivers": 16,
      "totalHospitals": 6
    },
    "revenue": {
      "totalCollected": "187450.00",
      "totalPending": "12300.50"
    }
  }
}
```
</details>

---

*For installation, usage examples, and contribution guidelines — see the [README](./README.md).*
