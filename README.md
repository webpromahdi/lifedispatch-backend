<div align="center">

# 🚑 LifeDispatch — Emergency Ambulance Dispatch System

**A production-grade backend platform managing the complete lifecycle of a medical emergency — from first call to final payment receipt.**

[![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Express](https://img.shields.io/badge/Express-5.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![Prisma](https://img.shields.io/badge/Prisma-7.x-2D3748?logo=prisma&logoColor=white)](https://prisma.io)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?logo=postgresql&logoColor=white)](https://postgresql.org)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)

[Overview](#-overview) · [Features](#-core-features) · [Architecture](#-architecture) · [Tech Stack](#-tech-stack) · [Installation](#-installation) · [API Reference](#-api-reference) · [Contributing](#-contributing)

</div>

---

## 📋 Overview

**LifeDispatch** is a state-driven, role-enforced backend built on real-world **Computer-Aided Dispatch (CAD)** and **Medical Priority Dispatch System (MPDS)** concepts. It orchestrates patients, dispatchers, ambulance crews, and hospitals through a complete emergency lifecycle, solving the critical coordination problems inherent in modern EMS:

| Problem | Solution |
|---|---|
| Double-booking of ambulances | **Optimistic concurrency control** via a `version` field on every ambulance record |
| Unstructured emergency triaging | **P1–P5 priority system** enforced by role-gated state transitions |
| No real-time fleet visibility | **Haversine-scored recommendation engine** with capability matching |
| Manual hospital routing | **Diversion status management** (ACCEPTING / DIVERTING / CLOSED) per facility |
| No automated billing | **Auto-generated fare calculation + PDF invoice** on trip completion |
| Payment insecurity | **SSLCommerz integration** with IPN tamper detection |

---

## 🎯 Core Features

<details>
<summary><strong>🔐 Authentication & Identity Management</strong></summary>

- JWT-based auth (access + refresh token pair)
- Google OAuth 2.0 via Passport.js
- Forgot / reset password flow with email tokens
- **6-role RBAC:** `SUPER_ADMIN`, `ADMIN`, `PATIENT`, `DISPATCHER`, `DRIVER`, `HOSPITAL_STAFF`

</details>

<details>
<summary><strong>🆘 Emergency Request Lifecycle</strong></summary>

- Auto-generated incident numbers: `INC-{YEAR}-{000001}`
- State machine: `PENDING → PRIORITIZED → DISPATCHING → ACTIVE_TRIP → COMPLETED`
- Blocking constraint: one active emergency per patient (HTTP 409)
- Full immutable audit trail via `IncidentTimeline`

</details>

<details>
<summary><strong>🚑 Ambulance Fleet Management</strong></summary>

- Capability-typed fleet: `ALS`, `BLS`, `NEONATAL`, `BARIATRIC`, `PATIENT_TRANSPORT`
- Cloudinary-backed document uploads (registration docs, driver licenses)
- Soft-delete with `deletedAt` timestamp
- Optimistic locking with `version` integer field

</details>

<details>
<summary><strong>🧠 Dispatch Recommendation Engine</strong></summary>

Composite scoring algorithm (weights sum to 1.0):

| Factor | Weight | Logic |
|---|---|---|
| **Distance** | 0.50 | `1 - distanceKm / maxDistance` (Haversine, prefers live GPS over base location) |
| **Capability Match** | 0.30 | Exact=1.0, Overqualified=0.8, Underqualified=0.5 |
| **Type Match** | 0.20 | Exact=1.0, Overqualified=0.8 |

Returns top 5 candidates with full `scoreBreakdown`. 2-minute acceptance timeout with optimistic lock.

</details>

<details>
<summary><strong>🏥 Trip & Hospital Management</strong></summary>

- 7 milestone timestamps per trip (`departedAt`, `arrivedAtSceneAt`, `patientPickedUpAt`, etc.)
- Hospital diversion status routing
- Fare formula: `500 BDT base + 35 BDT/km × distanceKm`
- PDF invoice generated in-memory via PDFKit on trip completion

</details>

<details>
<summary><strong>💳 Payment Gateway (SSLCommerz)</strong></summary>

- Sandbox + production SSLCommerz integration
- Tamper-proof IPN verification
- Idempotent callback handling
- Payment statuses: `PENDING → PAID | FAILED`

</details>

<details>
<summary><strong>📊 Admin Analytics & Audit</strong></summary>

- Real-time operations dashboard (live emergencies, ambulance pool, revenue)
- Emergency KPIs with `from/to` date filters
- Full audit log with `oldData/newData` JSON diff
- Paginated, filterable across all list endpoints

</details>

---

## 🏛 Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        CLIENT / FRONTEND                      │
└────────────────────────────┬─────────────────────────────────┘
                             │ HTTPS
┌────────────────────────────▼─────────────────────────────────┐
│                   Express.js Application                      │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │  Helmet &   │  │  Rate Limiter│  │  Passport.js      │   │
│  │  CORS Guard │  │  (per-route) │  │  (JWT + Google)   │   │
│  └─────────────┘  └──────────────┘  └───────────────────┘   │
│                                                               │
│  ┌──────────────────── Module Layer ──────────────────────┐  │
│  │  auth | emergencies | ambulances | drivers | hospitals  │  │
│  │  dispatch | trips | payment | admin                     │  │
│  └───────────────────────┬────────────────────────────────┘  │
│                          │                                    │
│  ┌───────────────────────▼────────────────────────────────┐  │
│  │              Prisma ORM 7.x (pg adapter)               │  │
│  └───────────────────────┬────────────────────────────────┘  │
└──────────────────────────┼───────────────────────────────────┘
                           │
         ┌─────────────────┼──────────────────┐
         ▼                 ▼                  ▼
   PostgreSQL 16+     Cloudinary CDN     SSLCommerz Gateway
   (primary store)    (file storage)    (payment processing)
```

### Module Structure

```
src/
├── app.ts                      # Express app bootstrap
├── server.ts                   # HTTP server entry point
├── config/                     # Environment config & Passport strategy
├── middleware/
│   ├── checkAuth.ts            # JWT verification + RBAC guard
│   ├── globalErrorHandler.ts
│   ├── rateLimiter.ts
│   └── validateRequest.ts      # Zod schema validation
├── module/
│   ├── admin/                  # User management, analytics, audit logs
│   ├── ambulances/             # Fleet CRUD + status management
│   ├── auth/                   # Register, login, OAuth, password reset
│   ├── dispatch/               # Recommendation engine + dispatch lifecycle
│   ├── drivers/                # Driver profiles + shift management
│   ├── emergencies/            # Emergency CRUD + priority + cancel
│   ├── hospitals/              # Hospital CRUD + diversion + staff roster
│   ├── payment/                # SSLCommerz initiate + callback + IPN
│   └── trips/                  # Trip milestones + completion + invoice
├── utils/
│   ├── AppError.ts             # Custom error class
│   ├── catchAsync.ts           # Async error wrapper
│   ├── jwt.ts                  # Token sign/verify helpers
│   ├── sendResponse.ts         # Standardized JSON response
│   ├── uploadToCloudinary.ts
│   └── seed.ts                 # Database seeder
└── templates/                  # EJS email templates

prisma/schema/
├── schema.prisma               # Prisma config (PostgreSQL + pg adapter)
├── enums.prisma                # All enum definitions
├── user.prisma
├── ambulance.prisma
├── driver.prisma
├── emergency.prisma
├── dispatch.prisma
├── trip.prisma
├── payment.prisma
├── hospital.prisma
├── hospital_staff.prisma
├── incident_timeline.prisma
├── audit_log.prisma
└── dispatcher.prisma
```

---

## 🛠 Tech Stack

| Category | Technology | Version | Purpose |
|---|---|---|---|
| **Runtime** | Node.js | 22+ | JavaScript runtime |
| **Language** | TypeScript | 7.x | Type safety |
| **Framework** | Express.js | 5.x | HTTP server & routing |
| **ORM** | Prisma | 7.x | Database access & migrations |
| **Database** | PostgreSQL | 16+ | Primary data store |
| **DB Driver** | `@prisma/adapter-pg` | 7.x | Native pg driver for Prisma |
| **Validation** | Zod | 4.x | Request schema validation |
| **Auth** | Passport.js | 0.7 | JWT + Google OAuth strategy |
| **Tokens** | jsonwebtoken | 9.x | JWT sign & verify |
| **Password** | bcryptjs | 3.x | Hashing |
| **File Upload** | Multer | 2.x | Multipart form handling |
| **CDN** | Cloudinary | 2.x | Document & image storage |
| **PDF** | PDFKit | 0.20 | In-memory invoice generation |
| **Email** | Nodemailer | 10.x | Transactional emails |
| **Payment** | SSLCommerz | — | Payment gateway (BD) |
| **Caching** | Redis | 6.x | Token store / future use |
| **Security** | Helmet | 8.x | HTTP security headers |
| **Rate Limit** | express-rate-limit | 8.x | DDoS / abuse protection |
| **HTTP Client** | Axios | 1.x | SSLCommerz API calls |
| **Linter** | Biome | 2.x | Format + lint |
| **Dev Server** | tsx | 4.x | TS watch mode |

---

## 🚀 Installation

### Prerequisites

- **Node.js** ≥ 22 — [Download](https://nodejs.org)
- **PostgreSQL** ≥ 16 — [Download](https://postgresql.org) or use a cloud provider (Supabase, Neon, etc.)
- **Redis** — [Download](https://redis.io) or use Upstash
- A **Cloudinary** account — [Sign up free](https://cloudinary.com)
- A **Google Cloud** project with OAuth 2.0 credentials — [Console](https://console.cloud.google.com)
- An **SSLCommerz** merchant account (sandbox for dev) — [Register](https://developer.sslcommerz.com)

---

### 1. Clone the Repository

```bash
git clone https://github.com/webpromahdi/lifedispatch-backend.git
cd lifedispatch-backend
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Copy the example file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and set the following:

```env
# ── Database ──────────────────────────────────────────────────
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/lifedispatch?schema=public"
DIRECT_URL="postgresql://USER:PASSWORD@HOST:5432/lifedispatch"

# ── Server ────────────────────────────────────────────────────
PORT=5000
NODE_ENV=development
APP_URL=http://localhost:3000

# ── JWT ───────────────────────────────────────────────────────
BCRYPT_SALT_ROUNDS=10
JWT_ACCESS_SECRET=your_super_secret_access_key_here
JWT_REFRESH_SECRET=your_super_secret_refresh_key_here
JWT_ACCESS_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d

# ── Google OAuth ──────────────────────────────────────────────
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_CALLBACK_URL=http://localhost:5000/api/v1/auth/google/callback

# ── Cloudinary ────────────────────────────────────────────────
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ── Email (Nodemailer) ────────────────────────────────────────
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# ── Redis ─────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── SSLCommerz ────────────────────────────────────────────────
SSLCOMMERZ_STORE_ID=your_store_id
SSLCOMMERZ_STORE_PASSWORD=your_store_password
SSLCOMMERZ_BASE_URL=https://sandbox.sslcommerz.com
```

### 4. Run Database Migrations

```bash
# Generate the Prisma client
npx prisma generate

# Apply migrations to the database
npx prisma migrate dev --name init
```

### 5. (Optional) Seed the Database

```bash
npx tsx src/utils/seed.ts
```

This creates a default `SUPER_ADMIN` and sample data for local testing.

### 6. Start the Development Server

```bash
npm run dev
```

The API will be available at: **`http://localhost:5000`**

Health check:

```bash
curl http://localhost:5000/
# → { "success": true, "message": "Welcome to LifeDispatch API" }
```

---

### Production Build

```bash
# Build TypeScript → dist/
npm run build

# Run compiled output
npm start
```

---

## ⚙️ Available Scripts

| Script | Command | Description |
|---|---|---|
| Development | `npm run dev` | tsx watch mode with hot reload |
| Build | `npm run build` | `prisma generate` + `tsc` |
| Production | `npm start` | Run compiled `dist/src/server.js` |
| Format Check | `npm run format:check` | Biome format check |
| Format Fix | `npm run format:fix` | Biome format auto-fix |
| Lint Check | `npm run lint:check` | Biome lint check |
| Lint Fix | `npm run lint:fix` | Biome lint auto-fix |

---

## 📡 API Reference

> 📄 **The full API reference is maintained in a dedicated file:**
> **[`API_REFERENCE.md`](./API_REFERENCE.md)**

The backend exposes **50 REST endpoints** across **9 modules:**

| Module | Endpoints | Key Operations |
|---|---|---|
| **Auth** | 8 | Register, Login, Refresh Token, Google OAuth, Password Reset |
| **Emergencies** | 5 | Create, List, Get, Set Priority, Cancel |
| **Ambulances** | 5 | Create, List, Get, Update, Update Status |
| **Drivers** | 4 | Create, List, Shift Toggle, Update |
| **Hospitals** | 9 | Create, Diversion Status, Staff Roster (CRUD) |
| **Dispatch** | 5 | Recommend, Create, Accept, Reject, Cancel |
| **Trips** | 4 | Get, Update Milestone, Select Hospital, Complete + Invoice |
| **Payment** | 4 | Initiate, Get, Gateway Callback, IPN |
| **Admin** | 6 | User Management, Analytics (3), Audit Log |

→ **[View all endpoints, request/response examples, and business rules](./API_REFERENCE.md)**



## 💡 Usage Examples

### Register a Patient

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com",
    "password": "SecurePass123!"
  }'
```

### Create an Emergency Request

```bash
curl -X POST http://localhost:5000/api/v1/emergencies/create \
  -H "Authorization: Bearer <PATIENT_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "emergencyType": "CARDIAC",
    "requiredCapability": "ALS",
    "description": "Patient is unresponsive, suspected cardiac arrest.",
    "locationAddress": "123 Main Street, Dhaka",
    "locationLat": 23.8103,
    "locationLng": 90.4125,
    "callerName": "Jane Doe",
    "callerPhone": "+8801700000000"
  }'
```

### Get Ambulance Recommendations for an Emergency

```bash
curl -X POST http://localhost:5000/api/v1/dispatch/recommend \
  -H "Authorization: Bearer <DISPATCHER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "emergencyId": "cm8vt3k2p0000ld08g4x7z9qr"
  }'
