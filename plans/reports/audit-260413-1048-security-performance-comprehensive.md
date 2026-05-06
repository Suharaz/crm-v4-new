# VeloCRM Comprehensive Security & Performance Audit

**Date:** 2026-04-13 | **Branch:** `audit/security-performance-260413`
**Scope:** 328 TypeScript files across apps/api, apps/web, packages/*
**Prior audit:** 04/12 - 51 findings, 40+ remediated

## Summary

| Severity | Security | Performance | Total |
|----------|----------|-------------|-------|
| Critical | 0 | 1 | **1** |
| High | 7 | 5 | **12** |
| Medium | 10 | 6 | **16** |
| Low | 5 | 4 | **9** |
| **Total new** | **22** | **16** | **38** |
| Verified fixed | 27 | 17 | **44** |

---

## CRITICAL (1)

### CRIT-1. Distribution batchDistribute: N+1 loop (~800 queries/batch)
- **File:** `apps/api/src/modules/distribution/distribution.service.ts:64-68`
- **Type:** PERFORMANCE
- **Description:** `batchDistribute` calls `distributeLead()` sequentially per lead. Each call runs `scoreUsers()` (4-5 queries) + 3 writes. 100 leads = ~800 DB round-trips.
- **Impact:** 10-30s response time per batch. Blocks distribution workflow.
- **Fix:** Compute scores once before loop, round-robin assign, batch writes via `updateMany`/`createMany`.

---

## HIGH (12)

### Security HIGH (7)

| ID | Finding | File | Risk |
|----|---------|------|------|
| H1 | Pool dept endpoint - no role/dept check | leads.controller.ts:45-51 | Cross-dept data leak |
| H2 | Pool floating - all users see all (by design?) | leads.controller.ts:54-56 | Verify business intent |
| H3 | Payments list - no role scoping | payments.controller.ts:46-48 | Financial data exposure |
| H4 | Payments findById - no ownership check | payments.service.ts:85-91 | Direct financial access |
| H5 | Payments create - no order ownership check | payments.controller.ts:101-116 | Fake payment injection |
| H6 | Lead/Customer update - `Record<string,unknown>` body | leads/customers controller | No DTO validation |
| H7 | Lead update calls findById without user context | leads.service.ts:325-326 | IDOR bypass - any user can update any lead |

### Performance HIGH (5)

| ID | Finding | File | Impact |
|----|---------|------|--------|
| PH1 | Lead assign/transfer - non-atomic, no $transaction | leads.service.ts:414-463 | Race condition on concurrent assign |
| PH2 | Export loads 10K records into memory | export.service.ts:16-27 | OOM risk on VPS |
| PH3 | Payments exportVerified - no take limit at all | payments.service.ts:213-215 | Full table scan + OOM |
| PH4 | Payment import - sequential per-row (2000+ queries/500 rows) | payment-import.service.ts:153-159 | Minutes-long import |
| PH5 | Tasks processReminders - N+1 manager lookup per task | tasks.service.ts:191-211 | Slow cron at scale |

---

## MEDIUM (16)

### Security MEDIUM (10)

| ID | Finding | File |
|----|---------|------|
| M1 | Webhook guard silently passes when secret missing | webhook-signature.guard.ts:16 |
| M2 | Docker Compose hardcoded DB password | docker-compose.yml:10 |
| M3 | Redis no authentication in docker-compose | docker-compose.yml:44 |
| M4 | No startup env validation for JWT_SECRET, DATABASE_URL | main.ts |
| M5 | MCP/AI Agent endpoints - no data scoping | mcp-agent-query.service.ts |
| M6 | Order creation - no DTO validation | orders.controller.ts:79-98 |
| M7 | Task creation - unvalidated priority/entityType enums | tasks.service.ts:43-57 |
| M8 | Tasks - no ownership check on complete/cancel/update | tasks.service.ts:60-112 |
| M9 | Import processor - N+1 dedup query per row | import.processor.ts:155-158 |
| M10 | Label attach/detach - no ownership guard | leads/customers controller |

### Performance MEDIUM (6)

| ID | Finding | File |
|----|---------|------|
| PM1 | poolNewFiltered - 4 sequential queries | leads.service.ts:133-203 |
| PM2 | No caching on list endpoints (leads/customers/orders) | various services |
| PM3 | Missing composite index: orders(status, created_at) | schema.prisma |
| PM4 | Missing composite index: payments(order_id, status) | schema.prisma |
| PM5 | LEAD_SELECT overfetch - includes orders+payments on lists | leads.service.ts:30-38 |
| PM6 | Dashboard chart not lazy-loaded (recharts ~200KB) | dashboard/page.tsx |

---

## LOW (9)

| ID | Type | Finding | File |
|----|------|---------|------|
| L1 | SEC | Password complexity - length only | login-credentials.dto.ts |
| L2 | SEC | .env.example contains placeholder JWT_SECRET | .env.example |
| L3 | SEC | Import error CSV not sanitized | import.processor.ts:83-88 |
| L4 | SEC | BigInt comparison with !== on notification userId | notifications.service.ts:32 |
| L5 | SEC | Export 10K cap without streaming | export.service.ts |
| PL1 | PERF | Redis KEYS command in delByPrefix (O(N)) | cache.service.ts:78 |
| PL2 | PERF | Customer findById loads 50 leads + 50 orders | customers.service.ts:119 |
| PL3 | PERF | Cache key djb2 hash collision risk | dashboard.service.ts:14-24 |
| PL4 | PERF | MCP query service duplicates main service logic | mcp-agent-query.service.ts |

---

## Verified Controls (44)

### Security (27)
Helmet headers, IDOR on leads/customers/orders, webhook HMAC, payment race condition (optimistic lock), path traversal fix, file magic bytes, MCP rate limit, JWT refresh rotation, token revocation on password/role change, account lockout (5/15min), bcrypt cost 12, global validation pipe, cookie security (httpOnly/Secure/SameSite), no localStorage tokens, no dangerouslySetInnerHTML, CSV sanitization, Pino field redaction, CORS production enforcement, user deactivation cascade, raw SQL tagged templates, metadata size validation, API key hashing, atomic lead claim.

### Performance (17)
Scoring batch queries (6000→4), dashboard caching (30s TTL), lookup table caching (10min TTL), cache fail-open, BigInt cache serialization, 1MB payload guard, Redis maxmemory 128MB, connection pool 20/10s, recall chunking (500/batch), bulk assign/recall, claim atomicity, partial indexes (20+), trigram indexes, cursor pagination, search with trigram GIN, activity timeline bounded (500), notification cleanup cron.

---

## Remediation Priority

### Phase 1 - Critical + High Security (est. 4h)
1. **H7** Lead update IDOR bypass - pass user to findById ⚡ one-line fix
2. **H3/H4** Payment list+detail role scoping
3. **H5** Payment create order ownership check
4. **H1** Pool department role/dept check
5. **M8** Task ownership checks
6. **H6** Create UpdateLeadDto + UpdateCustomerDto
7. **M10** Label attach ownership

### Phase 2 - Critical + High Performance (est. 6h)
1. **CRIT-1** Distribution batchDistribute - batch scoring + writes
2. **PH1** Lead assign - wrap in $transaction
3. **PH3** Payment exportVerified - add take limit + date filter
4. **PH4** Payment import - pre-load products, batch processing
5. **PH5** Task reminders - pre-load managers by dept
6. **PM3/PM4** Add missing composite indexes

### Phase 3 - Medium Priority (est. 4h)
- M1 webhook guard fail-closed, M4 env validation, M6/M7 DTOs, PM5 LEAD_LIST_SELECT, PM6 dashboard lazy-load

---

## Unresolved Questions
1. H2 - Is floating pool visible to ALL users intentional? (CLAUDE.md says yes)
2. Has `raw-indexes.sql` been applied to production DB?
3. Are cron jobs (processReminders, autoRecall) monitored for failures?
