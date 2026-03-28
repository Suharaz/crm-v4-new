# Full Project Audit — CRM V4 Gap Analysis

**Date:** 2026-03-28
**Scan scope:** Backend (28 modules), Frontend (25 pages, 70+ components), Packages (3), Infra
**All 18 phases marked COMPLETE — actual completeness below**

---

## SEVERITY LEGEND
- **CRITICAL** — Blocks production deploy or causes runtime errors
- **HIGH** — Major feature/quality gap, must fix before production
- **MEDIUM** — Noticeable UX/DX issue, fix soon
- **LOW** — Nice to have, can defer

---

## 1. CRITICAL ISSUES (3)

### 1.1 Zero Test Coverage
- No `.spec.ts` files in entire backend
- No test files in frontend
- M5 gate requires >80% service coverage
- **Effort:** 8-12h

### 1.2 Missing @Roles/@Public Decorators (~65% endpoints)
- Most GET/POST/PATCH/DELETE endpoints lack role-based guards
- Only ~35% of endpoints have explicit @Roles or @Public
- Security risk: any authenticated user can hit any endpoint
- **Effort:** 2-4h

### 1.3 No Form Validation (Frontend)
- Zod is in dependencies but zero schemas implemented
- All forms accept any input without client-side validation
- Phone, email, required fields — no validation before submit
- **Effort:** 3-4h

---

## 2. HIGH ISSUES (5)

### 2.1 No Error Boundaries (Frontend)
- No `error.tsx` in any route
- Runtime errors crash entire page
- **Effort:** 1h

### 2.2 Silent API Error Handling (Frontend)
- Pages use `} catch { }` — empty catch blocks
- Users see empty data instead of error messages
- **Effort:** 1-2h

### 2.3 API Port Inconsistency
- `api-client.ts` fallback: port 3001
- `csv-import-upload.tsx`: port 3010
- `.env.example`: port 3010
- **Effort:** 15min

### 2.4 Manager Department Permission TODO
- `customers.service.ts:233` — `// TODO: check managed depts`
- Managers have blanket transfer permission without dept scoping
- Same issue likely in leads.service.ts
- **Effort:** 1h

### 2.5 PrismaClient Anti-pattern in Activities Controller
- `activities.controller.ts:57-77` — creates standalone PrismaClient via `require()`
- Bypasses DI, creates extra connections, untestable
- **Effort:** 30min

---

## 3. MEDIUM ISSUES (8)

### 3.1 Incomplete @crm/types Package
- Only 3 generic types (BigIntString, ApiResponse, ApiErrorResponse)
- No shared DTOs — API has 9 DTOs scattered, web has zero
- Web never imports from @crm/types or @crm/utils
- **Effort:** 4-6h (but can defer — works without it)

### 3.2 No Prisma Migrations Directory
- Using `db push` only — no migration history tracking
- Risky for production schema evolution
- **Effort:** 1h to init

### 3.3 Redis Config Mismatch
- app.module.ts expects REDIS_HOST + REDIS_PORT
- .env only has REDIS_URL
- Currently works via localhost fallback
- **Effort:** 15min

### 3.4 Tables Not Mobile Responsive
- Leads, customers, orders, users tables — desktop layout only
- `overflow-x-auto` but still cramped on mobile
- Spec says "Mobile card view" per design-guidelines.md
- **Effort:** 4-6h

### 3.5 Missing Page Loading Skeletons
- DataTableSkeleton component exists but unused
- No Suspense boundaries, no loading.tsx files
- Flash of empty content while fetching
- **Effort:** 2h

### 3.6 Cron Jobs Missing Try-Catch
- `tasks.service.ts` processReminders() — no error handling
- `recall-config.service.ts` runAutoRecall() — similar
- Silent failures if notification creation errors
- **Effort:** 30min

### 3.7 Missing Orders Create Page
- Orders only created from customer detail (dialog)
- No standalone `/orders/new` route
- **Effort:** 1-2h

### 3.8 Unused DataTableSkeleton + Missing Tooltip/Drawer Components
- Created component never used
- Missing shadcn: Drawer (mobile nav), Tooltip, Popover
- **Effort:** 1h

---

## 4. LOW ISSUES (5)

### 4.1 API Key Auth Not Implemented
- `call-logs.controller.ts` — "API key auth - simplified to Public for now"
- Third-party endpoints should use API key validation
- **Effort:** 1h

### 4.2 Bank Transaction No Amount Validation
- `bank-transactions.service.ts` — no check amount > 0
- **Effort:** 15min

### 4.3 Call Log Manual Match No Duplicate Protection
- `call-logs.service.ts:134` — manualMatch() doesn't check already matched
- **Effort:** 15min

### 4.4 Missing .env.example Per App
- Only root-level .env.example exists
- No app-specific env documentation
- **Effort:** 15min

### 4.5 Roadmap Changelog Section Outdated
- `docs/project-roadmap.md` changelog only mentions 2026-03-27
- Missing phases 15-18 updates
- **Effort:** 15min

---

## SCORECARD

| Area | Score | Notes |
|------|-------|-------|
| Backend API | 85% | All endpoints exist, missing guards + tests |
| Frontend Pages | 90% | All 25 pages done, missing validation + error handling |
| Frontend UX | 70% | Desktop good, mobile needs work, no skeletons |
| Shared Packages | 40% | Types package nearly empty, utils unused by web |
| Testing | 0% | Zero tests anywhere |
| Security | 65% | Auth works, but RBAC decorators incomplete |
| Infrastructure | 80% | Docker/build works, env inconsistencies |
| Documentation | 85% | Good docs, changelog slightly behind |
| **Overall** | **~72%** | Production-ready after fixing CRITICAL + HIGH |

---

## RECOMMENDED FIX ORDER

1. **@Roles decorators** (2-4h) — security critical
2. **API port fix** (15min) — quick win
3. **Manager dept permission** (1h) — business logic gap
4. **PrismaClient anti-pattern** (30min) — code quality
5. **Error boundaries + API error handling** (2h) — UX critical
6. **Form validation with Zod** (3-4h) — data quality
7. **Cron error handling** (30min) — reliability
8. **Redis config + env fixes** (30min) — infra
9. **Mobile responsive tables** (4-6h) — UX
10. **Loading skeletons** (2h) — UX polish
11. **Test suite** (8-12h) — quality gate
12. **Docs/roadmap update** (30min) — housekeeping

**Total estimated effort: ~25-35h to production-ready**

---

## UNRESOLVED QUESTIONS

1. Is `orders/[id]` intentionally read-only?
2. Should Prisma migrations be initialized now or at first deploy?
3. Priority: mobile responsive vs test coverage first?
4. Should @crm/types be populated now or deferred?
