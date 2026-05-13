# CLAUDE.md - VeloCRM Project

## Project Overview

Internal CRM system (VeloCRM) for sales team efficiency, customer data management, lead pipeline, and performance evaluation. Supports 50-200 users across multiple departments.

- **Stack:** NestJS 11 + Next.js 16 + PostgreSQL 16 + Prisma 6 + Turborepo + pnpm
- **Architecture:** Next.js = pure frontend, NestJS = sole API server, REST only
- **UI:** shadcn/ui + Tailwind 4 + Plus Jakarta Sans, Vietnamese language only
- **Design:** Sky Blue #0ea5e9 + Cyan #06b6d4, colored shadows, gradient text, hover-lift cards
- **Auth:** JWT + refresh token rotation, httpOnly cookies
- **Deploy:** VPS + Docker Compose

## Workflows

- Primary workflow: `%USERPROFILE%/.claude/workflows/primary-workflow.md`
- Development rules: `%USERPROFILE%/.claude/workflows/development-rules.md`
- Orchestration protocols: `%USERPROFILE%/.claude/workflows/orchestration-protocol.md`
- Documentation management: `%USERPROFILE%/.claude/workflows/documentation-management.md`

## Character Style Rules (STRICT, NON-NEGOTIABLE)

**[CRITICAL] NEVER use em dash (—) in ANY file (code, comments, docs, commits, PR descriptions, UI text). ALWAYS use hyphen (-) instead.**

- Forbidden: `—` (em dash, U+2014), `–` (en dash, U+2013)
- Allowed: `-` (ASCII hyphen-minus, U+002D)
- Applies to: `.ts`, `.tsx`, `.js`, `.jsx`, `.md`, `.json`, `.yml`, `.yaml`, `.env`, `.sql`, `.prisma`, ALL Vietnamese UI strings, commit messages, PR titles/bodies, code review comments
- Why: Em/en dashes look like AI-generated content, break grep/search by ASCII pattern, cause encoding issues in some terminals/editors, and inconsistent across the codebase
- How to apply: When writing or editing any text, use only `-`. When reading existing files with `—` or `–`, replace them with `-` as part of the edit.

## Skills Activation Rule

**[CRITICAL] Always activate and use relevant skills for every task:**

- **Planning:** Use `plan`, `plan:hard`, `plan:parallel` skills for implementation planning
- **Research:** Use `research`, `docs-seeker` skills for technical research and documentation lookup
- **Coding:** Use `cook`, `code`, `code:auto` skills for feature implementation
- **Backend:** Use `nestjs-expert`, `backend-development`, `api-design`, `postgres-pro` skills
- **Frontend:** Use `nextjs-developer`, `react-expert`, `ui-styling`, `frontend-development` skills
- **Database:** Use `databases`, `postgresql-optimization`, `database-optimizer` skills
- **Testing:** Use `test`, `web-testing`, `playwright-expert` skills for test execution
- **Debugging:** Use `debug`, `debugging`, `debugging-wizard` skills for bug investigation
- **Code Review:** Use `code-review`, `code-reviewer` skills after implementation
- **Security:** Use `security-reviewer` skill for security audits
- **Git:** Use `git` skill for commits and PRs
- **Documentation:** Use `docs`, `docs:update` skills for documentation updates
- **Architecture:** Use `architecture-designer`, `mermaidjs-v11` skills for design decisions
- **Sequential Thinking:** Use `sequential-thinking` skill for complex problem analysis
- **Scouting:** Use `scout` skill for file discovery across codebase

**Rule:** Before starting any task, identify which skills are relevant and activate them. Never work without leveraging available skills.

## Architecture Rules

1. **Next.js = pure frontend.** No direct Prisma access. All data via NestJS API.
2. **NestJS = single source of business logic.** Controller -> Service -> Repository -> Prisma.
3. **Shared packages:** `@crm/types` (DTOs, interfaces), `@crm/database` (Prisma), `@crm/utils` (validators, formatters)
4. **Primary keys:** BIGINT with IDENTITY. Serialized as string in API responses.
5. **Soft delete:** All CRM entities. Partial indexes on `deletedAt IS NULL`.
6. **Enums:** Prisma native enums for stable values (status). Lookup tables for dynamic values (sources, labels, payment types).
7. **Pagination:** Cursor-based for all list endpoints.
8. **Search:** PostgreSQL full-text search (GIN index). No Elasticsearch.
9. **File storage:** Local filesystem (`uploads/` directory). No MinIO/S3.
10. **Background jobs:** BullMQ + Redis for CSV import processing.

## Monorepo Structure

```
crm-v4/
├── apps/
│   ├── api/                    # NestJS 11 (port 3010, prefix /api/v1)
│   └── web/                    # Next.js 16 (port 3011)
├── packages/
│   ├── database/               # Prisma schema + migrations + seed
│   ├── types/                  # Shared DTOs, interfaces, enums
│   └── utils/                  # Phone normalization, CSV sanitizer, formatters
├── docker-compose.yml          # PostgreSQL 16 + Redis 7
├── turbo.json
└── pnpm-workspace.yaml
```

