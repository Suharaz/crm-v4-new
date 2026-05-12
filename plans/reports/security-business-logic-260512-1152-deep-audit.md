# Deep Security Audit - Business Logic, Money Integrity, Webhook Security

**Date:** 2026-05-12 11:52
**Scope:** Bank webhook, payment integrity, order logic, lead transfer/distribution, audit log, cron jobs, API keys, notifications
**Method:** Manual code-review (no execution)
**Reviewer:** code-reviewer subagent
**Out of scope (covered separately):** SAST / dependency scan / auth hardening - see `security-scan-260512-1110-crm-v4-full.md`

---

## Executive Summary

Found **18 findings**: 4 Critical, 6 High, 5 Medium, 3 Low/Info.

Hotspots:
- **Bank webhook signature** verifies against RE-stringified body, not raw bytes. Any bank that signs raw HTTP body will fail. Worse: opens path for signature bypass via key reordering / canonical-form mismatch.
- **MANAGER role has NO department scoping** for payment verify, payment reject, distribution config, recall config, audit log read. Any MANAGER can verify any payment from any department.
- **`verifyManual` doesn't validate the supplied `bankTransactionId`** - manager can link an arbitrary already-matched bank tx to a payment, double-counting funds.
- **Webhooks bypass audit log** (`/webhooks` is in `SKIP_PATH_PREFIXES`). Bank transaction ingest + matching has zero audit trail of who/what called it.
- **`Number()` coercion of Decimal** in payment conversion trigger can silently truncate precision for amounts >2^53, but Decimal(12,2) max is 9,999,999,999.99 < 2^53 → not exploitable today; flag for future.
- **No raw-body middleware** registered (`main.ts` only mounts `helmet`). Combined with the signature flaw, raw-body webhook verification is structurally impossible.

---

## CRITICAL

### FIND-001 - Bank webhook signature verifies re-stringified parsed body, not raw bytes
- **Severity:** Critical, CVSS 8.6 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N)
- **File:** `apps/api/src/modules/auth/guards/webhook-signature.guard.ts:33-40`
- **Description:**
  ```ts
  const rawBody = JSON.stringify(request.body);
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  ```
  `request.body` is the JSON-parsed object produced by Express's `body-parser`. Re-`JSON.stringify`-ing it does NOT reproduce the bytes the sender signed: key order can differ, whitespace is dropped, non-ASCII is re-escaped, numeric precision can shift, etc. Industry convention (Stripe, Twilio, GitHub, VietQR providers) is to sign **the raw HTTP body bytes**.
- **Impact:**
  1. Real bank webhooks will likely fail signature verify because their HMAC is over the raw bytes, not over Node's reserialized output.
  2. Attacker who learns the secret can craft a payload whose `JSON.stringify` output matches the signed value but with reordered or normalized keys - smuggling fields past upstream input filters.
  3. If body-parser ever strips fields (e.g. limit, content-encoding gunzip), the re-stringified value diverges from sender's.
  No `main.ts` registers `raw` body middleware (`apps/api/src/main.ts` only mounts `helmet`), so the raw body is unrecoverable at the guard layer.
- **Remediation:**
  - Register raw-body capture before the JSON parser:
    ```ts
    const app = await NestFactory.create(AppModule, { rawBody: true });
    ```
  - In the guard, read `req.rawBody` (Buffer) and HMAC over it directly:
    ```ts
    const raw = (request as any).rawBody as Buffer;
    if (!raw) throw new UnauthorizedException(...);
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    ```
  - Apply raw-body capture only to `/webhooks/*` routes to avoid breaking regular endpoints.
- **References:** CWE-345 Insufficient Verification of Data Authenticity, OWASP API8:2023 Security Misconfiguration

### FIND-002 - MANAGER role has no department scoping for sensitive money operations
- **Severity:** Critical, CVSS 8.1 (AV:N/AC:L/PR:H/UI:N/S:U/C:H/I:H/A:N)
- **Files:**
  - `apps/api/src/common/filters/build-access-filter.ts:26-28`
  - `apps/api/src/modules/payments/payments.controller.ts:120-136` (`verify`, `reject`)
  - `apps/api/src/modules/distribution/distribution.controller.ts:9` (controller-level `@Roles(SUPER_ADMIN, MANAGER)`)
  - `apps/api/src/modules/recall-config/recall-config.controller.ts:9-11` (SA only - OK)
  - `apps/api/src/modules/audit-log/audit-log.controller.ts:9` (SA only - OK)
