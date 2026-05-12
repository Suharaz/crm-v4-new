# Security Review - Full Codebase Audit (CRM v4)

**Date**: 2026-05-12 11:52 (Asia/Saigon)
**Branch**: master
**Scope**: Full audit - apps/api + apps/web + packages + Docker + nginx + CI/CD
**Method**: SAST + dependency audit + secrets scan + 3 parallel deep manual reviews
**Severity floor**: Tất cả (Critical → Info)

## Executive Summary

Audit ghi nhận **101 findings** trước khi dedupe (dedupe xong còn ~85 unique). Phân bố:

| Severity | Count (raw) | Count (deduped) | Action |
|---|---:|---:|---|
| **Critical** | 10 | 9 | Fix ngay 24-48h |
| **High** | 36 | 29 | Fix tuần này |
| **Medium** | 37 | 32 | Sprint tới |
| **Low / Info** | 18 | 15 | Backlog |
| **Total** | **101** | **85** | |

**Top risks**:
1. **MANAGER role hoàn toàn không có department scoping** - cross-cuts payment verify/reject, distribution, bulk-recall/assign, bank-tx manual-match, lead status change. 1 manager có thể impact toàn bộ dept khác.
2. **Bank webhook signature HMAC trên parsed body** (re-stringified) thay vì raw bytes - production bank API sẽ fail signature + opens canonicalization bypass.
3. **`PaymentsService.verifyManual` không validate `bankTransactionId`** - 1 bank transaction reuse được cho nhiều payment → inflate verified revenue + auto-convert lead giả.
4. **Customer list IDOR** - USER truyền `?assignedUserId=X` đè scope của `buildAccessFilter`.
5. **Activities module hoàn toàn không có ownership check** - read/write timeline + note cho mọi lead/customer.
6. **Dashboard drill-down `/employee-reports/sales-breakdown/customers` thiếu @Roles** - USER pass `userId=` xem toàn bộ KH user khác.
7. **Webhook ingest endpoint bị skip audit log** - không có forensic trail cho money flow.
8. **Next.js 15.5.14** có 14 HIGH advisories chưa patch (middleware/proxy bypass, SSRF, DoS) - patched 15.5.16+.
9. **Edge middleware không verify JWT signature** - chỉ check structure + exp.

**Strengths confirmed (không cần fix)**:
- Secrets scan PASS (0 leaks, .env chưa từng commit)
- SAST PASS (0 SQL injection raw, 0 XSS sink, 0 command injection, 0 disabled TLS)
- Auth hardening: bcrypt, JWT fail-fast, refresh rotation + reuse detection, account lockout, generic error
- buildAccessFilter pattern đúng cho 4 entity types (lead, customer, order, task)
- File upload: 3-layer path traversal protection + magic-byte + UUID
- Cookies: httpOnly + Secure (prod) + SameSite=Lax + path
- HSTS preload + Permissions-Policy
- CSV/path traversal/import: PASS
- 0 `dangerouslySetInnerHTML`, 0 `eval`, 0 `Function()` trong frontend
- Token storage: httpOnly cookie (không localStorage)

---

## Risk Matrix - Heatmap

| Domain | Critical | High | Medium | Low/Info | Note |
|---|---:|---:|---:|---:|---|
| Authorization / IDOR / RBAC | 5 | 13 | 10 | 7 | Hệ thống - MANAGER không scope |
| Business Logic / Payment / Webhook | 4 | 6 | 5 | 3 | Money flow - critical |
| Frontend / Infrastructure | 1 | 3 | 5 | 4 | Next.js + nginx hardening |
| Dependencies (pre-existing scan) | 0 | 14 | 17 | 4 | Patch via pnpm up |

---

## Critical Findings (9 deduped)

