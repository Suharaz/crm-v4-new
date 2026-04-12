# CRM V4 — Comprehensive Audit Report

**Date:** 2026-04-12
**Branch:** `audit/security-performance-query-260412`
**Scope:** Full codebase scan — Security, Performance, Query Speed
**Stack:** NestJS 11 + Next.js 16 + PostgreSQL 16 + Prisma 6
**Scale target:** 50-200 users, 100K+ leads, 50K+ customers, 500K+ activities

---

## Executive Summary

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| Security | 1 | 5 | 6 | 3 | 15 |
| Performance | 2 | 4 | 6 | 3 | 15 |
| Database/Query | 4 | 7 | 5 | 5 | 21 |
| **Total** | **7** | **16** | **17** | **11** | **51** |

**Top 3 risks requiring immediate action:**
1. Path traversal in file serving (Security C1) — unauthenticated arbitrary file read
2. Payment matching race condition (Performance C1) — double-payment verification
3. Missing partial indexes on `deleted_at IS NULL` (Database C1) — every query scans deleted rows

---

## Part 1: Security Audit (OWASP Top 10)

### CRITICAL

#### SEC-C1: Path Traversal — Unauthenticated File Serving
- **File:** `apps/api/src/modules/file-upload/file-upload.controller.ts:39-54`
- **Issue:** `@Public()` decorator + no path sanitization. `GET /api/v1/files/../../.env` resolves outside upload dir, serves arbitrary files. `getAbsolutePath()` in `file-upload.service.ts:68` does raw `path.join` without boundary check
- **Impact:** Attacker reads `.env` (DB credentials, JWT secrets), source code, any server file
- **Fix:**
```ts
const abs = path.resolve(this.uploadDir, relativePath);
if (!abs.startsWith(path.resolve(this.uploadDir))) throw new ForbiddenException();
```
Remove `@Public()` — require JWT auth for file access

---

### HIGH

#### SEC-H1: No Webhook Signature Verification
- **File:** `apps/api/src/modules/bank-transactions/bank-transactions.controller.ts:23-30`
- **Issue:** Bank webhook only requires `x-api-key` (any active key, no scope check). No HMAC signature validation. Same in `call-logs.controller.ts:20-28`
- **Impact:** Any holder of a valid CRM API key can inject fake bank transactions, auto-verifying fraudulent payments
- **Fix:** Add `WEBHOOK_SECRET` env var, validate `x-signature` HMAC-SHA256 header

#### SEC-H2: IDOR in `findById` Methods
- **Files:** `leads.service.ts:244-250`, `customers.service.ts:101-128`, `orders.service.ts:100-118`
- **Issue:** `findById(id)` has no `assignedUserId` filter. A USER-role attacker who guesses/enumerates BigInt IDs can read ANY lead/customer/order. `list()` correctly scopes by user, but `findById` does not, and all mutations call `findById` first
- **Impact:** Full data exposure for USER role — bypasses RBAC on detail/edit endpoints
- **Fix:** Create `findByIdScoped(id, user)` that adds `assignedUserId` filter for USER role

#### SEC-H3: Missing Helmet Security Headers
- **File:** `apps/api/src/main.ts`
- **Issue:** No `helmet()` middleware. Missing: `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Content-Security-Policy`
- **Fix:** `import helmet from 'helmet'; app.use(helmet());`

#### SEC-H4: MIME Validation is Header-Only (Spoofable)
- **File:** `apps/api/src/modules/file-upload/file-upload.service.ts:40`
- **Issue:** `mimetype` from Multer reads `Content-Type` header (trivially spoofable). `.php` or `.js` uploaded as `image/jpeg`
- **Fix:** Validate magic bytes using `file-type` npm package

#### SEC-H5: MCP Endpoint Bypasses Rate Limiting
- **File:** `apps/api/src/modules/mcp-agent/mcp-agent.controller.ts:24`
- **Issue:** `@SkipThrottle()` on entire controller. Unlimited requests with stolen API key = full DB exfiltration
- **Fix:** Remove `@SkipThrottle()`, apply `@Throttle({ mcp: { ttl: 60000, limit: 100 } })`

---

### MEDIUM

#### SEC-M1: API Key Guard Ignores Permission Scope
- **File:** `apps/api/src/modules/auth/guards/api-key-auth.guard.ts:30-34`
- **Issue:** Checks `isActive: true` but NOT `permissions` array. Any API key can ingest bank transactions
- **Fix:** Verify `permissions` contains required scope