- **Description:** `buildAccessFilter` returns `{}` (no scoping) for both SUPER_ADMIN and MANAGER. Only USER role is scoped. Combined with controller guards that say `@Roles(MANAGER, SUPER_ADMIN)`, any MANAGER from Dept A can:
  - Verify payments belonging to orders created by users in Dept B (`POST /payments/:id/verify` in `payments.controller.ts:120`).
  - Reject payments cross-department (`POST /payments/:id/reject` in `payments.controller.ts:131`).
  - View bank transactions and manually match payments cross-department (`bank-transactions.controller.ts:82` `manualMatch`).
  - Trigger batch distribution for any department (`distribution.controller.ts:32` `batchDistribute`).
  - Bulk recall leads they don't manage (`leads.controller.ts:158` `bulkRecall`).

  Compare with `LeadsService.checkTransferPermission` (line 987-1003) and `CustomersService.checkTransferPermission` (line 321-337) which DO use `managerDepartment` junction. This proves the codebase has a department-scoping pattern but only applied to transfer flow.

- **Impact:** A compromised or malicious manager can verify fake payments, mark legit payments as REJECTED, redistribute leads belonging to other departments, or fraudulently convert leads to customers (since verify >= order.totalAmount triggers `lead.status = CONVERTED` automatically).
- **Remediation:**
  - Add `managerDepartment` check to `PaymentsService.verifyManual`, `reject`, `BankTransactionsService.manualMatch`, `DistributionService.batchDistribute`.
  - Extract a helper `checkManagerDeptAccess(user, deptId)` reused across modules.
  - Or extend `buildAccessFilter` to return `{ creator: { departmentId: { in: managedDeptIds } } }` for MANAGER role for `order`/`payment` entities; cache the dept list per-request to avoid N+1.
- **References:** CWE-285 Improper Authorization, OWASP API1:2023 Broken Object Level Authorization, API5 Broken Function Level Authorization

### FIND-003 - `verifyManual` accepts arbitrary bankTransactionId without state/amount validation
- **Severity:** Critical, CVSS 7.5 (AV:N/AC:L/PR:H/UI:N/S:U/C:N/I:H/A:N)
- **File:** `apps/api/src/modules/payments/payments.service.ts:169-211`
- **Description:**
  ```ts
  if (bankTransactionId) {
    const bankTxId = BigInt(bankTransactionId);
    updateData.matchedTransaction = { connect: { id: bankTxId } };
    await tx.bankTransaction.update({
      where: { id: bankTxId },
      data: { matchedPaymentId: id, matchStatus: 'MANUALLY_MATCHED' },
    });
  }
  ```
  No check that:
  1. `bankTxId` exists.
  2. The bank tx is currently `UNMATCHED` (it could already be matched to a different payment).
  3. The bank tx amount equals the payment amount.
  4. The same bank tx isn't being used to verify two different payments (concurrent verifies → unique `matched_payment_id` constraint may surface a raw P2002 error).

  Compared with `BankTransactionsService.manualMatch` (bank-transactions.service.ts:86-115) which DOES check both sides:
  ```ts
  const bankTx = await this.prisma.bankTransaction.findFirst({
    where: { id: bankTxId, matchStatus: 'UNMATCHED' },
  });
  ```
- **Impact:** Manager can reuse a single bank transaction to verify multiple payments, inflating verified revenue. Worse: by attaching an arbitrary bank tx to a payment whose amount differs, then conversion trigger (`checkConversionTrigger`) computes `totalVerified` from payments only - so order can be auto-completed even though no actual funds were received.
- **Remediation:**
  - Mirror the validation from `BankTransactionsService.manualMatch`:
    ```ts
    const bankTx = await tx.bankTransaction.findFirst({
      where: { id: bankTxId, matchStatus: 'UNMATCHED' },
    });
    if (!bankTx) throw new ConflictException('Bank transaction không UNMATCHED');
    if (bankTx.amount.toString() !== payment.amount.toString()) {
      throw new BadRequestException('Số tiền không khớp');
    }
    ```
  - Use `updateMany` with guard predicate to atomically claim:
    ```ts
    const claim = await tx.bankTransaction.updateMany({
      where: { id: bankTxId, matchStatus: 'UNMATCHED' },
      data: { matchedPaymentId: id, matchStatus: 'MANUALLY_MATCHED' },
    });
    if (claim.count === 0) throw new ConflictException('Bank tx đã được ghép');
    ```