### C-1. Bank webhook HMAC trên parsed body (re-stringified)
- **Severity**: Critical (CVSS 8.6)
- **File**: `apps/api/src/modules/auth/guards/webhook-signature.guard.ts:33-40`
- **Root cause**: `JSON.stringify(request.body)` sau khi body-parser đã parse - không match raw bytes mà bank ký.
- **Impact**: Production webhook FAIL hoàn toàn HOẶC attacker biết secret có thể canonicalization bypass.
- **Fix**:
  - `NestFactory.create(AppModule, { rawBody: true })` ở `main.ts`
  - Trong guard: `createHmac('sha256', secret).update((req as any).rawBody as Buffer).digest('hex')`
- **Ref**: business-logic FIND-001, CWE-345
- **Priority**: P0

### C-2. MANAGER không có department scoping
- **Severity**: Critical (CVSS 8.1)
- **File**: `apps/api/src/common/filters/build-access-filter.ts:26-28`
- **Affected operations** (cross-cuts):
  - `payments.controller.ts:120-136` - verify, reject
  - `bank-transactions.controller.ts:82` - manualMatch
  - `distribution.controller.ts:32` - batchDistribute
  - `leads.controller.ts:158-170` - bulkRecall, bulkAssign
  - `orders.controller.ts:100-107` - updateStatus
  - `leads.service.ts:987-1003` - transfer (FLOATING/POOL leads)
  - `customers.service.ts:241-288` - transfer
  - `assignment-templates.service.ts:88-143` - applyTemplate cross-dept member
- **Impact**: Manager dept A có thể verify payment dept B, sabotage KPI dept khác, đẩy lead khỏi dept khác về kho thả nổi, đổi status lead dept khác thành LOST.
- **Fix**:
  - Extract helper `checkManagerDeptAccess(user, deptId)` (mẫu đã có trong `LeadsService.checkTransferPermission`)
  - Apply lên: `verifyManual`, `reject`, `manualMatch`, `batchDistribute`, `bulkRecall`, `bulkAssign`, `orderUpdateStatus`
  - Hoặc extend `buildAccessFilter` cho MANAGER: `{ creator: { departmentId: { in: managedDeptIds } } }`
- **Ref**: business-logic FIND-002 + idor FIND-004/005/010/011/012/013/020/023/024
- **Priority**: P0

### C-3. `verifyManual` không validate bankTransactionId
- **Severity**: Critical (CVSS 7.5)
- **File**: `apps/api/src/modules/payments/payments.service.ts:169-211`
- **Root cause**: Accept `bankTransactionId` không check (a) exists, (b) status `UNMATCHED`, (c) amount khớp, (d) không bị reuse.
- **Impact**: Manager dùng 1 bank tx duy nhất verify nhiều payment → inflate verified revenue, trigger auto-convert lead với "tiền ảo".
- **Fix**: Mirror logic từ `BankTransactionsService.manualMatch:86-115`, dùng atomic `updateMany` claim với guard `matchStatus: UNMATCHED`.
- **Ref**: business-logic FIND-003, CWE-840
- **Priority**: P0

### C-4. Webhook ingest skip audit log
- **Severity**: Critical (compliance/forensic, CVSS 6.5 nhưng impact cao)
- **File**: `apps/api/src/modules/audit-log/audit-log.constants.ts:30-42`
- **Root cause**: `/webhooks` trong `SKIP_PATH_PREFIXES` - toàn bộ row bị suppress, không chỉ body.
- **Impact**: Không có forensic trail cho money flow. Replay/fraud không trace được.
- **Fix**: Log redacted entry (giữ IP/UA/path/status, set body = `{ externalId, amount, redacted: true }`). Hoặc dedicated `bank_transaction_audit` table.
- **Ref**: business-logic FIND-004, CWE-778
- **Priority**: P0

### C-5. Customer list IDOR via query overwrite
- **Severity**: Critical (CVSS 8.1)
- **File**: `apps/api/src/modules/customers/customers.service.ts:42-51`
- **Root cause**: `buildAccessFilter` set `assignedUserId = user.id`, rồi nếu `query.assignedUserId` có giá trị, override luôn cho USER role.
- **Impact**: USER call `GET /customers?assignedUserId=X` đọc full customer của user khác.
- **Fix**:
  ```ts
  if (query.assignedUserId && user?.role !== UserRole.USER) {
    where.assignedUserId = BigInt(query.assignedUserId);
  }
  if (query.departmentId && user?.role !== UserRole.USER) {
    where.assignedDepartmentId = BigInt(query.departmentId);
  }
  ```