```

**Response includes top 5 scored candidates:**

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

### Assign an Ambulance (Create Dispatch)

```bash
curl -X POST http://localhost:5000/api/v1/dispatch/create \
  -H "Authorization: Bearer <DISPATCHER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "emergencyId": "cm8vt3k2p0000ld08g4x7z9qr",
    "ambulanceId": "cm8vt4n1q0003ld08r2m5y6wk"
  }'
```

### Complete a Trip (Triggers Auto-Billing)

```bash
curl -X POST http://localhost:5000/api/v1/trips/<TRIP_ID>/complete \
  -H "Authorization: Bearer <DRIVER_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "distanceKm": 8.5,
    "arrivedAtHospitalAt": "2026-09-09T14:30:00.000Z"
  }'
```

**Auto-calculated fare:**

- Base: `500 BDT`
- Distance: `8.5 km × 35 = 297.50 BDT`
- **Total: `797.50 BDT`**

---

## 🗄️ Database Schema Overview

The schema is split across 14 Prisma model files for maintainability:

| Model | Table | Key Fields |
|---|---|---|
| `User` | `users` | `role`, `status`, `isDeleted`, `authProvider` |
| `Ambulance` | `ambulances` | `version` (optimistic lock), `capabilities[]`, `deletedAt` |
| `Driver` | `drivers` | `isOnShift`, `assignedAmbulanceId` (unique 1:1) |
| `EmergencyRequest` | `emergency_requests` | `incidentNumber`, `status`, `priority`, `isEscalated` |
| `Dispatch` | `dispatches` | `timeoutAt`, `dispatchScore`, `status` |
| `Trip` | `trips` | 7 milestone timestamps, `distanceKm` |
| `Payment` | `payments` | `baseFare`, `distanceCharge`, `totalAmount` (BDT) |
| `Hospital` | `hospitals` | `diversionStatus`, `diversionSetAt` |
| `HospitalStaff` | `hospital_staff` | `designation`, `canManageStaff`, `isOnShift` |
| `IncidentTimeline` | `incident_timeline` | append-only event log, `eventType`, `notes` |
| `AuditLog` | `audit_logs` | `oldData`/`newData` JSON, no FK constraints |

---

## 🔒 Security Architecture

- **Helmet.js** — Sets 15+ HTTP security headers (CSP, HSTS, X-Frame-Options, etc.)
- **CORS** — Restricted to configured `APP_URL` origin only
- **Rate Limiting** — Via `express-rate-limit` on sensitive routes
- **RBAC** — Every route checked via `checkAuth` middleware with role array allowlist
- **Ownership Enforcement** — Driver and Patient operations verify resource ownership before action
- **Password Hashing** — bcryptjs with configurable salt rounds
- **Optimistic Locking** — Prevents ambulance double-booking in concurrent dispatch scenarios
- **Tamper Detection** — SSLCommerz IPN `transactionId` cross-verified against DB record

---

## 🧪 Development Workflow

```bash
# Check formatting
npm run format:check

