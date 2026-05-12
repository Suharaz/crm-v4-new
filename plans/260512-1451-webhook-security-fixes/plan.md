# Plan: Webhook Security Fixes (P0 Critical)

**Created**: 2026-05-12 14:51
**Scope**: Fix 3 Critical findings từ security audit liên quan đến webhook chain
**Estimated effort**: 4-6h dev + 2h test
**Reference report**: `plans/reports/security-review-260512-1152-full-audit.md`

## Findings được giải quyết

| ID | Severity | Issue |
|---|---|---|
| C-1 | Critical | Webhook HMAC tính trên parsed body thay vì raw bytes |
| C-3 | Critical | `verifyManual` accept arbitrary bankTransactionId không validate |
| C-4 | Critical | Webhook endpoint bị skip audit log hoàn toàn |
| H-8 | High (bonus) | Replay protection - timestamp/nonce missing |
| H-10 | High (bonus) | WEBHOOK_SECRET fail-open trong non-production |

## Phases

| # | Phase | Files affected | Effort |
|---|---|---|---|
| 1 | rawBody + Signature guard fix (C-1 + H-10) | 2 files | 1-1.5h |
| 2 | verifyManual atomic claim (C-3) | 1 file | 1.5-2h |
| 3 | Webhook audit log redacted (C-4) | 2 files | 1-1.5h |
| 4 | (Optional) Replay protection (H-8) | 1 file | ~30min |

---

## Phase 1: rawBody + Signature Guard Fix

### Files
- `apps/api/src/main.ts`
- `apps/api/src/modules/auth/guards/webhook-signature.guard.ts`

### Change 1.1: `main.ts` - Enable rawBody capture

**Before** (line 29):
```ts
const app = await NestFactory.create(AppModule, { bufferLogs: true });
```

**After**:
```ts
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
  rawBody: true,  // Cần thiết cho WebhookSignatureGuard - giữ raw bytes cho HMAC
});
```

**Why**: NestJS với `rawBody: true` sẽ attach `req.rawBody` (Buffer) song song với `req.body` (parsed). Guard cần raw bytes để compute HMAC khớp với bytes mà bank ký.

**Risk**: Tăng memory ~size of request body cho mỗi request. Acceptable - body limit 10MB.

### Change 1.2: `webhook-signature.guard.ts` - Sử dụng rawBody Buffer + fail-closed

**Before** (toàn file):
```ts
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('WEBHOOK_SECRET');
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new UnauthorizedException('WEBHOOK_SECRET chưa được cấu hình - webhook bị từ chối');
      }
      this.logger.warn('WEBHOOK_SECRET not configured - skipping signature check (dev only)');
      return true;  // BAD - dev fail-open
    }

    const request = context.switchToHttp().getRequest();
    const signature = request.headers['x-signature'] as string;
    if (!signature) {
      throw new UnauthorizedException('Webhook signature bắt buộc (header x-signature)');
    }

    // BAD - HMAC trên parsed body re-stringified
    const rawBody = JSON.stringify(request.body);
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    try {
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        throw new UnauthorizedException('Webhook signature không hợp lệ');
      }
    } catch {
      throw new UnauthorizedException('Webhook signature không hợp lệ');
    }

    return true;
  }
}
```