#### SEC-M2: Search Service Has No Role Scoping
- **File:** `apps/api/src/modules/search/search.service.ts:11-51`
- **Issue:** Searches all leads/customers regardless of user role. USER can see other users' data via global search
- **Fix:** Pass `user` to `search()`, apply `assignedUserId` filter for USER role

#### SEC-M3: Export Service Has No Role/Ownership Scope
- **File:** `apps/api/src/modules/export/export.service.ts:10-105`
- **Issue:** No user-based filters on `exportLeads`, `exportCustomers`, `exportOrders`
- **Fix:** Add role-based filtering, scope USER exports to own records

#### SEC-M4: Weak `externalId` Validation on Webhooks
- **File:** `apps/api/src/modules/bank-transactions/bank-transactions.service.ts:47-55`
- **Issue:** Only checks truthy. No length/format constraint. Malformed strings pass to DB
- **Fix:** Add `@IsString() @MaxLength(255) @Matches(/^[\w\-]+$/)` via DTO

#### SEC-M5: `metadata` Field Accepts Arbitrary JSON
- **File:** `apps/api/src/modules/third-party-api/third-party-api.controller.ts:53`
- **Issue:** `metadata: body.metadata as any` — no validation on JSONB size or content from external API
- **Fix:** Validate with `@IsObject()` + max size constraint

#### SEC-M6: CORS Fallback to Localhost in Production
- **File:** `apps/api/src/main.ts:33`
- **Issue:** `origin: process.env.FRONTEND_URL || 'http://localhost:3011'` — silent fallback if env missing
- **Fix:** Throw error on missing `FRONTEND_URL` in production

---

### LOW

- **SEC-L1:** `enableImplicitConversion: true` in ValidationPipe — could bypass type validators
- **SEC-L2:** Auth cookies use `SameSite=Lax` — `Strict` better for internal CRM
- **SEC-L3:** Dashboard raw SQL uses tagged template literals correctly — no injection risk (Good)

---

## Part 2: Performance Audit

### CRITICAL

#### PERF-C1: Race Condition in Payment Matching
- **File:** `apps/api/src/modules/payments/payment-matching.service.ts:33-52`
- **Issue:** `tryMatchBankTransaction` fetches candidates outside transaction, filters in-memory, then calls `executeMatch`. Concurrent webhook can match same bank transaction = double-payment verification
- **Impact:** Financial data corruption. Two payments auto-verified against one bank transaction
- **Fix:**
```ts
const updated = await tx.bankTransaction.updateMany({
  where: { id: bankTxId, matchStatus: 'UNMATCHED' }, // optimistic guard
  data: { matchedPaymentId: paymentId, matchStatus: 'AUTO_MATCHED' },
});
if (updated.count === 0) throw new Error('Already matched');
```

#### PERF-C2: Import Processor — Memory + Connection Pool Leak
- **File:** `apps/api/src/modules/import/import.processor.ts:18, 37-48`
- **Issue:** (a) `fs.readFileSync` + collects ALL records before processing. 50K rows = ~10MB per import, multiple concurrent workers = OOM risk. (b) `new PrismaClient()` per worker creates separate connection pool. 5 workers = 50 connections, exhausts PG limits
- **Fix:** (a) Stream CSV with `for await (const row of parser)`. (b) Inject `PrismaClient` via NestJS DI

---

### HIGH

#### PERF-H1: N+1 in Scoring Service (6,000 queries per batch distribute)
- **File:** `apps/api/src/modules/distribution/scoring.service.ts:36-81`
- **Issue:** `scoreUsers()` runs 2-3 queries per user × 20 users = 60 queries per lead. `batchDistribute` runs per lead × 100 leads = 6,000 queries
- **Fix:** Replace with `groupBy` aggregation for all users in one query

#### PERF-H2: Unbounded `activity.findMany` in `getStatsByDepartment`
- **File:** `apps/api/src/modules/activities/activities.service.ts:122`
- **Issue:** No `take` limit. Busy customer with 10 leads = thousands of activity rows loaded to memory
- **Fix:** Add `take: 500` cap, or move grouping to SQL `GROUP BY`

#### PERF-H3: N+1 in Assignment Template Apply
- **File:** `apps/api/src/modules/assignment-templates/assignment-templates.service.ts:111-130`
- **Issue:** `for` loop inside `$transaction` — `lead.update` + `assignmentHistory.create` per lead. 100 leads = 200 sequential queries in single transaction
- **Fix:** Group by userId, `updateMany` per group + `createMany` for history