- **References:** CWE-840 Business Logic Errors, CWE-362 Concurrent Execution Race Condition

### FIND-004 - Webhook ingest endpoint is excluded from audit log
- **Severity:** Critical (compliance / forensic), CVSS 6.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N) - low CVSS but high business impact
- **File:** `apps/api/src/modules/audit-log/audit-log.constants.ts:30-42`
- **Description:**
  ```ts
  export const SKIP_PATH_PREFIXES = [
    ...
    '/api/v1/webhooks',
    ...
    '/webhooks',
  ];
  ```
  The comment says "webhook bodies often carry vendor secrets" - valid for the body, but **the entire audit row is suppressed**, including metadata like IP, userAgent, statusCode, timing, externalId. Bank transaction creation + auto-match thus has no audit trail.

  Coupled with FIND-001/003, this means:
  - You cannot forensically reconstruct who ingested a fraudulent bank transaction.
  - Replay attacks have no trace.
  - Sample-IP based rate-limit dashboards lose webhook activity.
- **Impact:** Loss of forensic ability for the highest-stakes operation in the system (money in/out).
- **Remediation:**
  - Keep the path skip but log a *redacted* entry: still record IP/UA/path/status, but set body metadata to `{ externalId: <id>, amount: <amount>, redacted: true }`.
  - Or write a dedicated `bank_transaction_audit` table that captures the ingest event with the API key id, externalId, amount, source IP, signature hash, raw timestamp.
- **References:** CWE-778 Insufficient Logging, OWASP API10:2023 Insufficient Logging

---

## HIGH

### FIND-005 - No replay protection on bank webhook (timestamp + nonce missing)
- **Severity:** High, CVSS 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N)
- **Files:**
  - `apps/api/src/modules/auth/guards/webhook-signature.guard.ts` (no timestamp check)
  - `apps/api/src/modules/bank-transactions/bank-transactions.controller.ts:36-43` (no timestamp param in body)
  - `apps/api/src/modules/bank-transactions/bank-transactions.service.ts:42-83` (`ingest`)
- **Description:** Signature is HMAC over body. Body has `externalId` (dedup field). But the signature itself has no freshness check - an attacker who captures a single valid webhook can replay it indefinitely, and **only** the `externalId` unique constraint will reject it. If the attacker is an insider who can modify externalId in the rawData metadata but not the amount/content, replays would succeed.

  Industry standard: include `X-Timestamp` header + `X-Nonce` header in the HMAC input; reject if timestamp >5 min stale.
- **Impact:** Combined with FIND-001, an attacker with a captured webhook can re-trigger payment auto-match anytime, potentially racing with the cron 2h fuzzy match.
- **Remediation:**
  - Sign over `${timestamp}.${rawBody}` form.
  - Add timestamp header; reject if `|now - ts| > 300s`.
  - Store recent nonces in Redis (5 min TTL) to reject exact replay.
- **References:** CWE-294 Authentication Bypass by Capture-Replay

### FIND-006 - Concurrent webhook ingest: TOCTOU race between dedup check and create
- **Severity:** High, CVSS 6.5 (AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:H/A:N)
- **File:** `apps/api/src/modules/bank-transactions/bank-transactions.service.ts:57-78`
- **Description:**
  ```ts
  const existing = await this.prisma.bankTransaction.findUnique({
    where: { externalId: data.externalId },
  });
  if (existing) throw new ConflictException(...);
  const bankTx = await this.prisma.bankTransaction.create({ ... });
  await this.matchingService.tryMatchBankTransaction(bankTx.id);
  ```
  Two concurrent requests with same externalId both pass the `findUnique` check, both call `create`, one succeeds, the other gets raw Prisma `P2002` (unique constraint) - **no try/catch**. This:
  1. Leaks Prisma internals to webhook caller (the global filter masks but logs the stack).
  2. The successful one proceeds to auto-match. If matching also races (two webhooks → same payment), `executeMatch` uses optimistic guard but its rollback path can leave `BankTransaction` in inconsistent state on partial failure.