**After**:
```ts
import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';

/**
 * Guard validates HMAC-SHA256 webhook signatures.
 * Expects `x-signature` header containing HMAC of RAW body bytes.
 * Fails closed if WEBHOOK_SECRET is not configured (no dev exception).
 */
@Injectable()
export class WebhookSignatureGuard implements CanActivate {
  private readonly logger = new Logger(WebhookSignatureGuard.name);
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('WEBHOOK_SECRET');

    // Fail closed always - không có dev exception (H-10 fix)
    // Dev có thể export WEBHOOK_SECRET=dev-test-secret-32-chars trong .env
    if (!secret) {
      throw new UnauthorizedException(
        'WEBHOOK_SECRET chưa được cấu hình - webhook bị từ chối'
      );
    }

    const request = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const signature = request.headers['x-signature'] as string | undefined;
    if (!signature) {
      throw new UnauthorizedException('Webhook signature bắt buộc (header x-signature)');
    }

    // C-1 fix - dùng raw bytes thay vì re-stringify
    const rawBody = request.rawBody;
    if (!rawBody || rawBody.length === 0) {
      this.logger.error('rawBody không có sẵn - check NestFactory rawBody: true config');
      throw new UnauthorizedException('Webhook body không hợp lệ');
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    // Timing-safe comparison
    try {
      const sigBuf = Buffer.from(signature, 'hex');
      const expBuf = Buffer.from(expected, 'hex');
      if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
        throw new UnauthorizedException('Webhook signature không hợp lệ');
      }
    } catch (err) {
      // Buffer.from throws nếu hex invalid - treat as invalid signature
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Webhook signature không hợp lệ');
    }

    return true;
  }
}
```

**Key changes**:
1. Remove dev fail-open path (line 22-23 old) - bây giờ luôn require WEBHOOK_SECRET
2. Read `request.rawBody` (Buffer) thay vì `JSON.stringify(request.body)` (string)
3. Validate rawBody exists - guard against misconfig
4. Type-safe Request via Express type

### Testing Phase 1

```bash
# Unit test (existing nếu có, hoặc add mới)
pnpm --filter @crm/api test webhook-signature

# Manual test
curl -X POST http://localhost:3010/api/v1/webhooks/bank-transactions \
  -H "X-Api-Key: <test-key>" \
  -H "X-Signature: <wrong-sig>" \
  -d '{"externalId":"test","amount":100}'
# Expected: 401 "Webhook signature không hợp lệ"

# Test với signature đúng (compute bằng cùng secret + raw body)
SECRET="dev-test-secret-32-chars-min-len"
BODY='{"externalId":"test-001","amount":100000,"content":"test"}'
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | cut -d' ' -f2)
curl -X POST http://localhost:3010/api/v1/webhooks/bank-transactions \
  -H "X-Api-Key: <test-key>" \
  -H "X-Signature: $SIG" \
  -H "Content-Type: application/json" \
  -d "$BODY"
# Expected: 200 OK với bank transaction created
```

### Rollback plan
Revert 2 files về commit trước via git.

---

## Phase 2: verifyManual Atomic Claim (C-3)

### Files
- `apps/api/src/modules/payments/payments.service.ts`

### Change 2: `verifyManual` rewrite (line 169-211)

**Before**:
```ts
async verifyManual(id: bigint, userId: bigint, bankTransactionId?: string) {
  await this.prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({ where: { id, status: 'PENDING' } });
    if (!payment) throw new ConflictException('Thanh toán không ở trạng thái PENDING');

    const updateData: any = {
      status: 'VERIFIED', verifiedBy: userId, verifiedAt: new Date(), verifiedSource: 'MANUAL',
    };

    if (bankTransactionId) {
      const bankTxId = BigInt(bankTransactionId);
      // BAD - không check bankTx tồn tại
      // BAD - không check matchStatus = 'UNMATCHED'
      // BAD - không check amount khớp
      updateData.matchedTransaction = { connect: { id: bankTxId } };
      await tx.bankTransaction.update({
        where: { id: bankTxId },
        data: { matchedPaymentId: id, matchStatus: 'MANUALLY_MATCHED' },
      });
    }

    await tx.payment.update({ where: { id }, data: updateData });
    await this.matchingService.checkConversionTrigger(tx, id);

    const order = await tx.order.findFirst({ where: { id: payment.orderId }, select: { leadId: true } });
    if (order?.leadId) {
      await tx.activity.create({ /* ... */ });
    }
  });

  return this.findById(id);
}
```