#### PERF-H4: N+1 in CSV Import (4-6 queries per row)
- **File:** `apps/api/src/modules/import/import.processor.ts:108-186`
- **Issue:** `processLeadRow` runs `customer.findFirst`, `leadSource.findFirst`×2, `product.findFirst`, `lead.findFirst` per row. 1000-row CSV = 6,000 queries
- **Fix:** Preload lookup tables (sources, products) once before loop. Cache phone→customer in `Map`

---

### MEDIUM

#### PERF-M1: Zero Caching Layer
- **Issue:** No `CacheModule`, no Redis caching, no in-memory TTL. Every request to labels/departments/products/levels hits DB
- **Fix:** Add `@nestjs/cache-manager` with Redis (already available). 5-min TTL for lookup tables, 60s for dashboard stats

#### PERF-M2: `poolNewFiltered` Hardcoded `take: 200` Without Cursor
- **File:** `apps/api/src/modules/leads/leads.service.ts:136`
- **Issue:** Returns up to 200 leads + all distributed leads from 72h. No `nextCursor` returned. Growing result set
- **Fix:** Apply cursor pagination or reduce cap to 50 with cursor meta

#### PERF-M3: Export Loads 10K Rows Into Memory
- **File:** `apps/api/src/modules/export/export.service.ts:16-42`
- **Issue:** `take: 10000` into memory, builds full array, then `stringify` synchronously
- **Fix:** Use streaming CSV with `csv-stringify` piped to response

#### PERF-M4: Dashboard `getLeadFunnel` — 7 Separate COUNT Queries
- **File:** `apps/api/src/modules/dashboard/dashboard.service.ts:55-60`
- **Fix:** Single `groupBy({ by: ['status'], _count: true })`

#### PERF-M5: Unbounded Recall Queries
- **File:** `apps/api/src/modules/recall-config/recall-config.service.ts:95-103, 135-143`
- **Issue:** No `take` limit. 1000+ leads → large array → large `IN` clause
- **Fix:** Process in chunks of 500

#### PERF-M6: Payment Import Per-Row Product/User Lookup
- **File:** `apps/api/src/modules/payments/payment-import.service.ts:186-214`
- **Fix:** Preload product and user lookups with payment types/installments

---

### LOW

- **PERF-L1:** `next.config.ts` — no `optimizePackageImports`, no bundle analysis
- **PERF-L2:** Frontend 30s `setInterval` polling — verify `clearInterval` in unmount
- **PERF-L3:** `scoring.service.ts:85-86` — `Array.find()` O(n^2). Use `Map` keyed by userId

### Positive Observations
- `leads.service.ts` `claim()` uses atomic `updateMany({ where: { assignedUserId: null } })` — correct
- Bulk operations use `updateMany`/`createMany` inside transactions
- `enrichLeads()` uses 4 parallel `groupBy` — excellent pattern
- Dashboard uses raw SQL for complex aggregations — correct approach
- MCP tools enforce `Math.min(limit, 100)` cap
- Cursor pagination consistently used on primary list endpoints

---

## Part 3: Database & Query Speed Audit

### CRITICAL

#### DB-C1: `leads` Table — No Partial Index on `deleted_at IS NULL`
- **Schema:** `packages/database/prisma/schema.prisma` line 274-310
- **Issue:** `@@index([status, assignedUserId])` exists but NOT partial. Soft-delete extension auto-appends `deletedAt: null` to every query. 100K leads with 20% deleted = 20K dead rows polluting every B-tree scan
- **Fix:**
```sql
CREATE INDEX CONCURRENTLY idx_leads_status_user_active
  ON leads (status, assigned_user_id) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY idx_leads_dept_status_active
  ON leads (department_id, status) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY idx_leads_created_at_active
  ON leads (created_at DESC) WHERE deleted_at IS NULL;
```

#### DB-C2: `activities` Table — No Partial Index + Correlated Subquery
- **Schema line 560-577, Dashboard line 142-166**
- **Issue:** `@@index([entityType, entityId, createdAt])` NOT partial. `getLeadAging` runs correlated subquery per lead: `SELECT MAX(a.created_at) FROM activities a WHERE a.entity_type='LEAD' AND a.entity_id = l.id`. At 500K activities = nested loop sequential scan
- **Fix:**
```sql
CREATE INDEX CONCURRENTLY idx_activities_entity_active
  ON activities (entity_type, entity_id, created_at DESC) WHERE deleted_at IS NULL;
```
Rewrite `getLeadAging` to use lateral join or `GROUP BY`