# Auto-fix formatting
npm run format:fix

# Lint check
npm run lint:check

# Auto-fix lint issues
npm run lint:fix

# Open Prisma Studio (visual DB browser)
npx prisma studio

# Reset database and re-run migrations
npx prisma migrate reset

# Generate Prisma client after schema change
npx prisma generate
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

### 1. Fork & Branch

```bash
# Fork the repo on GitHub, then:
git clone https://github.com/<your-username>/lifedispatch-backend.git
cd lifedispatch-backend

# Create a feature branch
git checkout -b feature/your-feature-name
# or for bugfixes:
git checkout -b fix/your-bug-description
```

### 2. Code Standards

- **TypeScript** — All code must be fully typed; avoid `any`
- **Biome** — Run `npm run format:fix && npm run lint:fix` before committing
- **Module pattern** — Each feature lives in `src/module/<name>/` with `controller`, `service`, `routes`, and `validation` files
- **Error handling** — Always use `catchAsync()` wrapper and throw `AppError` with proper HTTP status codes
- **Validation** — All request bodies must be validated with a Zod schema via `validateRequest` middleware
- **Responses** — Use `sendResponse()` utility for all JSON responses

### 3. Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org):

```
feat: add waiting charge calculation to trip completion
fix: resolve payment access for admin roles
docs: update API reference for dispatch endpoints
refactor: extract fare calculation into service utility
chore: upgrade prisma to v7.10
```

