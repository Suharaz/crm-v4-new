# Project Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Phase 08: Frontend Layout & Auth UI (2026-03-28)

#### Added
- Login page: email/password form, error handling, redirect after login
- Auth API proxy route: login/refresh/logout with httpOnly cookie management
- Auth middleware: redirect unauthenticated to /login, redirect logged-in from /login
- Auth provider: server-side user fetch, client-side context
- App shell: collapsible sidebar + header with user menu
- Sidebar navigation: Vietnamese labels, role-based visibility, active state
- shadcn/ui components: Button, Input, Card, Label (no barrel imports)
- Utility functions: cn(), formatVND(), formatDate(), formatNumber()
- Dashboard placeholder with KPI cards

#### Config
- Default ports changed: API 3010, Web 3011 (avoid NocoDB conflict)

### Phase 07: Data Import & Third-Party API (2026-03-28)

#### Added
- CSV import: BullMQ background processing, stream parsing, progress tracking
- ImportJob model with status tracking (PROCESSING/COMPLETED/FAILED)
- Lead import: phone normalization, dedup (phone+source+product), auto-create customer
- Customer import: phone dedup, validation
- Error report CSV generation for failed rows
- CSV export: leads, customers, orders with formula injection prevention
- Third-party lead ingestion API (POST /external/leads)
- BullMQ queue configuration with Redis connection

### Phase 06: Activity Timeline & Call Integration (2026-03-28)

#### Added
- Activities module: create notes, get timeline (cursor paginated) for leads/customers
- System auto-log on status changes, assignments, label changes, payments
- CallLogs module: ingest from 3rd party, auto-match by phone to lead/customer
- Auto IN_PROGRESS trigger on first note or matched call for ASSIGNED leads
- Unmatched call queue with manual match (manager+)
- FileUpload service: local filesystem, UUID filenames, MIME validation, 10MB max

### Phase 05: Products, Orders & Payments (2026-03-28)

#### Added
- ProductCategories CRUD (manager+)
- Products CRUD with Decimal prices, VAT rate, category FK
- PaymentTypes CRUD (lookup: CK lần 1-4, CK full, COD, Tiền mặt)
- Orders CRUD: create (auto-calc VAT), status transitions (PENDING→CONFIRMED→COMPLETED/CANCELLED/REFUNDED)
- Payments: create (PENDING), verify manual (manager+), reject
- Payment auto-match with bank transactions (exact amount + content substring)
- BankTransactions: webhook ingest (dedup by external_id), list, manual match
- PaymentMatching service: auto-match on create, conversion trigger
- Conversion trigger: total verified payments >= order.totalAmount → lead CONVERTED
- Auto IN_PROGRESS trigger when order created for ASSIGNED lead

### Phase 04: Core CRM — Leads & Customers (2026-03-28)

#### Added
- Leads CRUD: create (auto-link customer), list, detail, update, soft delete
- 3 Kho system: Kho Mới (POOL+dept=null), Kho Phòng Ban (POOL+dept=X), Kho Thả Nổi (FLOATING)
- Lead status machine: POOL→ASSIGNED→IN_PROGRESS→CONVERTED|LOST→FLOATING
- Lead assign (manager+), claim (atomic), transfer (DEPARTMENT/FLOATING/UNASSIGN)
- Lead convert to customer (IN_PROGRESS→CONVERTED, auto-create/update customer)
- Auto IN_PROGRESS trigger on first activity
- Customers CRUD: create (phone dedup), list, search by phone, detail, update
- Customer claim, transfer (DEPARTMENT/FLOATING/INACTIVE), reactivate
- Lead Sources CRUD (lookup table, super_admin)
- Labels CRUD + attach/detach on leads and customers
- Phone normalization + validation on all inputs
- Phone field-level permission (manager+ only)
- Assignment history logging on all assignment/transfer operations
- Activity logging on status changes

#### Business Logic
- Lead creation: normalize phone → find/create customer → POOL (Kho Mới)
- LOST→FLOATING (not reopen to POOL)
- Workspace packages now build to dist/ for CJS runtime compatibility

### Phase 03: Authentication & User Management (2026-03-28)

