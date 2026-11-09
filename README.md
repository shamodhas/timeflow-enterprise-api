# TimeFlow Enterprise — Multi-Tenant SaaS HRM & Attendance API (`timeflow-api`)

![Version](https://img.shields.io/badge/version-2.0.0--saas-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D20.x-emerald.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6.svg)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Isolated%20Multi--DB-336791.svg)
![Cache](https://img.shields.io/badge/Cache-L1%20LRU%20%2B%20L2%20Redis-DC382D.svg)

Production-grade **Multi-Tenant SaaS Human Resource Management (HRM), Geofenced Attendance, and Leave Ledger API** engineered with **100% Isolated Database-per-Tenant Architecture**, **Bring Your Own Database (BYOD)** support, **Dynamic Warm Connection Pool Management**, and a **Two-Tier L1/L2 Cache Engine**.

---

## Key Architectural Highlights

### 1. 100% Isolated Database-per-Tenant & BYOD Support
Unlike shared-schema multi-tenant systems that co-mingle customer records, TimeFlow Enterprise enforces **strict data-source isolation**:
* **Control-Plane Database (`saas_tenants` & `saas_tenant_users`):** Stores organization metadata, subscription quotas, email-to-tenant zero-friction routing indexes, and **AES-256-GCM encrypted** PostgreSQL connection strings.
* **Data-Plane Tenant Databases:** Every tenant organization runs on its own isolated PostgreSQL database (`DEFAULT_HOST`, `DEDICATED_MANAGED`, or `BYOD_CUSTOM`).
* **Bring Your Own Database (BYOD):** Enterprise clients can connect their own AWS RDS, Neon, Supabase, Azure, or On-Premise PostgreSQL server at onboarding or live-switch at runtime with automatic schema & B-Tree index provisioning.

### 2. Zero-Latency Dynamic Connection Pool Manager (`TenantConnectionPoolManager`)
* **0ms Warm Pool Handshake:** Active tenant `Sequelize` pools remain warm in memory (`Map<tenantId, ManagedTenantPool>`).
* **Node.js `AsyncLocalStorage` Context Routing:** Every incoming HTTP request resolves its tenant context (`x-workspace-slug`, JWT `tenantId`, subdomain, or automatic email lookup) and transparently binds all Sequelize models (`Employee`, `Attendance`, `Branch`, `LeaveRequest`, `LeaveLedger`, `LeaveType`, `Department`, `Holiday`) to that tenant's dedicated connection pool.
* **Automatic LRU & Idle Pool Eviction:** Idle tenant connection pools automatically close after configurable inactivity to keep memory and database connections lean.

### 3. Two-Tier Hybrid Cache Engine (`HybridCacheService`)
* **L1 Sub-Millisecond In-Memory LRU Cache + L2 Redis RESP Client:** Caches active branch geofence perimeters, tenant configurations, holidays, and dashboard summaries.
* **Event-Driven Cache Invalidation:** Mutations to branches, attendance logs, employees, or holidays immediately invalidate the affected tenant's cache keys.

---

## Core Modules & API Endpoints (`/api/v1`)

| Module | Base Path | Key Capabilities |
| :--- | :--- | :--- |
| **SaaS & BYOD Control Plane** | `/api/v1/tenants` | Public workspace discovery (`/resolve`), live PostgreSQL connection & latency testing (`/test-db`), automated tenant + schema onboarding (`/onboard`), live BYOD database hot-swapping (`/current/database`), and pool/cache telemetry (`/current`). |
| **Authentication & RBAC** | `/api/v1/auth` | Email + Password login with automatic tenant discovery, Google OAuth 2.0, employee invitation token verification (`/complete-registration`), and JWT refresh rotation. |
| **Geofenced Attendance** | `/api/v1/attendance` | Haversine GPS perimeter verification against cached active branches, offline-first chronological sync with idempotent replay protection (`occurredAt`), and out-of-perimeter exception reason workflows. |
| **Leave Ledger & Requests** | `/api/v1/leaves` | Double-entry style leave ledger (`ACCRUAL`, `DEDUCTION`, `ADJUSTMENT`), `FULL` / `HALF` / `SHORT` session support, holiday-aware working day calculation, and acting employee assignment. |
| **Workforce & Branches** | `/api/v1/employees`<br>`/api/v1/branches` | Employee lifecycle management, email onboarding invitations, interactive geofence branch configuration, departments, and public holidays. |
| **Bulk CSV Import & Reports** | `/api/v1/import`<br>`/api/v1/reports` | Bulk CSV ingestion for legacy employees, attendance logs, and leave records, plus monthly CSV attendance exports. |

---

## Environment Variables (`.env`)

```env
PORT=3000
NODE_ENV=development

# Primary / Default Tenant & Control Plane PostgreSQL URL
# Development: dev_timeflow_enterprise_db | Production: timeflow_enterprise_db
# Managed Tenant Isolated DBs: dev_timeflow_enterprise_<slug>_db (dev) / timeflow_enterprise_<slug>_db (prod)
DB_NAME=dev_timeflow_enterprise_db
DATABASE_URL=postgresql://user:password@host:5432/dev_timeflow_enterprise_db?sslmode=require
MASTER_DATABASE_URL=postgresql://user:password@host:5432/dev_timeflow_enterprise_master_db?sslmode=require

# Optional L2 Redis Cache (Automatically falls back to L1 Memory LRU if omitted)
REDIS_URL=redis://localhost:6379
CACHE_MAX_ENTRIES=5000

# Dynamic Tenant Pool Tuning
MAX_TENANT_POOLS=60
TENANT_DB_POOL_MAX=10
TENANT_POOL_IDLE_MS=900000

# Security & Encryption
TENANT_ENCRYPTION_KEY=replace-with-32-byte-secret
JWT_SECRET=replace-with-jwt-secret
JWT_REFRESH_SECRET=replace-with-refresh-secret
JWT_ENCRIPTION_SECRET=replace-with-invite-secret

# Google OAuth & SMTP
GOOGLE_CLIENT_ID=your-google-client-id
EMAIL_USER=your-smtp-email
EMAIL_PASS=your-smtp-app-password
FRONTEND_URL=http://localhost:5173
API_RATE_LIMIT_MAX=300
```

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start development server with hot-reload
npm run dev

# 3. Build for production
npm run build
npm start
```

---

## Author & Organization
Architected and developed by **[Shamodha Sahan](https://shamodha.com)**.