## Role Permissions (CRITICAL - READ BEFORE ANY AUTH/ACCESS CODE)

**Đây là app nội bộ với 1-2 manager thực sự. MANAGER được thiết kế gần như SUPER_ADMIN, KHÔNG bị scope theo phòng ban. Đừng giả định theo nghĩa tiếng Việt thông thường của từ "manager".**

### Source of truth
File: `apps/api/src/common/filters/build-access-filter.ts:26`
```ts
if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.MANAGER) {
  return {};  // không filter - thấy TẤT CẢ data toàn hệ thống
}
```

### Permission Matrix

| Domain | SUPER_ADMIN | MANAGER | USER |
|--------|:---:|:---:|:---:|
| View leads / customers / orders / tasks | ALL | **ALL (không scope theo dept)** | Chỉ data assigned/created bởi mình |
| Create / assign / distribute / transfer leads | OK | OK | Chỉ claim từ pool |
| Verify / reject payments, match bank transactions | OK | OK | Không |
| CRUD products, labels, lead-sources, call-logs, recall-config | OK | OK | View only |
| Distribution config + run AI distribute | OK | OK (chạy), config SUPER_ADMIN | Không |
| Assignment templates | OK | OK | Không |
| Quản lý user (CRUD, đổi role, deactivate) | OK | Không (chỉ list) | Không |
| Quản lý department / team | OK | Không | Không |
| Payment types, installments, order-formats, product-groups | OK | Không | Không |
| API keys, cron-run, system-settings, audit-log full | OK | Không | Không |

### Quy tắc khi code feature mới (NON-NEGOTIABLE)

1. **Data scoping luôn qua `buildAccessFilter(user, entity)`** - tự xử đúng cho cả 3 role. KHÔNG tự viết filter `where: { departmentId: user.departmentId }` cho MANAGER. SAI.
2. **Endpoint guard mặc định:**
   - Thao tác business hằng ngày (CRUD lead/customer/order, verify payment, assign, distribute, view dashboard cross-dept) -> `@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)` (cho cả USER nếu là self-service).
   - Cấu hình hệ thống (department, team, user-CRUD, payment-type, api-key, cron-run, order-format, payment-installment) -> `@Roles(UserRole.SUPER_ADMIN)` only.
3. **UI nguyên tắc:** MANAGER nên thấy gần như mọi admin UI **trừ** menu System Config (Departments, Teams, Users, API Keys, Cron, System Settings). Không hide nút "xem cross-dept" với MANAGER.
4. **Khi review/test:** nếu thấy filter `departmentId` áp dụng cho MANAGER -> đó là BUG. Báo ngay.

### Anti-pattern thường gặp (FORBIDDEN)
- `if (user.role === MANAGER) where.departmentId = user.departmentId` - SAI, MANAGER thấy toàn bộ.
- Tạo endpoint mới `@Roles(MANAGER)` rồi filter thủ công theo dept - dùng `buildAccessFilter` thay vì viết lại logic.
- Coi MANAGER như "department head" trong copy/UI/error message - sai lệch model thực tế.

## Code Standards

### Backend (NestJS)
- Module pattern: `module.ts`, `controller.ts`, `service.ts`, `repository.ts`, `dto/`
- Global prefix: `/api/v1`
- Guards: JWT (global), Roles, Ownership
- Interceptors: BigInt serialization, logging
- Filters: HTTP exception standardization
- Pipes: ParseBigInt for route params
- Validation: class-validator or Zod in DTOs
- Logging: Pino with sensitive field redaction
- **IDOR prevention:** ALL repository queries MUST use `buildAccessFilter(user)` pattern

### Frontend (Next.js)
- Server Components by default, Client Components only when needed
- No barrel imports for shadcn/ui - import each component from its own file
- Lazy load heavy components (charts, kanban) with `next/dynamic`
- URL-based filter state (shareable views)
- React Hook Form + Zod for form validation
- API calls via `lib/api-client.ts` (handles token refresh)
- Date format: DD/MM/YYYY | Number format: 1.000.000 | Currency: VND (no decimals)
- All UI text in Vietnamese

### Database
- Snake_case for table names (`@@map`) and column names (`@map`)
- BIGINT IDENTITY for all PKs
- `deleted_at` nullable timestamp on all CRM entities
- JSONB for truly dynamic metadata only
- Partial indexes on `deleted_at IS NULL` for all soft-delete tables
- GIN indexes for full-text search and JSONB columns
- Raw SQL via tagged template literals only (prevent SQL injection)

### Security Checklist
- bcrypt cost 12 for passwords
- JWT secrets in env vars only
- Refresh tokens hashed (SHA-256) before DB storage
- Rate limiting: auth 5/min, API 100/min, 3rd party 100/min per key
- No user enumeration (generic error messages)
- API keys hashed in DB, shown ONCE on creation
- CSV export sanitization (formula injection prevention)
- File uploads: UUID filenames, MIME validation, 10MB max
- httpOnly + Secure + SameSite cookies for JWT