#### Added
- JWT auth: login, refresh token rotation, logout
- Account lockout: 5 failed attempts → 15min lock
- RBAC: @Roles decorator + global guard (SUPER_ADMIN, MANAGER, USER)
- Global JWT guard with @Public() bypass
- Users CRUD: list (cursor pagination), create, update profile, admin update, deactivate
- User deactivation cascade: unassign leads/customers to dept pool + log history
- Departments CRUD: list with user count, create, update, soft delete
- Employee Levels CRUD: list ordered by rank, full CRUD
- Teams CRUD: create with leader validation, update, soft delete
- Common infrastructure: BigInt transform interceptor, HTTP exception filter, ParseBigInt pipe
- Validation: class-validator DTOs with whitelist, separate profile vs admin update DTOs
- Rate limiting: @nestjs/throttler (100 req/min general, 5 req/min auth)
- Token revocation on: password change, deactivation, role change

#### Security
- bcrypt cost 12 for passwords
- SHA-256 hashed refresh tokens in DB
- No user enumeration (generic auth errors)
- Mass assignment prevention (separate DTOs)
- Pino log redaction for auth headers, passwords, tokens

### Phase 02: Database Schema & Prisma Setup (2026-03-28)

#### Added
- Full Prisma 6 schema: 30 tables, 10 enums, 90 indexes
- Models: User, Department, Team, EmployeeLevel, ManagerDepartment
- Models: Customer, Lead, LeadSource, Product, ProductCategory, Order, Payment, PaymentType
- Models: BankTransaction, Label, LeadLabel, CustomerLabel
- Models: Activity, ActivityAttachment, Document, CallLog
- Models: AssignmentHistory, AssignmentTemplate, AiDistributionConfig, RecallConfig
- Models: Task, RefreshToken, ApiKey, Notification
- BIGINT IDENTITY PKs, soft delete (deletedAt), snake_case mappings
- 20 raw SQL indexes: partial (WHERE deleted_at IS NULL), GIN (JSONB, FTS)
- Soft-delete Prisma extension (auto-filter on findMany/findFirst/count)
- Seed script: 6 users, 3 depts, 2 teams, 20 leads, 5 customers, 3 orders
- Docker ports: PG 5433, Redis 6380 (avoid conflicts)

### Phase 01: Monorepo Setup & Dev Environment (2026-03-27)

#### Added
- Turborepo monorepo with pnpm workspaces
- NestJS 11 API app (port 3001, `/api/v1` prefix, Pino logger, CORS, health endpoint)
- Next.js 15 web app (port 3000, Tailwind CSS 4, Turbopack dev)
- `@crm/database` package: Prisma 6 scaffold, PrismaClient singleton
- `@crm/types` package: BigIntString, ApiResponse, ApiErrorResponse
- `@crm/utils` package: phone normalization (VN format), CSV sanitizer
- Docker Compose: PostgreSQL 16 + Redis 7
- ESLint 9 flat config + Prettier
- API client skeleton (`api-client.ts`) for frontend
- `uploads/` directory for file storage

#### Infrastructure
- TypeScript strict mode, ES2022 target
- `pnpm build` compiles all 5 packages
- `pnpm lint` passes across workspace
- `pnpm dev` starts API + Web concurrently

### Planning Phase (2026-03-27)

#### Added
- Project planning: 14 phases, 172h total effort
- Implementation plan with detailed phase files
- Design guidelines: sky blue + white, glassmorphism, responsive
- Documentation suite: PDR, code standards, architecture, roadmap, deployment guide
- CLAUDE.md project instructions

#### Decisions Made
- 3 Kho lead system: Kho Mới, Kho Phòng Ban, Kho Thả Nổi
- Lead status: POOL, ASSIGNED, IN_PROGRESS, CONVERTED, LOST, FLOATING
- Customer status: ACTIVE, INACTIVE, FLOATING
- Payment: hybrid verification (auto-match webhook + batch cron 2h + manual)
- Partial payments support (CK lần 1/2/3/4/full)
- Assignment templates: round-robin vòng lặp, chọn người cụ thể
- Auto-recall: dept pool quá X ngày → FLOATING + auto labels
- Tasks/todo: quick add bar, smart time parsing, reminder escalation
- IN_PROGRESS: auto-trigger on first activity
- LOST → FLOATING (not reopen to POOL)
- Dedup: chỉ CSV import (SĐT+nguồn+sản phẩm)
- Order cancel/refund: không revert CONVERTED
- Transfer permission: user đang giữ + manager + super_admin
- File storage: local filesystem, no MinIO/S3
- Timezone: UTC storage, Asia/Ho_Chi_Minh display

---

*Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)*