- **Ref**: idor FIND-001, CWE-639
- **Priority**: P0

### C-6. Dashboard drill-down thiếu @Roles
- **Severity**: Critical (CVSS 7.5)
- **File**: `apps/api/src/modules/dashboard/dashboard.controller.ts:112-141`
- **Root cause**: `GET /dashboard/employee-reports/sales-breakdown/customers` thiếu `@Roles(MANAGER, SUPER_ADMIN)`. Mọi endpoint employee-reports khác đều có guard này.
- **Impact**: USER pass `userId=X` xem toàn bộ KH (tên, SĐT, label, revenue, đơn hàng) user X. Sale A spy portfolio Sale B.
- **Fix**: Add `@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)` lên method.
- **Ref**: idor FIND-002, CWE-862
- **Priority**: P0

### C-7. Activities module không có ownership check
- **Severity**: Critical (CVSS 7.5)
- **File**: `apps/api/src/modules/activities/activities.service.ts:51-96`, `activities.controller.ts:27-74`
- **Root cause**: `getTimeline()` + `createNote()` + `getStatsByDepartment()` chỉ check entity exists, không check user có quyền xem entity.
- **Impact**:
  - **Read**: USER đọc note/call history lead/customer người khác (PII + deal info)
  - **Write**: USER ghi note giả vào lead người khác (tampering audit trail, phishing nội bộ)
  - Stats: spy hoạt động dept khác
- **Fix**:
  ```ts
  @Get('leads/:id/activities')
  async leadTimeline(@Param('id', ParseBigIntPipe) id, @CurrentUser() user) {
    await this.leadsService.findById(id, user); // throws 404 if no access
    return this.service.getTimeline('LEAD', id, ...);
  }
  ```
  Áp dụng tương tự cho customer activities.
- **Ref**: idor FIND-003 + FIND-014, CWE-285
- **Priority**: P0

### C-8. Customer/Lead transfer flaw cho manager unowned entities
- **Severity**: Critical (CVSS 7.1)
- **File**: `apps/api/src/modules/customers/customers.service.ts:241-288`, `leads.service.ts:987-1003`
- **Root cause**: `checkTransferPermission` cho phép `MANAGER + !entity.assignedUserId → return` không check dept ownership của entity.
- **Impact**: Manager dept A "cướp" lead trong kho mới (POOL/no dept) hoặc kho thả nổi vào dept A. Phá flow phân phối kế hoạch.
- **Fix**: Manager-with-no-assignee path check `managerDepartment.findUnique({ userId, departmentId: entity.departmentId })` trước khi cho transfer.
- **Ref**: idor FIND-004 + FIND-005, CWE-863
- **Priority**: P0

### C-9. Next.js 15.5.14 - middleware bypass family advisories
- **Severity**: Critical (CVSS 9.1)
- **File**: `apps/web/package.json:27` (pinned `^15.3.0` resolve `15.5.14`)
- **Root cause**: 10 advisories công bố 2026-05-06/07 cho App Router. 3 HIGH "Middleware / Proxy bypass" cùng family CVE-2025-29927. Patched line 15.5.16+.
- **Impact**: Bypass `apps/web/src/middleware.ts:26-48` auth check. Combined với `C-10` (edge middleware không verify signature), risk tăng.
- **Fix**: `pnpm up next@^15.5.16 -w && pnpm install && pnpm --filter @crm/web build && pnpm audit`
- **Ref**: frontend FIND-001 + pre-existing scan HIGH-1
- **Priority**: P0

---

## High Findings Summary (29 deduped)

### Authorization / RBAC (idor report)