#### DB-C3: `phone` Column — No Index (Sequential Scan on Every Search)
- **Schema line 276, search.service.ts line 14**
- **Issue:** `phone` has no index. `contains` generates `LIKE '%value%'` — full sequential scan. At 100K leads, every phone search = full table scan
- **Fix:**
```sql
-- Exact match:
CREATE INDEX CONCURRENTLY idx_leads_phone ON leads (phone) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY idx_customers_phone ON customers (phone) WHERE deleted_at IS NULL;

-- Substring search (pg_trgm):
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY idx_leads_phone_trgm ON leads USING gin (phone gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_leads_name_trgm ON leads USING gin (name gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_customers_phone_trgm ON customers USING gin (phone gin_trgm_ops);
CREATE INDEX CONCURRENTLY idx_customers_name_trgm ON customers USING gin (name gin_trgm_ops);
```

#### DB-C4: `notifications` Table — No Cleanup/Archival
- **Schema line 788-803**
- **Issue:** No `deletedAt`, no TTL, no partition. 200 users × 300 days = 60K-1M rows/year. Permanent bloat
- **Fix:** Cron to hard-delete notifications >90 days, or partition by month

---

### HIGH

#### DB-H1: `poolNewFiltered` — Heavy LEAD_SELECT With Nested orders.payments
- **File:** `leads.service.ts:131, 163-174`
- **Issue:** `take: 200` with full `LEAD_SELECT` including nested `orders.payments`. Each row hits N×M joins
- **Fix:** Use slimmer projection for pool-list endpoints

#### DB-H2: Dashboard `getTopPerformers` — Full Users×Leads×Orders Cross-Join
- **File:** `dashboard.service.ts:84-99`
- **Issue:** No date filter on leads join, joins ALL non-deleted leads for every user. No index on `leads.updated_at`
- **Fix:**
```sql
CREATE INDEX CONCURRENTLY idx_leads_updated_at ON leads (updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY idx_payments_verified_at ON payments (verified_at) WHERE status = 'VERIFIED';
```

#### DB-H3: Dashboard `getConversionTrend` — `::date` Cast Prevents Index Use
- **File:** `dashboard.service.ts:121-134`
- **Issue:** `generate_series` × `leads` with `(created_at::date = d.day OR updated_at::date = d.day)`. Cast prevents B-tree index use
- **Fix:** Functional indexes:
```sql
CREATE INDEX CONCURRENTLY idx_leads_created_date ON leads ((created_at::date)) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY idx_leads_converted_date ON leads ((updated_at::date)) WHERE status = 'CONVERTED' AND deleted_at IS NULL;
```

#### DB-H4: Search Service — 3 Parallel `ILIKE '%query%'` Without Trigram Index
- **File:** `search.service.ts:11-51`
- **Issue:** `mode: 'insensitive'` generates `ILIKE '%query%'`. Without `pg_trgm` GIN = full sequential scan on every keystroke
- **Fix:** See DB-C3 trigram indexes

#### DB-H5: Leads Enrichment — 4 Extra Queries Per List Page
- **File:** `leads.service.ts:348-386`
- **Issue:** `enrichLeads` fires 4 `groupBy` queries after every `list()` call. Could merge into 2 queries using `_count` + `_max`

#### DB-H6: Payment Matching — In-Memory Content Filter
- **File:** `payment-matching.service.ts:36-50`
- **Issue:** Fetches ALL `PENDING` payments with matching amount, then filters by `transferContent` in JavaScript. No index on `payments.status`
- **Fix:**
```sql
CREATE INDEX CONCURRENTLY idx_payments_status_amount ON payments (status, amount);
```

#### DB-H7: Missing Status Indexes on Orders + Payments
- **Issue:** `orders`: no index on `status`. `payments`: only `@@index([orderId])`, no `(status, verifiedAt)` for dashboard revenue aggregations
- **Fix:**
```sql
CREATE INDEX CONCURRENTLY idx_orders_status_active ON orders (status) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY idx_payments_status_verified_at ON payments (status, verified_at);
```

---

### MEDIUM

#### DB-M1: `activities.service.ts` — Unbounded `findMany` for Stats
- **Fix:** Paginate or use raw SQL `GROUP BY department_id`

#### DB-M2: `customers` Table — Missing Partial Indexes
- **Fix:**
```sql
CREATE INDEX CONCURRENTLY idx_customers_dept_user_active
  ON customers (assigned_department_id, assigned_user_id) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY idx_customers_status_active
  ON customers (status) WHERE deleted_at IS NULL;
```

#### DB-M3: `tasks` Table — Missing Partial Indexes
- **Fix:**
```sql
CREATE INDEX CONCURRENTLY idx_tasks_assigned_status_due_active
  ON tasks (assigned_to, status, due_date) WHERE deleted_at IS NULL;
CREATE INDEX CONCURRENTLY idx_tasks_remind_active
  ON tasks (remind_at) WHERE status = 'PENDING' AND reminded_at IS NULL AND deleted_at IS NULL;
```

