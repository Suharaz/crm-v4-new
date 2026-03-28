# Project Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Phase 19: Full Project Audit & Quality Fixes (2026-03-28)

#### Backend
- **Manager dept permission**: `checkTransferPermission()` now queries ManagerDepartment table (leads + customers)
- **Activities controller**: Replaced standalone PrismaClient with LeadsService DI for `triggerInProgress`
- **Cron error handling**: `processReminders()` and `runAutoRecall()` wrapped with try-catch + Logger
- **Redis config**: BullMQ now parses `REDIS_URL` env var, fallback to `REDIS_HOST`/`REDIS_PORT`
- **Bank transaction validation**: Amount must be > 0 on webhook ingest

#### Frontend
- **API port fix**: Corrected fallback from 3001 to 3010 in api-client.ts
- **Error boundary**: Dashboard-level `error.tsx` catches runtime errors gracefully
- **Zod form validation**: 8 schemas for all forms (lead, customer, user, product, order, task, settings)
  - Vietnamese phone validation (0 + 9-10 digits), field-level Vietnamese error messages
  - Shared `zod-form-validation-schemas.ts` + `parseZodErrors()` helper
- **Mobile responsive tables**: Hide non-essential columns on mobile (md:hidden, lg:hidden)
- **Loading skeletons**: `loading.tsx` for dashboard, leads, customers, orders routes using DataTableSkeleton

#### Audit Summary
- Full scan: 28 backend modules, 25 frontend pages, 70+ components, 3 packages
- Backend actual completeness: ~90% (was reported 85%, @Roles pattern verified correct via service-layer checks)
- Frontend actual completeness: ~85% (validation + error handling gaps now fixed)
- Remaining: Test coverage (0%), @crm/types population (deferred), Prisma migrations init

### Phase 18: Tasks/Todo Full Enhancement (2026-03-28)

#### Backend
- `PATCH /tasks/:id` — update title, description, dueDate, remindAt, priority, assignedTo
- `DELETE /tasks/:id` — soft delete
- Escalation cron: overdue >1h → notify assigned user, >24h → notify department manager
- Reminder reset: changing remindAt clears remindedAt flag

#### Frontend
- **Quick add bar**: inline task creation with Enter key + quick time presets (Hôm nay/Ngày mai/Tuần sau)
- **Enhanced create/edit dialog**: priority selector (Thấp/TB/Cao), remindAt datetime, assign-to-user dropdown
- **Edit task**: click title or pencil icon → pre-filled dialog → PATCH
- **Delete task**: trash icon with confirm dialog → soft DELETE
- **Priority badges**: color-coded (red HIGH, yellow MEDIUM, gray LOW)
- **Entity links**: LEAD/CUSTOMER tasks link to detail pages
- **Overdue indicator**: red "Quá hạn" badge when PENDING + past due
- **From-note task creation**: checkbox in lead note dialog → auto-creates linked task

### Phase 17: Frontend Polish — Dashboard, Pagination, Distribution UI (2026-03-28)

#### Added
- **Dashboard Stats API**: `GET /dashboard/stats` with role-based filtering (8 KPIs)
- **Dashboard KPI Cards**: Real data — new leads, in progress, converted, monthly revenue, total customers, orders, pending payments, overdue tasks
- **Cursor Pagination**: "Tải thêm" controls on leads, customers, orders, users list pages
- **AI Distribution Config UI**: Department-based weight config (workload/level/conversion), scores preview, batch auto-distribute button
- **Pagination Controls**: Reusable component with URL-based cursor state
- Sidebar nav: added "Phân phối AI" link (SUPER_ADMIN/MANAGER)

### Phase 16: Missing Features Gap Fill (2026-03-28)

#### Backend
- **File Upload Controller**: `POST /files/upload` (multipart) + `GET /files/*` (serve static)
- **Assignment Templates CRUD**: Create/update/delete templates with member lists, round-robin apply to POOL/FLOATING leads
- **Recall Config CRUD**: Auto-recall cron (every 2h) moves stale leads/customers to FLOATING + auto-label

#### Frontend
- **Global Search**: Debounced search bar in header with grouped results dropdown (leads/customers/orders)
- **Notifications**: Bell icon with unread count badge, 30s polling, mark read/all, dropdown list
- **Tasks Page**: Create dialog, complete/cancel actions, filter tabs (Tất cả/Đang chờ/Hoàn thành/Đã hủy)
- **CSV Import**: Drag-drop upload zones, job status polling (3s), import history table
- **CSV Export**: Export buttons on leads, customers, orders list pages
- Sidebar nav: added "Công việc" link

### Phase 15: Frontend CRUD Implementation (2026-03-28)

#### Added
- Full CRUD UI for all CRM entities (previously read-only)
- shadcn/ui components: Dialog, Select, Textarea, AlertDialog, DropdownMenu, Tabs, Badge
- Sonner toast notifications on all mutations
- Reusable form infrastructure: useFormAction hook, ConfirmDialog, FormField
- **Settings CRUD**: Tabbed page with create/edit/delete for departments, employee levels, lead sources, payment types, labels (color picker)
- **Users Management**: List/create/edit/deactivate users (SUPER_ADMIN) with department/team cascading dropdowns
- **Leads CRUD**: Create/edit form + action bar (assign, claim, transfer, convert, status change, label management, add notes)
- **Customers CRUD**: Create/edit form + action bar (claim, transfer, reactivate, labels)
- **Products CRUD**: Dialog-based create/edit/delete with price, VAT, category
- **Orders**: Status change dialog, create order from customer detail with product auto-fill
- **Payments**: Create payment, verify/reject buttons for pending payments (MANAGER+)
- Role-based button visibility across all pages
- "Quản lý NV" sidebar nav item for SUPER_ADMIN

### Phase 14: Testing & Deployment (2026-03-28)

#### Added
- API Dockerfile (multi-stage: deps → build → production)
- Full monorepo build verification: all 5 packages compile
- All 14 phases completed, 172h planned implementation

### Phase 12-13: Advanced Features (2026-03-28)

#### Phase 12: AI Lead Distribution
- Weighted scoring: workload (30%) + level (30%) + conversion rate (40%)
- Auto-distribution service: pick best user for lead assignment
- Batch distribution for department pools
- Config CRUD per department (toggle on/off, weight config)
- Score preview endpoint

#### Phase 13: Tasks, Search, Notifications
- Tasks CRUD: create, complete, cancel with priority and due dates
- Task reminders: cron every 5min, creates notification
- Global search: across leads, customers, orders (name/phone/email)
- Notifications: list, unread count, mark read, mark all read
- Notification creation service (injectable by other modules)

### Phase 09-11: Frontend Pages (2026-03-28)

#### Phase 09: Leads & Customers
- Lead list page with table (name, phone, status, source, user, date)
- Lead detail page: info panel + labels + activity timeline
- Kho Mới page (POOL, dept=null, manager+)
- Kho Thả Nổi page (FLOATING, all users)
- Customer list page with table
- Customer detail: info + labels + leads + orders + timeline

#### Phase 10: Orders, Products, Settings
- Orders list with table (customer, product, total, status, date)
- Order detail: info + payments list
- Products grid with price cards
- Call logs table with match status
- Settings page: departments, levels, sources, labels, payment types
- Import page placeholder (CSV upload zones)

#### Phase 11: Dashboard
- Dashboard home with KPI placeholder cards
- Shared components: StatusBadge, DataTableSkeleton

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