| ID | File:line | Title | CVSS |
|---|---|---|---:|
| H-1 | `auth/strategies/jwt-passport.strategy.ts:26-49` | JWT access token vẫn live khi role change (refresh revoked, access still valid until TTL) | 5.4 |
| H-2 | `leads.controller.ts:115`, `customers.controller.ts:49`, `products.controller.ts:50` | Mass assignment via `@Body() Record<string, unknown>` (no DTO class) | 5.3 |
| H-3 | `customers/dto/create-customer.dto.ts:42-48` | Manager A tạo customer gán cho NV dept B (cross-dept) | 4.3 |
| H-4 | `customers.controller.ts:28-31` | `searchByPhone` không có throttle riêng (chỉ global 100/min) - đủ enumerate ~10^9 số | 5.3 |
| H-5 | `tasks.service.ts:111-152` | USER tạo task assigned cho user khác với `dueDate` quá khứ → fake escalation L1/L2 | 5.3 |
| H-6 | `customers.service.ts:95-122` | `searchByPhone` trả `status` ACTIVE/INACTIVE/FLOATING (info disclosure) | 4.3 |
| H-7 | `audit-log.service.ts` | Action `lead.transfer`, `payment.verify`, `user.role_change`, `password.change`, `apiKey.create` chưa thấy log explicit (cần verify) | 4.0 |

### Business Logic / Payment (business report)

| ID | File:line | Title | CVSS |
|---|---|---|---:|
| H-8 | `auth/guards/webhook-signature.guard.ts` | Không có replay protection (timestamp + nonce missing) | 7.5 |
| H-9 | `bank-transactions.service.ts:57-78` | TOCTOU race dedup+create (findUnique → create unguarded) | 6.5 |
| H-10 | `auth/guards/webhook-signature.guard.ts:17-24` | `WEBHOOK_SECRET` fail-open trong non-production - staging mất signature check | 7.5 |
| H-11 | `leads.controller.ts:172-206` | `claim`/`transfer`/`status`/`convert` thiếu `@Roles`. `claim` không có per-route throttle → script claim toàn bộ FLOATING | 6.5 |
| H-12 | `payment-matching.service.ts:91-141` | Auto-conversion cross-dept với fallback `BigInt(1)` cho system user attribution | 6.0 |
| H-13 | `recall-config.service.ts:144-185`, `tasks.service.ts:229` | Cron overlap khả thi (5min/1min cron + manual `runNow`, không có advisory lock) | 6.0 |

### Frontend / Infra (frontend report)

| ID | File:line | Title | CVSS |
|---|---|---|---:|
| H-14 | `app/api/auth/[...action]/route.ts:40-42`, `:71-73`, `app/api/proxy/[...path]/route.ts:82-84` | `SameSite=Lax` cho refresh_token - CSRF defense-in-depth gap | 7.4 |
| H-15 | `apps/web/src/middleware.ts:9-20, 26-48` | Edge middleware không verify JWT signature (structure-only check) | 7.5 |
| H-16 | `nginx/proxy-host.conf:1-35` | nginx thiếu rate limit (chỉ rely NestJS Throttler in-app) | 5.3 |

### Dependencies (pre-existing scan)

| ID | Package | Fix |
|---|---|---|
| H-17 | `next` 15.5.14 (đã cover ở C-9) | `pnpm up next@^15.5.16 -w` |
| H-18 | `hono` 4.12.12 (transitive via MCP SDK) | pnpm overrides `>=4.12.18` |
| H-19 | `vite` 8.0.4 (transitive via vitest) | pnpm up vitest hoặc overrides |
| H-20 | `fast-uri` <=3.1.1 (transitive via @nestjs/cli) | overrides `>=3.1.2` |
| H-21 | `picomatch` 4.0.0-4.0.3 (ReDoS) | overrides `>=4.0.4` |
| H-22 | `effect` <3.20.0 (Prisma transitive) | wait upstream hoặc overrides |
| H-23 | Next.js DoS Server Components (multiple) | cover bởi C-9 |
| H-24 | Next.js SSRF | cover bởi C-9 |
| H-25 | Next.js Middleware/Proxy bypass App Router | cover bởi C-9 |
| H-26 | Next.js Middleware/Proxy bypass Pages | cover bởi C-9 |
| H-27 | Next.js DoS via connection (Server Action) | cover bởi C-9 |
| H-28 | Next.js Image Optimization DoS | cover bởi C-9 |
| H-29 | Next.js cache poisoning RSC | cover bởi C-9 |