#### DB-M4: `AssignmentHistory` — No Index for 72h Window Query
- **Fix:**
```sql
CREATE INDEX CONCURRENTLY idx_assignment_history_type_dept_created
  ON assignment_history (entity_type, created_at DESC) WHERE from_department_id IS NULL;
```

#### DB-M5: Prisma — No Connection Pool Configuration
- **File:** `packages/database/src/index.ts:9`
- **Issue:** `new PrismaClient()` with defaults. 2-core VPS = 5 connections. 200 concurrent users = pool timeout
- **Fix:** `DATABASE_URL` with `?connection_limit=20&pool_timeout=10`

---

### LOW

- **DB-L1:** `getLeadFunnel` runs 7 separate `COUNT` — replace with single `groupBy`
- **DB-L2:** `LEAD_SELECT` eagerly loads `orders.payments` for list endpoints
- **DB-L3:** Recall loads all IDs into memory then `IN(...)` — replace with direct `updateMany`
- **DB-L4:** `BankTransaction.content` no index for `ILIKE` matching
- **DB-L5:** MCP `count` query runs even during cursor pagination (wasted)

---

## Priority Implementation Roadmap

### Phase 1: CRITICAL — Fix Before Production (Week 1)

| # | Issue | Category | Effort |
|---|-------|----------|--------|
| 1 | SEC-C1: Path traversal in file serving | Security | 1h |
| 2 | PERF-C1: Payment matching race condition | Performance | 2h |
| 3 | SEC-H2: IDOR in findById methods | Security | 3h |
| 4 | SEC-H3: Add Helmet security headers | Security | 30min |
| 5 | PERF-C2: Import processor memory + connection leak | Performance | 2h |

### Phase 2: HIGH — Fix Before Scale (Week 2)

| # | Issue | Category | Effort |
|---|-------|----------|--------|
| 6 | DB-C1+C2+C3: Add missing partial + phone + trigram indexes | Database | 3h |
| 7 | SEC-H1: Webhook signature verification | Security | 2h |
| 8 | PERF-H1: Scoring service N+1 (6000 queries) | Performance | 3h |
| 9 | SEC-H4+H5: MIME validation + MCP rate limit | Security | 2h |
| 10 | DB-H7: Orders/payments status indexes | Database | 1h |
| 11 | SEC-M2+M3: Scope search + export by role | Security | 2h |

### Phase 3: MEDIUM — Optimize (Week 3-4)

| # | Issue | Category | Effort |
|---|-------|----------|--------|
| 12 | PERF-M1: Add Redis caching layer | Performance | 4h |
| 13 | DB-M2+M3+M4: Remaining partial indexes | Database | 2h |
| 14 | DB-M5: Connection pool configuration | Database | 30min |
| 15 | PERF-H3+H4: Assignment template + import N+1 | Performance | 3h |
| 16 | DB-C4: Notification cleanup cron | Database | 2h |
| 17 | PERF-M3: Stream CSV export | Performance | 2h |

**Total estimated effort:** ~34 hours

---

## Positive Findings (Already Good)

- bcrypt cost 12, SHA-256 refresh tokens, rotation, lockout — solid auth
- `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })` — prevents mass assignment
- CSV formula injection sanitization with `\t` prefix — correct
- API keys stored as SHA-256 hashes, shown once — correct
- All raw SQL uses Prisma tagged template literals — SQL injection-safe
- Atomic `updateMany({ where: { assignedUserId: null } })` for lead claim — no race condition
- Bulk operations use `updateMany`/`createMany` in transactions
- MCP tools enforce `Math.min(limit, 100)` cap
- Cursor pagination consistently used on primary endpoints
- Dashboard uses raw SQL for complex aggregations — correct approach

---

## Unresolved Questions

1. Is `GET /api/v1/files/*` intentionally public? If yes, path traversal fix is mandatory; if no, add JWT auth
2. Does bank integration provider support HMAC webhook signatures? If not, IP allowlist is fallback
3. Is `poolNewFiltered` intentionally non-paginated? The 200 cap will hit with high-volume lead creation
4. What is actual `DATABASE_URL` connection pool config in production `.env`?
5. Is `import.processor.ts`'s `new PrismaClient()` intentional for worker isolation?

---

*Generated by: Security Agent + Performance Agent + Database Agent*
*Audit methodology: OWASP Top 10, N+1 detection, Prisma query analysis, PostgreSQL index coverage*