- **Impact:** Possible duplicate auto-match attempts; raw error message leaks; observability noise.
- **Remediation:**
  - Wrap the dedup+create+match in a single `$transaction` with `SELECT ... FOR UPDATE` (use `findUniqueOrThrow` inside upsert with try/catch on P2002).
  - Better: use `prisma.bankTransaction.upsert` keyed on `externalId`; on `create` path proceed to match, on `update` path do nothing.
  - Catch `Prisma.PrismaClientKnownRequestError` with `code === 'P2002'` globally and translate to `409 ConflictException`.
- **References:** CWE-367 TOCTOU, CWE-209 Information Exposure Through Error Message

### FIND-007 - `WEBHOOK_SECRET` fail-open in non-production env
- **Severity:** High, CVSS 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:N) - high in staging, low in dev
- **File:** `apps/api/src/modules/auth/guards/webhook-signature.guard.ts:17-24`
- **Description:**
  ```ts
  if (!secret) {
    if (process.env.NODE_ENV === 'production') { throw ... }
    this.logger.warn('WEBHOOK_SECRET not configured - skipping signature check (dev only)');
    return true;
  }
  ```
  If a staging environment forgets to set `NODE_ENV=production`, any caller with a valid API key can call `/webhooks/bank-transactions` and insert arbitrary bank transactions that auto-match real payments and trigger lead conversion.
- **Impact:** Staging compromise → fake payments + fake conversions. Increases blast radius if staging shares DB with prod.
- **Remediation:**
  - Always fail closed. Treat the absence of `WEBHOOK_SECRET` as a fatal config error at boot; refuse to start.
  - Or treat any `NODE_ENV !== 'development'` as production-strict.
- **References:** CWE-756 Missing Custom Error Page, CWE-636 Not Failing Securely

### FIND-008 - Lead/Status/Convert/Claim endpoints lack role guard - any USER can call
- **Severity:** High, CVSS 6.5 (AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:H/A:N)
- **File:** `apps/api/src/modules/leads/leads.controller.ts:172-206`
- **Description:** `POST /leads/:id/claim`, `POST /leads/:id/transfer`, `POST /leads/:id/status`, `POST /leads/:id/convert` have NO `@Roles` decorator. Authorization relies on:
  - `findById(id, user)` for ownership (via `buildAccessFilter`).
  - `checkTransferPermission` for transfer specifically.

  For `convert` (line 201-206): the service only checks status === IN_PROGRESS. There is NO check that this user is the assigned user. With `buildAccessFilter` USER scope = `{ assignedUserId: user.id }`, `findById` will only return leads they own - so a USER can only convert their own lead. OK.

  For `changeStatus` (line 190-199): same - findById scoping. But MANAGER+ has no scoping → manager can change any lead's status to anything (subject to ALLOWED_TRANSITIONS). Could mark a competing dept's lead as LOST, harming KPIs.

  For `claim` on FLOATING leads: a USER can claim any FLOATING lead - this is by design. But:
  - No `@Roles` means even a deactivated-status USER could claim (mitigated because JwtStrategy filters `status: ACTIVE`).
  - No throttling - a script could claim every floating lead before others see them.
- **Impact:** Manager can sabotage other depts' KPI by force-changing lead status. No rate-limit on claim = race to FLOATING pool.
- **Remediation:**
  - Add per-route throttling on `claim`: `@Throttle({ default: { ttl: 1000, limit: 1 } })` (1 claim per second per user).
  - Extend `checkTransferPermission`-like check to `changeStatus` requiring MANAGER to be from lead's dept.
- **References:** CWE-285 Improper Authorization

### FIND-009 - Payment auto-conversion triggers across departments (silent cross-dept side-effect)
- **Severity:** High, CVSS 6.0 (AV:N/AC:L/PR:H/UI:N/S:U/C:N/I:H/A:N)
- **File:** `apps/api/src/modules/payments/payment-matching.service.ts:91-141` (`checkConversionTrigger`)
- **Description:** When `totalVerified >= orderTotal`, the lead is auto-CONVERTED and customer is upserted with `assignedUserId = lead.assignedUserId, assignedDepartmentId = lead.departmentId`. The actor that triggers this is the verifier (manager). With FIND-002, a Dept-A manager can verify a Dept-B payment - this then converts the Dept-B lead AND silently moves the customer to Dept-B's assignee. No audit log entry identifies which manager triggered the cascade.

  Activity log row created (line 130-138) uses `userId: payment.verifiedBy || lead.assignedUserId || BigInt(1)` - falls back to user ID 1 if nothing else. **User ID 1 is hard-coded** and may not exist or could be a real user, attributing system actions to them.