---

## Medium Findings Summary (32 deduped)

| Category | Examples | Action |
|---|---|---|
| **RBAC gaps** | M-1 `/customers/:id/analyze` thiếu @Roles + ownership; M-2 distribution config/scores leak cross-dept; M-3 assignment templates cross-dept members; M-4 task assignedTo change bypass; M-5 export endpoints không log audit row count; M-6 notification error message reveal | Add guards, validate dept |
| **Money / Order logic** | M-7 `Number(Decimal)` coercion edge case; M-8 Order amount vs product.price không check; M-9 REFUNDED orphan VERIFIED payments; M-10 `applyTemplate` bypass maxLeads capacity | Switch to `Prisma.Decimal.gte()`, add validations |
| **API key** | M-11 `@ApiKeyAuth()` no scope arg → no permission enforcement on webhook + 3rd-party; M-12 fire-and-forget `lastUsedAt` swallow errors | Require scope at every call site |
| **Frontend** | M-13 Auth proxy không validate refreshToken format; M-14 CSP chưa set (`contentSecurityPolicy: false` ở helmet + Next.js không thêm); M-15 `CsvExportButton` dùng `NEXT_PUBLIC_API_URL` → mất Auth header → 401; M-16 Docker thiếu mem_limit + redis prod thiếu maxmemory | Add CSP, sửa proxy CSV, resource limits |
| **Bank-tx / Order race** | M-17 bank-transactions manualMatch không scope dept | Same fix as C-2 |
| **Dependencies moderate** | 17 moderate (Next.js XSS, hono JSX injection, vite, postcss, etc.) | `pnpm up --latest` + overrides |

---

## Low / Info Findings (15 deduped)

| ID | Severity | Title |
|---|---|---|
| L-1 | Low | `Math.random()` trong dummy password tại `recall-config.service.ts:429` (INACTIVE user, không exploit) - thay `crypto.randomBytes(32).toString('hex')` |
| L-2 | Low | ThirdPartyApi `POST /external/leads` không validate `sourceId` cùng dept - tạo fake source ô nhiễm DB |
| L-3 | Low | Audit log read trả full PII cho SA (acceptable nhưng flag GDPR) |
| L-4 | Low | API key `lastUsedAt` update swallow error → DB-down condition hide |
| L-5 | Low | PG/Redis port có thể accidental 0.0.0.0 bind nếu admin sửa compose template |
| L-6 | Low | `.env.production` không `chmod 600` - world-readable trên shared VPS |
| L-7 | Low | GitHub Actions `git reset --hard` không stash local changes |
| L-8 | Info | Next.js Dockerfile không set non-root USER |
| L-9 | Info | MCP/AI agent endpoints `@Public()` skip JWT dùng API key - correct pattern |
| L-10 | Info | JWT validates role/dept/status từ DB mỗi request (không stale) |
| L-11 | Low | Export endpoints không log audit action với row count |
| L-12 | Low | System-settings PUT không scope theo key category (cần verify whitelist trong service) |
| L-13 | Info | webhook signature guard giả định JSON content-type - không explicit reject form-encoded |
| L-14 | Low | Dependencies low: hono JWT NumericDate, next cache-poisoning via collisions/redirect cache |
| L-15 | Low | `payments.service.list` USER scope `order.createdBy = user.id` OK, MANAGER unscoped (by design) - flag audit log với row count |

---

## Cross-Cutting Themes

### Theme A: MANAGER không có dept scoping (highest impact)

**Pattern**: `buildAccessFilter` chỉ scope USER role. MANAGER + SUPER_ADMIN cùng có filter `{}` → manager dept A có quyền cross-dept trên hầu hết flows.

**Affected modules**:
- `payments` (verify, reject)
- `bank-transactions` (manualMatch)
- `distribution` (config, scores, batchDistribute)
- `assignment-templates` (applyTemplate cross-dept members)
- `leads` (bulkRecall, bulkAssign, status change, transfer FLOATING/POOL)
- `customers` (transfer unowned)
- `orders` (updateStatus)