**After**:
```ts
async verifyManual(id: bigint, userId: bigint, bankTransactionId?: string) {
  await this.prisma.$transaction(async (tx) => {
    // 1. Fetch payment, validate PENDING status
    const payment = await tx.payment.findFirst({ where: { id, status: 'PENDING' } });
    if (!payment) throw new ConflictException('Thanh toán không ở trạng thái PENDING');

    const updateData: any = {
      status: 'VERIFIED', verifiedBy: userId, verifiedAt: new Date(), verifiedSource: 'MANUAL',
    };

    // 2. C-3 fix - validate + atomic claim bank transaction
    if (bankTransactionId) {
      const bankTxId = BigInt(bankTransactionId);

      // 2a. Atomic claim - chỉ update nếu CHƯA matched (race-safe)
      // updateMany với guard predicate là pattern atomic của Prisma
      const claim = await tx.bankTransaction.updateMany({
        where: {
          id: bankTxId,
          matchStatus: 'UNMATCHED',  // guard - chỉ claim nếu còn UNMATCHED
        },
        data: {
          matchedPaymentId: id,
          matchStatus: 'MANUALLY_MATCHED',
        },
      });

      if (claim.count === 0) {
        // Bank tx không tồn tại HOẶC đã matched với payment khác
        throw new ConflictException(
          'Bank transaction không UNMATCHED - có thể đã được ghép payment khác hoặc không tồn tại'
        );
      }

      // 2b. Validate amount khớp (defensive check after claim)
      // Nếu mismatch, throw để $transaction rollback claim
      const bankTx = await tx.bankTransaction.findUniqueOrThrow({ where: { id: bankTxId } });
      if (bankTx.amount.toString() !== payment.amount.toString()) {
        throw new ConflictException(
          `Số tiền không khớp: bank transaction ${bankTx.amount} vs payment ${payment.amount}`
        );
      }

      updateData.matchedTransaction = { connect: { id: bankTxId } };
    }

    // 3. Update payment status
    await tx.payment.update({ where: { id }, data: updateData });

    // 4. Check conversion trigger (auto-convert lead nếu đủ amount)
    await this.matchingService.checkConversionTrigger(tx, id);

    // 5. Log activity on lead timeline
    const order = await tx.order.findFirst({ where: { id: payment.orderId }, select: { leadId: true } });
    if (order?.leadId) {
      await tx.activity.create({
        data: {
          entityType: 'LEAD', entityId: order.leadId, userId,
          type: 'NOTE',
          content: `Xác nhận thanh toán ${Number(payment.amount).toLocaleString('vi-VN')}₫ ✅`,
          metadata: { paymentId: id.toString(), type: 'PAYMENT_VERIFIED' },
        },
      });
    }
  });

  return this.findById(id);
}
```

**Key changes**:
1. Atomic claim via `updateMany` với `where.matchStatus: 'UNMATCHED'` guard - race-safe
2. Throw `ConflictException` nếu claim.count === 0 (đã matched hoặc không tồn tại)
3. Amount validation sau claim (defensive) - throw để transaction rollback
4. Giữ nguyên các phần khác (conversion trigger, activity log)

**Important**: Vì throw trong `$transaction` → toàn bộ transaction rollback tự động, kể cả claim đã chạy. Pattern này đúng.

### Testing Phase 2

```bash
# Test case 1: verifyManual không có bankTransactionId
# Expected: payment VERIFIED, không link bankTx

# Test case 2: verifyManual với bankTxId UNMATCHED + amount khớp
# Expected: payment VERIFIED, bankTx MANUALLY_MATCHED

# Test case 3: verifyManual với bankTxId đã MATCHED
# Expected: 409 Conflict "không UNMATCHED"

# Test case 4: verifyManual với bankTxId không tồn tại
# Expected: 409 Conflict (claim.count === 0)

# Test case 5: verifyManual với bankTxId UNMATCHED + amount KHÔNG khớp
# Expected: 409 Conflict, rollback claim (bankTx vẫn UNMATCHED sau khi rollback)

# Test case 6 (race): 2 concurrent verifyManual cùng bankTxId
# Expected: 1 success, 1 fail với 409
```

