# Code Review — Comprehensive Audit Round 4

**Date:** 2026-04-16
**Scope:** Full codebase — 153 API files, 144 frontend files, 13 package files
**Reviewers:** 3 parallel code-reviewer agents (backend, frontend, database+infra)

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| CRITICAL | 6 | |
| HIGH | 13 | |
| MEDIUM | 16 | |
| LOW | 8 | |
| **Total** | **43** | |

---

## CRITICAL (6)

### C1. Customer update IDOR — any USER can edit any customer
- **File:** `apps/api/src/modules/customers/customers.service.ts:167`
- **Issue:** `update()` calls `this.findById(id)` WITHOUT `user` arg. Role-scoping skipped.
- **Impact:** USER-role can PATCH any customer's data.
- **Fix:** `this.findById(id, user)`

### C2. Order creation bypasses lead state machine
- **File:** `apps/api/src/modules/orders/orders.service.ts:160-163`
- **Issue:** Creating order with `leadId` sets `status: 'CONVERTED'` directly, skipping ALLOWED_TRANSITIONS check. POOL/FLOATING leads jump to CONVERTED.
- **Impact:** Corrupts pipeline metrics. Managers can convert unassigned leads.
- **Fix:** Validate `lead.status === 'IN_PROGRESS'` before converting.

### C3. CSV error report formula injection
- **File:** `apps/api/src/modules/import/import.processor.ts:89-90`
- **Issue:** Error messages (containing user CSV data) written to CSV without `sanitizeCsvRow()`. Cells starting with `=+\-@` become Excel formulas.
- **Impact:** Code execution when manager opens error CSV in Excel.
- **Fix:** Apply `sanitizeCsvRow()` from `@crm/utils`.

### C4. Open redirect via login `redirect` parameter
- **File:** `apps/web/src/app/(auth)/login/page.tsx:46`
- **Issue:** `window.location.href = redirect` uses raw `searchParams.get('redirect')`. No validation it's relative.
- **Impact:** Phishing — `login?redirect=https://evil.com` redirects after valid login.
- **Fix:** Validate starts with `/` and not `//`.

### C5. SSRF via API proxy — no path validation
- **File:** `apps/web/src/app/api/proxy/[...path]/route.ts:11-12`
- **Issue:** Proxy constructs URL from user-controlled path segments. No validation for `..`, `//`, `@`.
- **Impact:** Internal service access amplification.
- **Fix:** Block path traversal characters.

### C6. Token refresh proxy loses request body on retry
- **File:** `apps/web/src/app/api/proxy/[...path]/route.ts:74-75`
- **Issue:** After 401 refresh, retry reuses consumed stream body. POST/PATCH/PUT body is empty on retry.
- **Impact:** Mutations silently lose data after token refresh.
- **Fix:** Buffer body before first request; reuse buffer on retry.

---

## HIGH (13)

### H1. Activities endpoints lack ownership check
- **File:** `apps/api/src/modules/activities/activities.controller.ts:28-74`
- **Issue:** GET/POST activities don't check USER owns the lead/customer. Any user can read timelines and add notes to others' leads.
- **Fix:** Call `findById(id, user)` before operations.

### H2. Payment amount validation missing at service level
- **File:** `apps/api/src/modules/payments/payments.service.ts:112`
- **Issue:** No `amount > 0` check in service. Controller validates, but internal callers bypass.
- **Fix:** Add `if (data.amount <= 0) throw BadRequestException`.

### H3. Customer softDelete bypasses IDOR
- **File:** `apps/api/src/modules/customers/customers.service.ts:296-302`
- **Issue:** `softDelete()` calls `findById(id)` without user. Mitigated by SUPER_ADMIN role guard.
- **Fix:** Pass user for defense-in-depth.

### H4. ReactMarkdown without sanitization
- **Files:** `call-log-list-client.tsx:163,241`, `customer-analysis-card.tsx:84`
- **Issue:** AI-generated markdown rendered without `rehype-sanitize`. Link injection possible.
- **Fix:** Add `rehype-sanitize` plugin.