## Business Logic - Key Decisions

### 3 Kho Lead
- **Kho Mới:** `status=POOL, dept=null` → manager+ thấy, phân phối vào dept
- **Kho Phòng Ban:** `status=POOL, dept=X, user=null` → NV dept X thấy + claim
- **Kho Thả Nổi:** `status=FLOATING` → ALL users thấy + claim về kho cá nhân

### Lead Status Flow
```
POOL → ASSIGNED → IN_PROGRESS → CONVERTED | LOST → FLOATING
                                    ↓
                               Customer created
```
- IN_PROGRESS: auto-trigger khi sale tạo note/gọi điện/tạo order đầu tiên
- LOST → FLOATING (kho thả nổi, ai cũng claim)
- Transfer: DEPARTMENT / FLOATING / UNASSIGN

### Customer Status
- ACTIVE: đang chăm sóc
- INACTIVE: hoàn tất, ẩn khỏi kho (vẫn search SĐT + API được)
- FLOATING: kho thả nổi

### Payment Hybrid Verification
- Sale tạo payment (PENDING) → auto-match với bank webhook
- Webhook đến → auto-match với payment PENDING
- Cron 2h → fuzzy match cái miss
- Manager verify thủ công cái còn lại
- Partial payments: CK lần 1/2/3/4/full. Convert khi tổng verified >= order amount

### Assignment Templates
- Chọn danh sách người cụ thể. Round-robin vòng lặp (7 leads / 3 người → 2+2+1+1+1)
- Chỉ apply lên POOL/FLOATING leads. Skip leads khác status

### Auto-Recall
- Lead/customer ở dept pool quá X ngày → FLOATING + gắn nhãn mặc định
- Super admin config ngày + nhãn (1 nhãn auto)
- **Skip-if-exists:** cron không đè nhãn business của lead - chỉ gắn auto-label nếu `lead.label_id IS NULL`

### Lead vs Customer Label (BREAKING 2026-05-06)
- **Lead = 1 nhãn** (`leads.label_id` FK nullable, `leads.label_assigned_at` track recall timer)
- **Customer = N nhãn** (junction `customer_labels`)
- CSV import multi-label cho lead → chỉ áp dụng nhãn đầu, log warning

### Tasks/Todo
- Quick add bar (smart time parsing), quick time presets, from-note checkbox
- Reminder: gửi 1 lần (remindedAt flag). Escalation: quá hạn 1h → user, 24h → manager

### Other Rules
- Dedup: chỉ CSV import (SĐT+nguồn+sản phẩm). Manual/API → không dedup
- Order cancel/refund: KHÔNG revert lead CONVERTED
- Transfer permission: user đang giữ + manager dept + super_admin
- User deactivate: leads về kho phòng ban (giữ dept), auto-recall nếu quá hạn

## Design System

See: `docs/design-guidelines.md`
- Color: Sky blue (#0ea5e9) + White + Gray. Glass effect (subtle backdrop-filter blur)
- Responsive: Mobile card view, tablet scroll, desktop full table
- Touch targets: min 44x44px. WCAG 2.1 AA

## Implementation Plan

Located at: `plans/260325-1458-crm-v3-implementation/plan.md`

14 phases, 172h estimated. Key dependencies:
- Phase 01 (monorepo) blocks all
- Phase 02 (schema) blocks 03-07
- Phase 03 (auth) blocks 04-07
- Phases 04-07 can parallel after 03
- Phase 08 (frontend shell) blocks 09-11
- Phases 09-11 can parallel after 08
- Phase 14 (testing/deploy) runs last

## Commands

```bash
# Development
pnpm dev                    # Start both apps (API + Web)
pnpm build                  # Build all apps and packages
pnpm lint                   # Lint across workspace

# Database
pnpm db:generate            # Generate Prisma client
pnpm db:push                # Push schema to DB
pnpm db:migrate dev         # Create migration
pnpm db:seed                # Seed dev data
pnpm db:studio              # Open Prisma Studio

# Docker
docker compose up -d        # Start PostgreSQL + Redis
docker compose down         # Stop services

# Testing
pnpm test                   # Run unit tests
pnpm test:e2e               # Run integration tests
```

## Environment Variables

```env
DATABASE_URL=postgresql://crm:crm@localhost:5433/crm_v4
JWT_SECRET=<random-32-chars>
JWT_REFRESH_SECRET=<random-32-chars>
UPLOAD_DIR=./uploads
API_PORT=3010
NEXT_PUBLIC_API_URL=http://localhost:3010/api/v1
FRONTEND_URL=http://localhost:3011
REDIS_URL=redis://localhost:6380
```

# hãy sử dụng sequential-thinking  và các skill khác liên quan cho từng phase tương ứng (điều  này là bắt buộc)
# Quan trọng nhất: Phải luôn đọc file claude.md để hiểu rõ cấu trúc dự án, đọc thư mục docs và cập nhật liên tục các file changelog, todo
# Cực kì quan trong: Mỗi khi hoàn thành 1 tính năng cần commit và push luôn nếu không lỗi gì. 