### Rollback plan
Revert payments.service.ts về commit trước.

---

## Phase 3: Webhook Audit Log Redacted (C-4)

### Approach decision

**2 options**:

| Option | Pros | Cons |
|---|---|---|
| **A. Remove `/webhooks` từ SKIP_PATH_PREFIXES + add sensitive tokens** | Đơn giản, dùng existing sanitize pattern | senderAccount/senderName/rawData không cover bởi token list - vẫn leak PII |
| **B. Keep SKIP, add special webhook handler trong interceptor** | Control chính xác fields log, không leak PII | Phức tạp hơn, special-case logic |

**Recommend: Option B** - rõ ràng hơn về what's logged cho high-stakes flow.

### Files
- `apps/api/src/modules/audit-log/audit-log.interceptor.ts`

### Change 3: `audit-log.interceptor.ts` - Special webhook handler

**Before** (`shouldSkip` line 46-50):
```ts
private shouldSkip(req: Request): boolean {
  if (SKIP_METHODS.has(req.method)) return true;
  const path = req.path ?? req.url ?? '';
  return SKIP_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}
```

**After**: Split skip logic - webhook gets special treatment, others use existing SKIP

```ts
/** Detect webhook path - cần audit nhưng với metadata redacted */
private isWebhookPath(req: Request): boolean {
  const path = req.path ?? req.url ?? '';
  return path.startsWith('/api/v1/webhooks') || path.startsWith('/webhooks');
}

private shouldSkip(req: Request): boolean {
  if (SKIP_METHODS.has(req.method)) return true;
  const path = req.path ?? req.url ?? '';

  // Webhook không skip - phải audit với body redacted (handled trong captureRequestMetadata)
  if (this.isWebhookPath(req)) return false;

  return SKIP_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

/** Webhook body chứa vendor data - chỉ log identifiers safe, không log raw body */
private captureRequestMetadata(req: Request & { user?: { id: bigint } }): Record<string, unknown> {
  if (this.isWebhookPath(req)) {
    // Webhook: log chỉ safe identifiers, không log full body
    const body = req.body as Record<string, unknown> | undefined;
    return {
      webhook: true,
      externalId: body?.externalId,
      amount: body?.amount,
      // No senderAccount, no senderName, no rawData - PII risk
      bodyRedacted: true,
    };
  }

  return {
    body: sanitize(req.body),
    query: sanitize(req.query),
    params: sanitize(req.params),
  };
}
```

**Note**: `audit-log.constants.ts` giữ nguyên `/webhooks` trong SKIP_PATH_PREFIXES (vì có thể có code khác reference). Logic skip override trong interceptor.

**Alternative**: Cleaner - remove webhook entries từ SKIP_PATH_PREFIXES và handle hoàn toàn ở interceptor. Cần check không có code khác dùng constant này.

### Testing Phase 3

```bash
# Test: gửi webhook valid → check audit_logs table có row mới
psql -d crm_v4 -c "SELECT id, action, method, path, status_code, metadata FROM audit_logs WHERE path LIKE '%webhooks%' ORDER BY id DESC LIMIT 5;"

# Expected metadata: { webhook: true, externalId: "...", amount: ..., bodyRedacted: true, durationMs: ... }
# Expected: NOT contain senderAccount, senderName, rawData, content
```

### Rollback plan
Revert interceptor về commit trước.

---

## Phase 4 (Optional): Replay Protection (H-8)

### Files
- `apps/api/src/modules/auth/guards/webhook-signature.guard.ts`

### Approach
Add timestamp check để chống replay attack:
1. Bank gửi header `X-Timestamp: <unix-seconds>`
2. Guard sign over `${timestamp}.${rawBody}` thay vì chỉ rawBody
3. Reject nếu `|now - timestamp| > 300s` (5 phút)