- **Impact:** False audit attribution; cross-dept side effects without consent.
- **Remediation:**
  - Resolve a real "system" user ID at init (like `RecallConfigService._getSystemUserId`), pass it through context, never default to `BigInt(1)`.
  - When trigger fires across dept boundary, write an explicit audit row with `verifiedBy` and `triggeredBy` separately.
- **References:** CWE-732 Incorrect Permission Assignment, CWE-285

### FIND-010 - Cron jobs can overlap (manual run + scheduled run racing)
- **Severity:** High, CVSS 6.0 (AV:N/AC:L/PR:H/UI:N/S:U/C:N/I:L/A:H)
- **Files:**
  - `apps/api/src/modules/recall-config/recall-config.service.ts:144-185` (`@Cron('*/5 * * * *')` + `runNow` HTTP endpoint)
  - `apps/api/src/modules/recall-config/recall-config.controller.ts:56-59`
  - `apps/api/src/modules/cron-run/cron-run.service.ts:54-81` (no global lock)
- **Description:** The 5-minute auto-recall cron + the HTTP `runNow` endpoint can execute concurrently. `CronRunService.track` only inserts a tracking row; it does NOT acquire a lock. Two concurrent recalls:
  1. Both query the same `updatedAt < cutoff` leads → both `updateMany` is safe (idempotent) but creates duplicate `Activity` rows (timeline pollution).
  2. The 5-min scheduled job could overlap if a previous run takes >5 min (large batches at 500 chunk size).
  3. Similar for `tasks.service.ts:229` (`@Cron('*/1 * * * *')` + `processReminders`) - if a tick takes >60s, next tick fires while previous runs.
- **Impact:** Duplicate notifications sent to users (reminders), duplicate activity timeline rows.
- **Remediation:**
  - Add a Postgres advisory lock or Redis-based mutex in `CronRunService.track`:
    ```ts
    const lock = await acquireLock(`cron:${jobName}`, 600);
    if (!lock) { ctx.metadata.skipped = 'already running'; return; }
    try { await fn(ctx); } finally { await releaseLock(lock); }
    ```
  - Or use BullMQ (already imported in app.module.ts) with `concurrency: 1` per queue.
- **References:** CWE-362 Race Condition, CWE-667 Improper Locking

---

## MEDIUM

### FIND-011 - `Number(Decimal)` coercion in payment conversion - precision risk
- **Severity:** Medium (theoretical), CVSS 4.0
- **File:** `apps/api/src/modules/payments/payment-matching.service.ts:104-107`
- **Description:**
  ```ts
  const totalVerified = Number(result._sum.amount || 0);
  const orderTotal = Number(payment.order.totalAmount);
  if (totalVerified >= orderTotal) { ... }
  ```
  Decimal column is `@db.Decimal(12, 2)` → max value `9,999,999,999.99`, fits in `Number.MAX_SAFE_INTEGER` (2^53 ≈ 9.007 × 10^15). NOT exploitable today.

  But: floating-point compare on `>=` can be off by 1 in low bits. Example: order `100.00` VND, payments `33.33 + 33.33 + 33.34 = 100.00` - in IEEE-754 this could become `99.999999...` and skip conversion.

- **Impact:** Edge-case lead conversions fail silently. Customer support has to manually verify "why didn't this convert".
- **Remediation:**
  - Use `Prisma.Decimal` arithmetic and `.greaterThanOrEqualTo()`:
    ```ts
    import { Decimal } from '@prisma/client/runtime/library';
    const totalVerified = new Decimal(result._sum.amount?.toString() || '0');
    const orderTotal = new Decimal(payment.order.totalAmount.toString());
    if (totalVerified.gte(orderTotal)) { ... }
    ```
  - Or compare integer minor-units: `Math.round(value * 100)`.
- **References:** CWE-682 Incorrect Calculation, CWE-1339 Insufficient Precision