### H5. CSV import bypasses proxy — direct API call
- **File:** `apps/web/src/components/import/csv-import-upload-with-job-status.tsx:40`
- **Issue:** Uses `fetch(API_BASE + endpoint)` instead of `/api/proxy/...`. Cross-origin = no cookies.
- **Fix:** Route through `/api/proxy/`.

### H6. Job polling interval never cleaned up
- **File:** `apps/web/src/components/import/csv-import-upload-with-job-status.tsx:119-140`
- **Issue:** `setInterval` in `useState` initializer — cleanup never runs. Memory leak on unmount.
- **Fix:** Move to `useEffect` with cleanup.

### H7. No global error boundary
- **File:** Missing `apps/web/src/app/error.tsx`
- **Issue:** Only `(dashboard)` layout has error boundary. Auth/root pages show raw Next.js errors.
- **Fix:** Add `app/error.tsx` and `app/(auth)/error.tsx`.

### H8. `auth/me` not handled by auth proxy
- **File:** `apps/web/src/providers/auth-provider.tsx:31`
- **Issue:** `fetch('/api/auth/me')` returns 400 ("Action không hợp lệ"). Client user hydration silently fails.
- **Fix:** Add `me` handler to auth route or route through proxy.

### H9. No FK cascade rules — orphan risk
- **File:** `packages/database/prisma/schema.prisma` (all relations)
- **Issue:** Zero `onDelete`/`onUpdate` directives. Default `Restrict` may orphan data on raw SQL ops.
- **Fix:** Audit each relation, add Cascade/SetNull/Restrict explicitly.

### H10. Payment model missing soft-delete
- **File:** `packages/database/prisma/schema.prisma:405-431`
- **Issue:** No `deletedAt` on Payment. Financial records can be hard-deleted.
- **Fix:** Add `deletedAt DateTime?`.

### H11. `.env.example` missing REDIS_PASSWORD
- **File:** `.env.example:14`
- **Issue:** `REDIS_URL` has no auth but docker-compose requires password. Dev connection fails.
- **Fix:** Add `REDIS_PASSWORD=crm_redis_dev` and update URL.

### H12. turbo.json `build` missing `db:generate` dependency
- **File:** `turbo.json:4-6`
- **Issue:** Fresh CI build may fail — PrismaClient types not generated before tsc.
- **Fix:** Add `db:generate` to build dependencies.

### H13. `buildAccessFilter(user)` pattern not implemented
- **Issue:** CLAUDE.md mandates this pattern but grep finds zero matches. Inline role checks used instead.
- **Fix:** Standardize into shared utility or update CLAUDE.md to reflect actual pattern.

---

## MEDIUM (16)

### M1. Dashboard cache key hash collisions
- **File:** `dashboard.service.ts:14-24`
- 32-bit hash → collision after ~65K keys. Users see others' cached data.

### M2. ZOOM claim logic inconsistency
- **File:** `leads.service.ts:594-600`
- Error says "POOL, ZOOM hoặc FLOATING" but WHERE clause only has POOL, FLOATING.

### M3. Import processor metadata — no prototype pollution guard
- **File:** `import.processor.ts:170-176`
- CSV headers stored as JSONB keys without `__proto__`/`constructor` filtering.

### M4. Recall config maxDaysInPool — no min/max validation
- **File:** `recall-config.controller.ts:24-32`
- Value 0 or negative would recall ALL pool leads every cron run.

### M5. 24-hour localStorage cache for entity previews
- **Files:** `entity-quick-preview-dialog.tsx:69`, `lead-inline-expand-detail.tsx:23`
- Stale data shown for up to 24 hours after edits.

### M6. No client-side file size validation on uploads
- **Files:** `csv-import-upload-with-job-status.tsx`, `payment-reconciliation-client.tsx`
- 500MB file upload attempt would exhaust browser resources.

