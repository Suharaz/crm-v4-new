# Research Reports Review & Synthesis

**Date:** 2026-03-25 | **Reviewer:** Orchestrator
**Reports reviewed:** 4 researcher reports for CRM V3

---

## Overall Assessment

All 4 reports are **solid and practical**. Few conflicts between reports. Below: agreements, conflicts, corrections, and final consolidated decisions.

---

## 1. AGREEMENTS (Consistent Across Reports)

| Topic | Consensus |
|-------|-----------|
| UI Library | shadcn/ui + Tailwind CSS |
| Forms | React Hook Form + Zod |
| Tables | TanStack Table (headless) |
| Charts | Recharts |
| State Mgmt | Minimal: props + Context + URL params. No Redux/Zustand |
| ORM | Prisma with raw queries for analytics |
| Soft Delete | deleted_at timestamp + partial indexes |
| Pagination | Cursor-based for performance |
| Auth | JWT + refresh token rotation |
| RBAC | Guards + decorators, role hierarchy |
| Activity | Polymorphic single table (entity_type + entity_id) |
| Monorepo | Turborepo with packages/database, packages/types, packages/shared |
| Logging | Pino (structured) |
| Background Jobs | Bull/BullMQ |
| File Storage | MinIO (S3-compatible) |
| Deploy | Docker Compose on VPS |

---

## 2. CONFLICTS & RESOLUTIONS

### 2.1 Primary Key: UUID vs BIGINT

**PostgreSQL report:** Recommends BIGINT with IDENTITY (performance, smaller indexes)
**NestJS report:** Uses `cuid()` in Prisma examples
**Frontend report:** Uses `string` type for IDs throughout

**Resolution: Use BIGINT with IDENTITY**
- Performance advantage real at CRM scale (10K+ leads/month)
- Sequential = better B-tree performance, cache locality
- Privacy concern minimal for internal CRM
- Frontend will receive `string` (BigInt serialized) — no impact on UI code
- **Exception:** Consider UUID only if multi-tenant SaaS planned (currently: single-tenant, YAGNI)

### 2.2 Server Actions vs REST API

**React/Next.js report:** Recommends Server Actions for mutations, Prisma directly in Server Components
**NestJS report:** Full REST API with controller → service → repository pattern

**Resolution: Use NestJS REST API exclusively**
- We already chose NestJS as dedicated API server — don't bypass it with Server Actions calling Prisma directly
- Server Actions should call NestJS API, not Prisma directly
- Single source of truth for business logic = NestJS
- Next.js = pure frontend, no direct DB access
- Server Actions OK for calling NestJS API endpoints (replaces client-side fetch), but NOT for direct Prisma calls

**Correction to React report:**
```tsx
// ❌ WRONG: Server Action calling Prisma directly
'use server'
const lead = await prisma.lead.create({ ... })

// ✅ CORRECT: Server Action calling NestJS API
'use server'
const lead = await fetch(`${API_URL}/leads`, { method: 'POST', body: JSON.stringify(data) })
```

### 2.3 File Structure Overlap

**React report:** `packages/api/` (NestJS in packages)
**NestJS report:** `apps/api/` (NestJS in apps)

**Resolution: `apps/api/` is correct**
- NestJS is an app, not a package
- Packages = shared libraries (database, types, utils)
- Apps = deployable applications (api, web)

**Final structure:**
```
crm-v3/
├── apps/
│   ├── api/          # NestJS
│   └── web/          # Next.js
├── packages/
│   ├── database/     # Prisma schema, migrations
│   ├── types/        # Shared DTOs, interfaces, enums
│   └── utils/        # Shared utilities
```

### 2.4 Enum Strategy

**PostgreSQL report:** Native PG enums (type safety, small storage)
**NestJS report:** TypeScript enums + Prisma native enums

**Resolution: Prisma native enums (maps to PG enums)**
- Prisma `enum` keyword creates native PG enum automatically
- TypeScript type safety + PG type safety
- **Caveat:** Adding new enum values requires migration. Acceptable for CRM status fields (stable after initial design)
- For frequently-changing values (lead sources, labels, payment types): use **lookup tables** CRUD by super_admin — NOT enums

### 2.5 Authentication in Next.js

**React report:** `proxy.ts` (renamed middleware in Next.js 16)
**NestJS report:** JWT strategy with Passport

**Resolution: Both needed, different layers**
- Next.js middleware/proxy: check if JWT cookie exists → redirect to login if not
- NestJS: validate JWT signature, extract user, enforce RBAC
- Next.js does NOT validate JWT signature (lightweight check only)

---

## 3. CORRECTIONS & IMPROVEMENTS

### 3.1 PostgreSQL Report

**Good:**
- BIGINT recommendation well-argued
- Cursor pagination explanation excellent
- Materialized views for analytics practical
- Partial indexes for soft delete critical
- COPY command for bulk import

**Corrections:**
- `@@fulltext` annotation in Prisma example is wrong — Prisma doesn't support `@@fulltext` for PostgreSQL (only MySQL). Use raw SQL for GIN full-text index.
- `@@uniqueConstraint` doesn't exist in Prisma. Should be `@@unique([email, deletedAt])`.
- PgBouncer: mention that Prisma 5+ has built-in connection pooling via `?connection_limit=10` in DATABASE_URL. PgBouncer optional but recommended for production.

**Addition needed:**
- Phone number normalization strategy (libphonenumber) — critical for auto-matching calls
- Index on `(phone, deletedAt)` specifically for call matching use case

### 3.2 NestJS Report