### 4. Submit a Pull Request

```bash
git add .
git commit -m "feat: your feature description"
git push origin feature/your-feature-name
```

Then open a Pull Request to `main` on GitHub. Include:

- A clear description of what changed and why
- Any relevant issue numbers
- Screenshots or `curl` examples if adding/changing API behavior

### 5. Known Future Work

The following items are planned — contributions are especially welcome here:

| Priority | Item |
|---|---|
| 🔴 HIGH | Auto-expire `TIMED_OUT` dispatches via a background job |
| 🔴 HIGH | Fix payment `GET` — bypass patient ownership check for `ADMIN` roles |
| 🟡 MEDIUM | Wire `REASSIGNMENT_REQUIRED` status on driver rejection |
| 🟡 MEDIUM | Sync `isDeleted + deletedAt` when user status set to `DELETED` |
| 🟡 MEDIUM | Persist `dispatchScore` to the Dispatch record at creation time |
| 🟢 LOW | Add free-text search to emergency listing |
| 🟢 LOW | Implement waiting/additional charge calculation |
| 🟢 LOW | Build refund endpoint (`refundAmount`, `refundReason`, `refundedAt`) |
| 🟢 LOW | Add Dispatcher profile management module |
| 🟢 LOW | Populate `ipAddress` in AuditLog from `req.ip` |

---

## 📄 License

This project is licensed under the **ISC License**.

---

<div align="center">

Built with ❤️ by [Mahdi AL Hasan](https://github.com/webpromahdi)

**LifeDispatch** — *Because every second counts.*

</div>