**Lý do skip Phase 4 lần này**: Cần coordinate với bank API spec - bank thật sự ký theo format nào? VietQR vs SePay vs MB Bank khác nhau. Implement sau khi có vendor docs cụ thể (unresolved question từ master report).

### Pseudo code (cho future implementation)
```ts
const timestamp = request.headers['x-timestamp'] as string;
if (!timestamp) throw new UnauthorizedException('Thiếu x-timestamp header');

const ts = parseInt(timestamp, 10);
if (Math.abs(Date.now() / 1000 - ts) > 300) {
  throw new UnauthorizedException('Webhook timestamp quá cũ (>5 phút)');
}

const signaturePayload = `${timestamp}.${rawBody.toString('utf-8')}`;
const expected = createHmac('sha256', secret).update(signaturePayload).digest('hex');
```

---

## Implementation Order

```
Phase 1 (1-1.5h) → unit test → manual test → commit
Phase 2 (1.5-2h) → unit test → manual test → commit
Phase 3 (1-1.5h) → manual test (check DB rows) → commit
[Phase 4 deferred until bank spec available]
```

Mỗi phase commit riêng để dễ rollback.

## Risks

| Risk | Mitigation |
|---|---|
| `rawBody: true` impact app-wide memory | Test với current 10MB upload limit - OK |
| Existing webhook test calls fail (test signature compute trên parsed body) | Update tests dùng raw body HMAC |
| Bank spec khác (sign over headers, different algorithm) | Verify với vendor docs trước go-live |
| WEBHOOK_SECRET không có ở dev env → block local dev | Add `WEBHOOK_SECRET=dev-secret-32-chars` vào `.env.example` |
| Audit log tăng volume (webhook calls hourly) | Retention policy 60 days đã có (audit-log-retention.service.ts) |
| Race condition trong verifyManual có thể trigger 409 spuriously | Test scenario, document expected error |

## Success Criteria

- [ ] Phase 1: HMAC verify với raw body work với test webhook (test script gửi đúng signature)
- [ ] Phase 1: WEBHOOK_SECRET missing → 401 ngay, không có dev fail-open
- [ ] Phase 2: verifyManual với bankTxId đã matched → 409
- [ ] Phase 2: verifyManual với bankTxId amount khác → 409 + rollback (bankTx remain UNMATCHED)
- [ ] Phase 2: Race condition test: 2 concurrent verifyManual → 1 success + 1 fail
- [ ] Phase 3: Audit log có row cho mỗi webhook call với metadata redacted
- [ ] Phase 3: Audit log row KHÔNG chứa senderAccount/senderName/rawData

## Files Changed Summary

| File | Phase | Lines changed (estimate) |
|---|---|---|
| `apps/api/src/main.ts` | 1 | +3 |
| `apps/api/src/modules/auth/guards/webhook-signature.guard.ts` | 1 | rewrite (~50 lines) |
| `apps/api/src/modules/payments/payments.service.ts` | 2 | ~30 lines trong verifyManual |
| `apps/api/src/modules/audit-log/audit-log.interceptor.ts` | 3 | +15 lines (helper method) |

Total: ~100 lines code change, no schema migration, no breaking changes cho frontend.

## Unresolved Questions

1. Bank API vendor (VietQR/SePay/BIDV/MB/VCB) - signature format chính xác? Cần spec trước Phase 4.
2. Có existing webhook tests dùng signature compute trên parsed body không? Cần update.
3. Production env có set WEBHOOK_SECRET chưa? Cần check `.env.production`.
4. Phase 4 (replay protection) - implement luôn hay defer? Recommendation: defer cho đến khi có bank spec.

## Approval needed

User confirm approach trên trước khi implement. Câu hỏi cụ thể:
- ✅ OK với fail-closed luôn (xóa dev exception)?
- ✅ OK với Option B cho audit log (special handler thay vì sanitize)?
- ✅ OK skip Phase 4 đợi bank spec?