**Solution** (single fix touches all):
1. Tạo helper `checkManagerDeptAccess(user, targetDeptId): Promise<boolean>` trong common (mẫu trong `LeadsService:987-1003`)
2. Extend `buildAccessFilter` accept entity kind + manager mode → trả về `{ creator: { departmentId: { in: managedDeptIds } } }` cho relevant entities
3. Apply guard ở tất cả services trên

**Estimated effort**: 8-12h dev + 4h test

### Theme B: Webhook chain integrity

**Findings ràng buộc**: C-1 (raw body) + C-3 (verifyManual reuse) + C-4 (audit skip) + H-8 (replay) + H-9 (TOCTOU) + H-10 (fail-open) + M-11 (api-key scope)

**Solution** (làm cùng nhau):
1. Register `rawBody: true` ở NestFactory
2. Guard read `req.rawBody` Buffer cho HMAC
3. Add timestamp + nonce vào signature scheme
4. Wrap ingest trong `$transaction` với atomic claim
5. Fail-closed `WEBHOOK_SECRET` (boot-time fatal)
6. Log redacted audit entry (giữ IP/UA/path/status)
7. Require `@ApiKeyAuth('bank:webhook')` scope explicit
8. `verifyManual` mirror manualMatch state guards

**Estimated effort**: 16-20h dev + 8h test (integration + replay attack simulation)

### Theme C: buildAccessFilter coverage gaps

**Modules KHÔNG dùng buildAccessFilter**:
- ❌ `activities` (Critical - FIND-003)
- ❌ `payments` (chỉ check `order.createdBy = user.id` cho USER)
- ❌ `call-logs` (controller-level filter cho USER, không có helper)
- `notifications` (self-scope userId OK)
- `search` (inline scope OK)
- `dashboard` (inline scope OK nhưng có gap FIND-002)

**Solution**: Migrate `activities`, `payments`, `call-logs` sang `buildAccessFilter` pattern.

### Theme D: Frontend defense gaps

**Findings**: C-9 (Next.js) + H-15 (middleware sig) + M-14 (CSP) + H-14 (SameSite=Lax) + H-16 (nginx rate-limit)

**Solution**: Update Next.js + add CSP + nginx hardening cùng deploy cycle.

---

## Remediation Roadmap

### P0 - Fix trong 24-48h (Critical, money flow + IDOR)

1. **C-9** Update Next.js: `pnpm up next@^15.5.16 -w && pnpm audit`
2. **C-1 + C-3 + C-4 + H-8 + H-9 + H-10 + M-11** Webhook chain rewrite (Theme B)
3. **C-2** MANAGER dept scoping helper + apply (Theme A)
4. **C-5** Customer list IDOR (5 dòng code fix)
5. **C-6** Dashboard `@Roles` decorator (1 dòng)
6. **C-7** Activities ownership check (3 endpoints)
7. **C-8** Customer/Lead transfer manager-unowned check (2 services)

**Estimated**: 24-32h dev

### P1 - Fix trong 1 tuần (High)

8. **H-2** Replace `@Body() Record<string, unknown>` bằng DTO classes (leads, customers, products)
9. **H-4** Add `@Throttle({ default: { ttl: 60000, limit: 10 } })` cho `/customers/search`
10. **H-5** Tasks service: USER cannot set assignedTo khác mình
11. **H-11** Add per-route throttle `/leads/:id/claim` + `@Roles` cho status/convert
12. **H-13** Add Postgres advisory lock cho cron + manual runNow
13. **H-14** `SameSite=Strict` cho refresh_token (test top-level nav)
14. **H-16** nginx `limit_req_zone` cho `/api/v1/auth/login` + `/api/`
15. **H-18 đến H-22** pnpm overrides cho transitive deps

**Estimated**: 16-20h dev

### P2 - Fix trong sprint tới (Medium)