### FIND-012 - Order `create` does not validate productId vs allowed product categories
- **Severity:** Medium, CVSS 4.3
- **File:** `apps/api/src/modules/orders/orders.service.ts:118-206`
- **Description:** `create` accepts any `productId`. No check that:
  - Product is `isActive`.
  - Product category is enabled for orders.
  - `amount` matches product's listed `price` (allows under-pricing). The code computes `vatAmount` from `amount * vatRate / 100`, but the base `amount` is taken from the request body without comparison to `product.price`.

  Quick check: `if (!product) throw NotFoundException` (line 132). Only validates existence, not consistency.
- **Impact:** A USER can create a 1₫ order for a 5,000,000₫ product, then later when payment of 1₫ verifies → lead auto-CONVERTED. Useful for KPI manipulation if commission is paid per CONVERTED lead.
- **Remediation:**
  - At minimum, log `Math.abs(amount - product.price) > tolerance` as a warning in activity.
  - Or require manager approval for orders where `amount < product.price * 0.5`.
- **References:** CWE-840 Business Logic Errors, CWE-20 Improper Input Validation

### FIND-013 - Order status update has no role check beyond MANAGER/SA; allows REFUNDED without validating prior CONVERTED state
- **Severity:** Medium, CVSS 4.5
- **File:** `apps/api/src/modules/orders/orders.service.ts:208-219`
- **Description:** `ALLOWED_ORDER_TRANSITIONS.COMPLETED = ['REFUNDED']`. Per CLAUDE.md: "Order cancel/refund: KHÔNG revert lead CONVERTED". Code respects this (no lead update in `updateStatus`). Good.

  But: payment status is NOT touched when order goes REFUNDED. Payments stay `VERIFIED`, total verified still >= order total → next manual reconciliation could re-trigger conversion if order ever resurrects (shouldn't happen, but a CONFIRMED→COMPLETED→REFUNDED transition leaves orphan VERIFIED payments that show up in `/payments/export` as legitimate revenue).
- **Impact:** Revenue export over-counts refunded payments.
- **Remediation:**
  - On REFUND transition, write a `payment_refund` record or set a `refundedAt` flag on each related Payment.
  - Adjust `exportVerified` to exclude payments tied to REFUNDED orders.
- **References:** CWE-840

### FIND-014 - `applyTemplate` distribution: no capacity check, no max-leads enforcement
- **Severity:** Medium, CVSS 4.3
- **File:** `apps/api/src/modules/assignment-templates/assignment-templates.service.ts:88-143`
- **Description:** `applyTemplate` round-robins leads across template members but doesn't check `EmployeeLevel.maxLeads` capacity (unlike `LeadsService.assign` which calls `checkUserCapacity`). Manager can dump 100 leads onto a junior with `maxLeads=10`.
- **Impact:** Capacity rule (`Nhân viên đã đạt giới hạn {maxLeads} leads+customers`) bypassed via bulk-distribution.
- **Remediation:**
  - Pre-flight `checkUserCapacity(memberId, leadsForMember)` for each round-robin target.
  - Skip + report members at capacity in response.
- **References:** CWE-840

### FIND-015 - API key permission check is whitelist-string substring - no scope enforcement on webhook endpoint
- **Severity:** Medium, CVSS 5.3
- **Files:**
  - `apps/api/src/modules/auth/guards/api-key-auth.guard.ts:42-49`
  - `apps/api/src/modules/auth/decorators/api-key-auth.decorator.ts`
  - `apps/api/src/modules/bank-transactions/bank-transactions.controller.ts:33-43` (no scope arg passed)
- **Description:**
  ```ts
  const requiredScope = typeof metadata === 'string' ? metadata : null;
  if (requiredScope) { ... }
  ```
  The bank webhook uses `@ApiKeyAuth()` with no argument → no scope enforcement. Any active API key, regardless of `permissions[]`, can call `/webhooks/bank-transactions`.

  External lead ingest (`third-party-api.controller.ts:17`) also uses `@ApiKeyAuth()` with no scope. Same issue: a key created for "leads ingest" can be used for bank webhook ingest if signature also matches.
- **Impact:** Loss of least-privilege; partner integration keys can be redirected to higher-stakes endpoints.
- **Remediation:**
  - Require scope at every `@ApiKeyAuth()` call site: `@ApiKeyAuth('bank:webhook')`, `@ApiKeyAuth('leads:create')`.
  - At guard level: if `metadata === true` (no scope), warn-log and reject in production.
- **References:** CWE-285 Improper Authorization, OWASP API5

---

## LOW / INFO

### FIND-016 - Audit log read returns full PII (email, name, IP, UA) to SUPER_ADMIN
- **Severity:** Low (by design but flag), CVSS 3.0
- **File:** `apps/api/src/modules/audit-log/audit-log.service.ts:62-83`
- **Description:** `query()` returns `user.email`, `ipAddress`, `userAgent` in plaintext. SA only, so acceptable, but consider:
  - GDPR / personal data minimization principle.
  - SA account compromise = total PII exfiltration.
- **Remediation:** Optional - hash IP after 30 days, retain only `/24` for analytics.
- **References:** CWE-359 Exposure of PII

### FIND-017 - `fire-and-forget` API key `lastUsedAt` update silently swallows errors
- **Severity:** Low, CVSS 2.5
- **File:** `apps/api/src/modules/auth/guards/api-key-auth.guard.ts:54-58`
- **Description:** `this.prisma.apiKey.update({...}).catch(() => {})` swallows all errors. If a key is being concurrently deactivated, the update silently fails and the next request still sees the cached `isActive: true` from the previous `findFirst`. There's no caching, so OK in steady state - but the error swallow hides DB-down conditions.
- **Remediation:** Log the error: `.catch(err => this.logger.warn(...))`.
- **References:** CWE-390 Detection of Error Without Action

### FIND-018 - `JSON.stringify(body)` for HMAC also runs on `Buffer.isBuffer` paths - inconsistent
- **Severity:** Info
- **File:** `apps/api/src/modules/auth/guards/webhook-signature.guard.ts:33`
- **Description:** If a webhook ever sends `application/x-www-form-urlencoded` or multipart, `request.body` is no longer JSON, and `JSON.stringify` produces garbage. The check works only for JSON bodies. Document this assumption.
- **Remediation:** Add an explicit `Content-Type: application/json` enforcement at the guard level.

---

## Status

**Status:** DONE

**Summary:**
4 Critical, 6 High, 5 Medium, 3 Low/Info findings. Most severe issues: bank webhook signature verifies re-stringified body (not raw), MANAGER role lacks department scoping for payment verify / distribution / bulk recall, `verifyManual` allows arbitrary bankTransactionId reuse, webhook calls bypass audit log entirely.

**Severity counts:**
- Critical: 4 (FIND-001, 002, 003, 004)
- High: 6 (FIND-005, 006, 007, 008, 009, 010)
- Medium: 5 (FIND-011, 012, 013, 014, 015)
- Low/Info: 3 (FIND-016, 017, 018)

**Top 3 fix priorities:**
1. **FIND-001 + FIND-007** - Bank webhook signature must use raw body; fail-closed in all non-dev envs. Without this, no money flow is trustworthy.
2. **FIND-002** - Add `managerDepartment` scoping to `PaymentsService.verifyManual/reject`, `BankTransactionsService.manualMatch`, `DistributionService.batchDistribute`. Extract a shared `checkManagerDeptAccess` helper.
3. **FIND-003** - Mirror `BankTransactionsService.manualMatch` state guards inside `PaymentsService.verifyManual`. Single bank tx → single payment, enforced atomically.

---

## Unresolved Questions

1. **Bank webhook vendor:** Which Vietnamese bank API are we integrating (VietQR, BIDV, MB, VCB)? Their docs determine the exact signature format (raw body vs canonical JSON) and whether they sign over headers like timestamp. Cannot finalize FIND-001 fix without their spec.
2. **MANAGER scoping semantics:** Is `managerDepartment` junction (many-to-many) the authoritative source, or can a MANAGER have role-level powers over all departments by intent? Confirm with PO before tightening.
3. **System user ID hard-coded `BigInt(1)`** in payment-matching.service.ts:133 - is user ID 1 guaranteed to exist via seed? If yes, document; if no, replace with `_getSystemUserId` pattern from recall-config.
4. **Refund flow not implemented:** Order can transition to REFUNDED but no Payment.refundedAt field exists. Confirm scope: full refund handling deferred to phase 2?
5. **Audit log retention 60 days** - is this set by legal/compliance, or arbitrary? Vietnamese accounting law may require 10-year retention for financial transactions.
6. **Webhook idempotency window:** is 1 day enough, or should `externalId` dedup persist forever? Cron retention currently drops cron_runs+audit_logs at 60d but `bank_transactions` are not pruned - check.