**Good:**
- Module decomposition clean and practical
- Repository pattern with Prisma well-explained
- JWT refresh token rotation with family tracking excellent
- RBAC guards with ownership check exactly what we need
- REST API naming conventions appropriate

**Corrections:**
- Package versions outdated: Prisma should be `^6.x` not `^5.9`, NestJS `^11.x` not `^10.x`
- `@nestjs/typeorm` listed in dependencies but we're using Prisma — remove it
- Lead scoring service example assumes AI scoring at creation time — per brainstorm, Phase 1 uses manual assignment, AI matching comes later

**Addition needed:**
- API key authentication module for 3rd party integrations (call log API, lead import API)
- Rate limiting specifically for 3rd party endpoints
- Webhook signature verification pattern

### 3.3 React/Next.js Report

**Good:**
- Server Components by default — correct principle
- Suspense boundaries for dashboard streaming excellent
- URL searchParams for filter state practical
- TanStack Table code examples useful
- Auth context pattern clean

**Corrections:**
- Remove all references to "Prisma directly in Server Components" — we use NestJS API
- `proxy.ts` naming is speculative for Next.js 16 — current stable is `middleware.ts`. Use `middleware.ts` until officially renamed
- React Hook Form + useActionState combination example is awkward — pick one approach: React Hook Form for complex forms OR useActionState for simple forms. Don't mix.

**Addition needed:**
- How to forward JWT from cookies to NestJS API calls in Server Components
- Error boundary patterns for dashboard sections
- Optimistic updates pattern for CRM actions (assign, claim)

### 3.4 UI/UX Report

**Good:**
- Sidebar layout + breadcrumbs standard for CRM
- DataTable feature checklist comprehensive
- Kanban board for lead pipeline practical
- Color system well-defined
- JSONB metadata editor UX pattern useful
- Toast patterns with undo/retry actions

**Corrections:**
- "Send Email" in quick actions — per brainstorm, no email integration. Remove.
- "Schedule Call" — no scheduling feature discussed. Call logs are passive (3rd party pushes data). Remove.
- Global search dropdown — needs to match actual entities: Leads, Customers, Orders (not generic)

**Addition needed:**
- Lead Pool view: dedicated view for unassigned leads in waiting pool (not just Kanban)
- Claim button UX: prominent CTA when viewing unclaimed customer in your department
- Call log timeline: how to display matched/unmatched calls
- CSV import progress UI (upload → parsing → validation → results)

---

## 4. CONSOLIDATED TECH DECISIONS

### Final Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Frontend** | Next.js (App Router) | 16.x |
| **Backend** | NestJS | 11.x |
| **Database** | PostgreSQL | 16+ |
| **ORM** | Prisma | 6.x |
| **Monorepo** | Turborepo | latest |
| **Package Manager** | pnpm | 9.x |
| **UI Components** | shadcn/ui | latest |
| **Styling** | Tailwind CSS | 4.x |
| **Forms** | React Hook Form + Zod | 7.x / 3.x |
| **Tables** | TanStack Table | 8.x |
| **Charts** | Recharts | 2.x |
| **Drag & Drop** | @dnd-kit | latest |
| **Toast** | sonner | latest |
| **Auth** | JWT (jose) + Passport | - |
| **Background Jobs** | BullMQ | latest |
| **File Storage** | MinIO | latest |
| **Logging** | Pino | 8.x |
| **Containerization** | Docker + Docker Compose | - |

### Architecture Rules

1. **Next.js = pure frontend**. No direct Prisma access. All data via NestJS API.
2. **NestJS = single source of business logic**. Controller → Service → Repository → Prisma.
3. **Shared packages**: `types` (DTOs, interfaces), `database` (Prisma schema), `utils` (validators, formatters).
4. **Primary keys**: BIGINT with IDENTITY. Serialized as string in API responses.
5. **Soft delete**: All CRM entities. Partial indexes on `deletedAt IS NULL`.
6. **Enums**: Prisma native enums for stable values (status). Lookup tables for dynamic values (sources, labels, payment types).
7. **JSONB**: For truly dynamic custom fields only. Max 2-3 JSONB columns per table.
8. **Pagination**: Cursor-based for list endpoints. Offset only for admin/dashboard with known small result sets.
9. **Analytics**: Real-time aggregation for <100K rows. Materialized views for dashboards when needed.
10. **Search**: PostgreSQL full-text search (GIN index). No Elasticsearch.

---

## 5. UNRESOLVED QUESTIONS (From All Reports)

### Must Answer Before Implementation

1. **Phone number format**: Vietnamese only (10-11 digits) or international? Affects normalization strategy.
2. **Lead deduplication**: By phone only? Or phone + email combo? What happens when duplicate detected during import?
3. **Audit trail depth**: Action-level (user assigned lead) vs field-level (user changed lead.status from NEW to CONTACTED)?
4. **Export formats**: CSV only? Or also Excel/PDF?
5. **File upload limits**: Max file size for attachments? Accepted file types?

### Can Defer (Not Needed for Phase 1)

6. Multi-tenant / SaaS — skip for now (YAGNI)
7. Real-time updates — not required per brainstorm
8. Call recording storage — defer until call integration phase
9. Custom dashboard builder — pre-built dashboards first
10. Offline support — not needed for internal CRM

---

## 6. NEXT STEPS

1. **Answer 5 must-answer questions** before planning
2. **Create implementation plan** with phases based on brainstorm + research
3. **Phase 1 priority**: Monorepo setup → DB schema → Auth → Users/Departments → Basic CRUD
4. **Prototype first**: Get a working skeleton with 1 full flow (create lead → assign → view) before building everything