16. M-7 Decimal arithmetic thay vì Number coercion
17. M-8 Order amount validation vs product.price
18. M-9 REFUNDED payment refundedAt flag
19. M-10 applyTemplate respect EmployeeLevel.maxLeads
20. M-13 Auth proxy validate refreshToken format
21. M-14 Add CSP header tại next.config.ts
22. M-15 Sửa CsvExportButton → /api/proxy/exports/*
23. M-16 Docker resource limits + Redis maxmemory prod
24. 17 moderate deps via pnpm up

**Estimated**: 20-24h dev

### P3 - Backlog (Low/Info)

25. L-1 Replace Math.random() bằng crypto.randomBytes
26. L-6 chmod 600 .env.production
27. L-7 git stash trước reset --hard
28. L-8 Non-root USER trong Next.js Dockerfile
29. L-11 Export audit log với row count
30. L-15 Audit log coverage gap (lead.transfer, payment.verify, role.change)

**Estimated**: 8-12h dev

---

## Strengths Confirmed (không cần action)

- **Secrets**: 0 leaks, `.env` chưa từng commit, redact request log đúng pattern, mask AI API key ở system-settings GET/PUT
- **SAST**: 0 SQL injection (mọi `$queryRaw` dùng tagged template), 0 `$queryRawUnsafe`, 0 XSS sink (`dangerouslySetInnerHTML`/`innerHTML`/`eval`/`Function`/`document.write` trong frontend), 0 command injection, 0 `rejectUnauthorized: false`
- **Auth**: bcrypt password hash, JWT `getOrThrow('JWT_SECRET')` fail-fast, refresh token SHA-256 hash + rotation + reuse detection, account lockout 5 fail → 15 phút, generic error message chống user enumeration, HMAC `timingSafeEqual` cho webhook signature (logic đúng, vấn đề ở input data)
- **File upload**: 3-layer path traversal (whitelist regex + `path.resolve` startsWith + UUID), MIME allowlist + magic-byte validation qua `file-type`, 10MB size limit consistent
- **Cookies**: httpOnly + Secure (prod) + SameSite=Lax (acceptable) + Path=/ + maxAge
- **CORS**: Required `FRONTEND_URL` in prod (throw error nếu thiếu), credentials: true với origin lock
- **Helmet**: HSTS 1y + includeSubDomains + preload
- **Validation**: Global `ValidationPipe` với `whitelist: true` + `forbidNonWhitelisted: true` + `transform: true`
- **JWT staleness**: Validates DB role/dept/status mỗi request (không cache) - role change reflect sau cleanup access TTL
- **Frontend token storage**: httpOnly cookie only, localStorage chỉ chứa UI prefs (verified by grep)
- **Login redirect sanitize**: `sanitizeRedirect()` reject `//`, protocol, absolute URLs
- **Permissions-Policy**: Disable camera/mic/geo

---

## Sub-Reports Cross-Reference

| Domain | Report | Findings |
|---|---|---|
| Pre-existing automated scan | `plans/reports/security-scan-260512-1110-crm-v4-full.md` | 34 deps + 1 SAST low |
| IDOR / RBAC deep | `plans/reports/security-idor-rbac-260512-1152-deep-audit.md` | 35 (5C/13H/10M/7L) |
| Business Logic / Payment | `plans/reports/security-business-logic-260512-1152-deep-audit.md` | 18 (4C/6H/5M/3L) |
| Frontend / Infrastructure | `plans/reports/security-frontend-infra-260512-1152-deep-audit.md` | 13 (1C/3H/5M/4L) |
| Previous audit baseline | `docs/security-audit.md` (2026-04-29) | 4 fixed (system-settings + import) |

---

## Unresolved Questions

1. **MANAGER scoping semantic**: CLAUDE.md ghi "Manager+ sees everything" nhưng nhiều finding gợi ý manager nên scope dept khi mutate. PM decide hard rule.
2. **Bank API vendor**: Bank Vietnam nào (VietQR/BIDV/MB/VCB)? Spec quyết định exact signature scheme (raw body + headers vs JSON canonical) - không finalize C-1 fix được nếu thiếu.
3. **System user ID hardcoded `BigInt(1)`** trong `payment-matching.service.ts:133` - seed guarantee? Hay implement `_getSystemUserId` pattern từ recall-config.
4. **Refund flow**: Order REFUNDED nhưng không có `Payment.refundedAt` field. Phase 2 implement?
5. **Audit retention 60d**: Có hợp legal VN cho financial records (10 năm theo accounting law)? Confirm với compliance.
6. **`bank_transactions` table prune**: Không có cron prune - externalId idempotency window forever (tốt cho replay defense nhưng tốn storage).
7. **Edge middleware → Node runtime**: Migrate để verify JWT signature đúng? Trade-off ~50ms latency.
8. **CSP script-src**: Có third-party script (GA, Sentry)? Cần whitelist.
9. **Manager A tạo customer gán NV dept B**: Spec rule unclear (H-3).
10. **`/customers/search` rate limit**: 10/min vs 100/min - UX vs anti-enumeration trade-off.
11. **bcrypt cost gap**: CLAUDE.md docs ghi 12, code dùng default 10. Update code hay sửa docs?
12. **Activity log scope cho manager**: Manager thấy được note của dept khác? Spec quyết.
13. **Audit log action coverage**: Cần grep `auditLogService.create(` để confirm có log cho `lead.transfer`, `payment.verify`, `user.role_change`, `password.change`, `apiKey.create`. Out of scope audit này.
14. **Deploy method**: Docker (Dockerfile) hay PM2 + bare-metal (ecosystem.config.cjs)? Quyết L-8.

---

## Quick Win Checklist (1-line fixes)

Có thể áp dụng ngay không cần kiến trúc lớn:

- [ ] `apps/web/package.json`: bump `next` `^15.3.0` → `^15.5.16`
- [ ] `apps/api/src/modules/customers/customers.service.ts:42-51`: add USER role check trước khi override
- [ ] `apps/api/src/modules/dashboard/dashboard.controller.ts:112`: add `@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)`
- [ ] `apps/api/src/modules/customers/customers.controller.ts:28`: add `@Throttle({ default: { ttl: 60000, limit: 10 } })`
- [ ] `apps/api/src/modules/leads/leads.controller.ts:172`: add `@Throttle({ default: { ttl: 1000, limit: 1 } })` cho claim
- [ ] `scripts/deploy.sh` + `setup.sh`: thêm `chmod 600 "$ENV_FILE"` sau create
- [ ] `apps/web/next.config.ts`: add CSP header
- [ ] `apps/api/src/modules/recall-config/recall-config.service.ts:429`: replace `Math.random()` bằng `crypto.randomBytes(32).toString('hex')`
- [ ] `apps/api/src/modules/auth/guards/webhook-signature.guard.ts:17-24`: bỏ fail-open dev path, treat absence as fatal config error
- [ ] Add `pnpm.overrides` block cho transitive deps trong root `package.json`

---

## Status

**Status:** DONE

**Summary:** 101 findings (deduped 85). 9 Critical, 29 High, 32 Medium, 15 Low/Info. Themes chính: (a) MANAGER không có dept scoping cross-cuts payment+distribution+leads+customers+orders, (b) Webhook chain integrity (signature raw-body + replay + audit + verifyManual reuse), (c) buildAccessFilter incomplete cho activities/payments/call-logs, (d) Frontend defense gap (Next.js outdated + CSP missing + edge middleware no signature verify). Auth hardening + SAST + secrets scan PASS.

**Top 3 P0 fix priority**:
1. Update Next.js 15.5.16+ (1 command, fix 14 HIGH advisories)
2. Webhook chain rewrite (raw body + replay protection + audit log + verifyManual atomic claim)
3. MANAGER dept scoping helper + apply across 8 modules

**Concerns**: Production bank webhook integration sẽ FAIL với current signature implementation (FIND-001) - cần test với staging trước go-live.

**Reports path**: `F:/Vibe Coding/crm-v4/plans/reports/security-review-260512-1152-full-audit.md`