### M7. Dashboard sub-pages unnecessarily client components
- **Files:** `dashboard/employees/page.tsx`, `dashboard/customers/page.tsx`, `dashboard/revenue/page.tsx`
- `'use client'` at top → no SSR, brief unauthenticated content flash.

### M8. `api-client.ts` never-resolving promise on 401
- **File:** `api-client.ts:30-31`
- `new Promise<never>(() => {})` — any `finally` blocks never execute.

### M9. RecallConfig.entityType is String, not EntityType enum
- **File:** `schema.prisma:707` — no DB validation.

### M10. ImportJob.type is String, not enum
- **File:** `schema.prisma:809` — accepts invalid values.

### M11. Notification.type is String, not enum
- **File:** `schema.prisma:793` — no DB validation.

### M12. Customer/Lead phone lacks uniqueness constraint
- **File:** `schema.prisma:242-309`
- By design (no dedup on manual/API), but duplicate phones cause matching confusion.

### M13. User unique constraint allows email reuse among soft-deleted
- **File:** `schema.prisma:166`
- `@@unique([email, deletedAt])` — raw index is actual guard.

### M14. getEmployeeScores: 7 correlated subqueries per user
- **File:** `dashboard.service.ts:302-354`
- 200 users × 7 = 1400 subqueries. Mitigated by cache.

### M15. getConversionTrend potential double-counting
- **File:** `dashboard.service.ts:160-166`
- Lead created+converted same day counted in both columns.

### M16. useEffect infinite loop risk in entity-quick-preview-dialog
- **File:** `entity-quick-preview-dialog.tsx:422`
- `onSelect` in deps without guaranteed stability. Currently safe but fragile.

---

## LOW (8)

- L1. Error CSV embedded quotes not escaped (import.processor.ts:90)
- L2. getConversionTrend slow with large date ranges (dashboard.service.ts)
- L3. ExportService unbounded 10K query (export.service.ts)
- L4. react-markdown not lazy-loaded (~100KB bundle)
- L5. Escape key listener always active in search-bar
- L6. API tsconfig disables noUnusedLocals/noUnusedParameters
- L7. AssignmentTemplate.strategy is String not enum
- L8. Lookup tables use isActive instead of deletedAt (by design)

---

## 28 Files Exceeding 200-Line Limit

| Lines | File |
|-------|------|
| 748 | payment-reconciliation-client.tsx |
| 518 | tasks-management-list-with-create-dialog.tsx |
| 437 | entity-quick-preview-dialog.tsx |
| 437 | lead-inline-expand-detail.tsx |
| 398 | lead-pool-table-with-bulk-assign.tsx |
| 395 | create-order-dialog.tsx |
| 302 | api-key-settings.tsx |
| 291 | lead-kanban-view-by-label.tsx |
| 281 | lead-actions.tsx |
| 275 | call-log-list-client.tsx |
| ... | +18 more files (200-270 lines) |

---

## Positive Observations

- All raw SQL uses safe tagged template literals (zero injection vectors)
- JWT refresh token rotation with reuse detection — textbook implementation
- Account lockout with extension prevention
- Transactional writes for all multi-step operations
- Race condition handling via updateMany with status guards
- Payment matching with optimistic locking
- CSV export sanitization via shared utility
- Docker ports bound to 127.0.0.1
- Comprehensive indexing strategy (50+ indexes)
- AbortController in dashboard hooks
- No dangerouslySetInnerHTML usage

## Unresolved Questions

1. `buildAccessFilter(user)` pattern in CLAUDE.md — implemented or aspirational?
2. ZOOM status not documented in CLAUDE.md lead flow
3. `raw-indexes.sql` automation in CI/CD?
4. `auth/me` endpoint — is there a separate handler not found?
5. Proxy rate limiting — NestJS sees all requests from Next.js server IP
