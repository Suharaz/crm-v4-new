# Security Findings - Detailed Walkthrough (Junior Dev Edition)

**Date**: 2026-05-12 14:17
**Mục đích**: Giải thích chi tiết từng finding từ security audit `security-review-260512-1152-full-audit.md` với root cause + attack scenario + fix code + common pitfalls.
**Đối tượng**: Developer cần hiểu sâu để fix đúng.

---

## Phần 1: Critical Findings (9 lỗi - fix trong 24-48h)

---

### C-1. Bank webhook HMAC trên parsed body thay vì raw bytes

#### Context (Vấn đề là gì)
Webhook là URL công khai mà bank gọi vào khi có giao dịch chuyển khoản đến. Vì URL công khai, ai cũng gọi được, nên ta dùng **signature** để verify request thực sự đến từ bank chứ không phải kẻ giả mạo.

Cách hoạt động đơn giản: Bank và CRM cùng biết 1 **secret key**. Bank tính `HMAC-SHA256(body, secret)` rồi gửi kèm header `X-Signature`. CRM nhận body + signature → tự tính HMAC bằng cùng secret + body → so sánh. Nếu khớp → request thật, nếu sai → reject.

#### Root cause - Code hiện tại đang sai
File: `apps/api/src/modules/auth/guards/webhook-signature.guard.ts:33-40`
```ts
// BAD - đang dùng pattern này
const rawBody = JSON.stringify(request.body);
const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
```

**Tại sao sai?** `request.body` đã được Express body-parser **parse từ JSON sang JavaScript object**. Khi ta `JSON.stringify(request.body)`, ta tạo ra 1 chuỗi JSON MỚI - không phải chuỗi nguyên bản bank đã ký.

Ví dụ cụ thể:
- Bank gửi: `{"amount":1000,"id":"abc"}` (raw bytes)
- Sau body-parser: `{ amount: 1000, id: "abc" }` (JS object)
- `JSON.stringify` lại: `{"amount":1000,"id":"abc"}` HOẶC `{"id":"abc","amount":1000}` (thứ tự key có thể đổi)
- Nếu có Unicode: `{"name":"Nguyễn"}` → có thể thành `{"name":"Nguyễn"}` (escape khác)
- Whitespace: `{ "a" : 1 }` → `{"a":1}` (whitespace bị loại)

Bank ký trên **bytes gốc**, ta tính HMAC trên **bytes serialize lại** → 2 hash khác nhau → signature FAIL.

#### Attack scenario
**Scenario A - Production fail tự nhiên**: Khi đi production, bank thật gửi webhook → CRM verify fail → drop hết transaction → tiền vào không sync được.

**Scenario B - Bypass nếu rò secret**: Nếu attacker biết được `WEBHOOK_SECRET`, họ có thể:
1. Tạo payload với key order khác bank gốc: `{"id":"abc","amount":1000}`
2. Tính HMAC bằng `JSON.stringify({id:"abc",amount:1000})` → match với code CRM
3. Smuggle field qua các filter ở middleware (vì middleware kiểm tra trên raw, CRM check trên parsed)

#### Fix - Code đúng

**Bước 1**: Bật rawBody capture ở `apps/api/src/main.ts`
```ts
// BEFORE
const app = await NestFactory.create(AppModule, { bufferLogs: true });

// AFTER - thêm rawBody: true để NestJS giữ lại bytes gốc
const app = await NestFactory.create(AppModule, {
  bufferLogs: true,
  rawBody: true,  // NEW - cần thiết để guard đọc được raw bytes
});
```

**Bước 2**: Sửa guard dùng rawBody Buffer
```ts
// apps/api/src/modules/auth/guards/webhook-signature.guard.ts
import { createHmac, timingSafeEqual } from 'crypto';

async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest();

  // Đọc raw bytes (Buffer) thay vì parsed object
  const rawBody = (request as any).rawBody as Buffer;
  if (!rawBody) {
    throw new UnauthorizedException('Raw body không có sẵn - check rawBody config');
  }

  const signature = request.headers['x-signature'] as string;
  if (!signature) {
    throw new UnauthorizedException('Thiếu signature header');
  }

  const secret = this.configService.get<string>('WEBHOOK_SECRET');
  if (!secret) {
    // C-1 + H-10: fail-closed luôn, không có dev exception
    throw new Error('WEBHOOK_SECRET phải được set');
  }

  // HMAC trực tiếp trên raw bytes - không serialize lại
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

  // timingSafeEqual để chống timing attack (đã có sẵn - tốt)
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
```

#### Common Pitfalls
1. **Quên config `rawBody: true`**: Nếu thiếu, `req.rawBody` undefined - guard luôn throw
2. **Apply rawBody toàn app**: Sẽ break các endpoint khác cần parsed body. Solution: chỉ apply cho routes `/webhooks/*` via middleware
3. **Dùng `req.body.toString()` thay vì `req.rawBody`**: Sau body-parser, `req.body` đã là object - toString() ra `[object Object]` chứ không phải JSON
4. **So sánh signature bằng `===`**: Vulnerable to timing attack. Phải dùng `crypto.timingSafeEqual` (code đã đúng)

#### Key Takeaways
- HMAC phải tính trên **input gốc**, không phải input được serialize lại
- Trong Express/NestJS, body-parser modifies request - phải capture raw BEFORE parsing
- Mọi vendor webhook (Stripe, Twilio, GitHub, bank API) đều ký raw body - đây là industry standard
- Khi đi production, **test với staging environment + bank sandbox** trước khi go-live

#### Learn More
- [Stripe Webhook Signatures](https://stripe.com/docs/webhooks/signatures) - reference implementation
- [NestJS rawBody](https://docs.nestjs.com/faq/raw-body)
- CWE-345: Insufficient Verification of Data Authenticity

---

### C-2. MANAGER role không có department scoping

#### Context (Vấn đề là gì)
Hệ thống CRM có 3 vai trò: USER (sale thường) → MANAGER (trưởng phòng) → SUPER_ADMIN (admin). Theo business rule:
- USER chỉ thấy lead/customer/payment của mình
- MANAGER thấy của cả dept (phòng ban) mình quản lý
- SUPER_ADMIN thấy hết

Để enforce rule này, code dùng `buildAccessFilter(user)` - tạo ra Prisma `where` clause để scope query theo user. Pattern này áp dụng đúng cho USER role nhưng **không scope MANAGER theo dept**.

#### Root cause - Code hiện tại đang sai
File: `apps/api/src/common/filters/build-access-filter.ts:26-28`
```ts
export function buildAccessFilter(user: AccessFilterUser, entity: string) {
  if (user.role === UserRole.SUPER_ADMIN) return {};  // OK - thấy hết
  if (user.role === UserRole.MANAGER) return {};      // BUG - thấy hết như SA
  // USER scope
  return { assignedUserId: user.id };
}
```

Manager dept A có thể `verify` payment của order tạo bởi user dept B - vì filter rỗng, không check dept.

#### Attack scenario
**Setup**: Manager Tuấn quản lý Phòng Kinh Doanh 1 (dept_id=1). Phòng Kinh Doanh 2 (dept_id=2) có manager Hùng.

**Scenario A - Sabotage KPI dept khác**:
1. Tuấn login vào CRM
2. Tuấn vào trang Payments, thấy danh sách **toàn bộ payments** (không scope)
3. Tuấn click "Reject" lên payment của order thuộc dept 2
4. Payment dept 2 bị reject → KPI dept 2 giảm

**Scenario B - Inflate KPI dept mình**:
1. Tuấn tạo payment giả (PENDING) cho order dept 1
2. Tuấn verify thủ công với bankTransactionId bất kỳ (combined với C-3 - không validate)
3. Order auto-CONVERT → KPI dept 1 tăng

**Scenario C - Manager bắt cóc lead**:
1. Tuấn vào `/leads/bulk-recall` với list lead IDs của dept 2 (lấy được vì query không scope)
2. Bulk recall → leads dept 2 bị đẩy về kho thả nổi (FLOATING)
3. Sales dept 1 (cùng dept Tuấn) claim những lead này → cướp lead dept 2

#### Fix - Code đúng

**Bước 1**: Tạo helper `checkManagerDeptAccess`
```ts
// apps/api/src/common/filters/manager-dept-access.helper.ts (NEW FILE)
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@crm/types';

@Injectable()
export class ManagerDeptAccessHelper {
  constructor(private prisma: PrismaService) {}

  /** Trả true nếu user có quyền với dept đó (SA luôn true, MANAGER check junction, USER false) */
  async canAccessDept(user: AccessFilterUser, targetDeptId: bigint | null): Promise<boolean> {
    if (user.role === UserRole.SUPER_ADMIN) return true;
    if (user.role === UserRole.USER) return false;

    // MANAGER - check managerDepartment junction
    if (!targetDeptId) return false;  // dept null = orphan, manager không claim được
    const managed = await this.prisma.managerDepartment.findUnique({
      where: { userId_departmentId: { userId: user.id, departmentId: targetDeptId } },
    });
    return !!managed;
  }

  /** Throw ForbiddenException nếu không có quyền */
  async assertDeptAccess(user: AccessFilterUser, targetDeptId: bigint | null) {
    const can = await this.canAccessDept(user, targetDeptId);
    if (!can) {
      throw new ForbiddenException('Không có quyền truy cập dept này');
    }
  }
}
```

**Bước 2**: Apply ở các service có mutation cross-dept
```ts
// apps/api/src/modules/payments/payments.service.ts:169-211
async verifyManual(id: bigint, user: AccessFilterUser, bankTransactionId?: string) {
  return this.prisma.$transaction(async (tx) => {
    // Fetch payment kèm dept của order creator
    const payment = await tx.payment.findFirst({
      where: { id, status: 'PENDING' },
      include: { order: { include: { creator: true } } },
    });
    if (!payment) throw new NotFoundException('Payment không tồn tại hoặc không PENDING');

    // NEW - assert manager có quyền với dept của order
    await this.deptHelper.assertDeptAccess(user, payment.order.creator.departmentId);

    // ... rest of verify logic
  });
}
```

#### Common Pitfalls
1. **Quên SA bypass**: Nếu code `if (user.role === MANAGER) check dept`, SA cũng bị check → SA mất quyền. Phải check `role === SUPER_ADMIN` return true trước
2. **N+1 query**: Mỗi request gọi `findUnique(managerDepartment)` → tốn DB roundtrip. Solution: cache managedDepartmentIds vào `user` object lúc JWT validate, hoặc dùng request-scoped cache
3. **Fail-open khi `targetDeptId = null`**: Lead/Customer chưa assigned dept (POOL no dept) - nếu code `if (!deptId) return true` → manager bất kỳ claim được. Fix: `return false` cho null, hoặc allow chỉ nếu là SUPER_ADMIN
4. **Áp dụng không đầy đủ**: Chỉ apply cho `verifyManual` mà quên `reject`, `manualMatch`, `batchDistribute` → vẫn lỗi. Phải checklist từng action mutation

#### Key Takeaways
- **Authorization phải check ở SERVICE layer**, không phải chỉ ở controller (`@Roles`)
- Helper pattern (extract common check) tránh duplicate code + dễ test
- Khi update permissions, **invalidate cache** (managedDepartmentIds) ngay
- "Same role" không có nghĩa "same scope" - cần phân biệt dept scope

#### Learn More
- OWASP A01:2021 - Broken Access Control
- OWASP API1:2023 - Broken Object Level Authorization (BOLA)
- CWE-285: Improper Authorization

---

### C-3. `verifyManual` không validate bankTransactionId

#### Context (Vấn đề là gì)
Khi sale tạo payment với status `PENDING`, manager có thể manually link payment với 1 bank transaction (giao dịch chuyển khoản đã ghi nhận trong DB). Việc này dùng khi auto-match fail.

Logic đúng: 1 bank transaction = 1 payment (one-to-one). Nếu link đã rồi thì không thể link lại payment khác.

#### Root cause - Code hiện tại đang sai
File: `apps/api/src/modules/payments/payments.service.ts:169-211`
```ts
if (bankTransactionId) {
  const bankTxId = BigInt(bankTransactionId);
  // BUG - không check bankTxId có tồn tại không
  // BUG - không check bankTx.matchStatus === 'UNMATCHED'
  // BUG - không check bankTx.amount === payment.amount
  updateData.matchedTransaction = { connect: { id: bankTxId } };
  await tx.bankTransaction.update({
    where: { id: bankTxId },
    data: { matchedPaymentId: id, matchStatus: 'MANUALLY_MATCHED' },
  });
}
```

So sánh với `BankTransactionsService.manualMatch:86-115` - làm đúng:
```ts
const bankTx = await this.prisma.bankTransaction.findFirst({
  where: { id: bankTxId, matchStatus: 'UNMATCHED' },  // OK - check status
});
if (!bankTx) throw new ConflictException(...);
```

#### Attack scenario
**Scenario - Reuse bank transaction**:
1. Bank chuyển khoản 5tr cho order #100 - bank webhook ingest tạo `BankTransaction id=1, amount=5000000, matchStatus=MATCHED, matchedPaymentId=100`
2. Manager Tuấn tạo payment giả #200 cho order #150 (order khác)
3. Tuấn call `POST /payments/200/verify` với body `{ bankTransactionId: "1" }`
4. Code KHÔNG check bankTx.matchStatus → update `bankTransaction.matchedPaymentId = 200` (overwrite payment 100!)
5. Payment 200 status → VERIFIED
6. `checkConversionTrigger` query `SUM(payments WHERE order=150 AND status=VERIFIED)` → 5tr ≥ orderTotal → lead auto-CONVERT

**Kết quả**: 1 lần chuyển khoản thật → 2 lead auto-convert thành customer → KPI inflate giả.

**Race condition combo (C-3 + concurrent)**:
1. 2 manager đồng thời call verifyManual với cùng bankTxId
2. Cả 2 đọc bankTx, cả 2 link, một update overwrite cái kia → silent data corruption

#### Fix - Code đúng

```ts
async verifyManual(id: bigint, user: AccessFilterUser, bankTransactionId?: string) {
  return this.prisma.$transaction(async (tx) => {
    // 1. Fetch payment + check status + scope (C-2 fix)
    const payment = await tx.payment.findFirst({
      where: { id, status: 'PENDING' },
      include: { order: { include: { creator: true } } },
    });
    if (!payment) throw new NotFoundException('Payment không PENDING hoặc không tồn tại');

    // C-2 fix - dept scope
    await this.deptHelper.assertDeptAccess(user, payment.order.creator.departmentId);

    if (bankTransactionId) {
      const bankTxId = BigInt(bankTransactionId);

      // 2. ATOMIC CLAIM - dùng updateMany với guard predicate
      // Cách này atomic: chỉ update nếu CHƯA matched (race-safe)
      const claim = await tx.bankTransaction.updateMany({
        where: {
          id: bankTxId,
          matchStatus: 'UNMATCHED',  // guard - chỉ claim nếu UNMATCHED
        },
        data: {
          matchedPaymentId: id,
          matchStatus: 'MANUALLY_MATCHED',
          matchedAt: new Date(),
        },
      });

      if (claim.count === 0) {
        // Bank tx không tồn tại HOẶC đã matched
        throw new ConflictException(
          'Bank transaction không UNMATCHED - có thể đã được ghép payment khác'
        );
      }

      // 3. Validate amount match (defensive)
      const bankTx = await tx.bankTransaction.findUniqueOrThrow({
        where: { id: bankTxId },
      });
      if (bankTx.amount.toString() !== payment.amount.toString()) {
        // Rollback claim - throw để $transaction rollback
        throw new BadRequestException(
          `Số tiền không khớp: bank ${bankTx.amount} vs payment ${payment.amount}`
        );
      }

      updateData.matchedTransaction = { connect: { id: bankTxId } };
    }

    // 4. Update payment status
    const updated = await tx.payment.update({
      where: { id },
      data: { ...updateData, status: 'VERIFIED', verifiedBy: user.id, verifiedAt: new Date() },
    });

    // 5. Trigger conversion check
    await this.matchingService.checkConversionTrigger(updated.orderId, tx);

    return updated;
  });
}
```

#### Common Pitfalls
1. **Check-then-act race**: Code `findFirst then update` không atomic - 2 concurrent calls đều pass `findFirst` rồi cùng update. Dùng `updateMany với where` để atomic
2. **Quên rollback khi amount mismatch**: Nếu chỉ throw mà không trong $transaction → bankTx vẫn bị claim. Phải đảm bảo trong transaction
3. **Trust client-side bankTxId**: Manager UI gửi bankTxId, attacker có thể postman gửi bất kỳ id. Server PHẢI re-validate
4. **`update` thay vì `updateMany`**: `update` không có conditional - dùng `updateMany` để check-and-set atomic

#### Key Takeaways
- **Atomic operations** quan trọng cho money flow - dùng `updateMany với where` thay vì `findThenUpdate`
- **Idempotency**: cùng input → cùng output, không double-effect
- Mỗi state transition cần validate **cả guard điều kiện** (status hiện tại) **và side-effect targets** (resources liên quan)
- Trong $transaction, throw error → tự động rollback. Tận dụng cơ chế này

#### Learn More
- CWE-362: Concurrent Execution using Shared Resource
- CWE-840: Business Logic Errors
- [Prisma Transactions](https://www.prisma.io/docs/orm/prisma-client/queries/transactions)

---

### C-4. Webhook ingest endpoint bị skip audit log

#### Context (Vấn đề là gì)
Audit log là "hộp đen máy bay" của hệ thống - ghi lại mọi hành động quan trọng (ai làm gì, khi nào, IP nào). Khi có sự cố (fraud, fake transaction, data tampering), audit log là nguồn duy nhất để forensic.

Bank webhook = nguồn money flow chính → cần audit nhất.

#### Root cause - Code hiện tại đang sai
File: `apps/api/src/modules/audit-log/audit-log.constants.ts:30-42`
```ts
export const SKIP_PATH_PREFIXES = [
  '/health',
  '/api/v1/auth/refresh',  // OK - too frequent
  '/api/v1/webhooks',      // BUG - bỏ qua webhook hoàn toàn
  '/webhooks',
  // ...
];
```

Comment trong code nói "webhook bodies often carry vendor secrets" - đúng cho body, nhưng cách fix sai. Hiện tại **toàn bộ row** bị skip, bao gồm metadata như IP, user-agent, status code, externalId.

#### Attack scenario
**Scenario - Fraudulent webhook không trace được**:
1. Insider có access vào WEBHOOK_SECRET (hoặc leak qua git)
2. Insider craft webhook payload giả: `{ externalId: "fake-001", amount: "10000000", ... }`
3. POST với signature đúng → CRM ingest, tạo bank transaction giả, auto-match payment
4. Lead auto-CONVERT thành customer giả → revenue inflate
5. Sau khi event happen, **forensic không có gì để trace**:
   - Không có log IP source
   - Không có log timestamp request
   - Không có log API key dùng
   - Không có log signature header

#### Fix - Code đúng

**Option A** (recommended): Log redacted entry
```ts
// apps/api/src/modules/audit-log/audit-log.interceptor.ts
intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
  const request = context.switchToHttp().getRequest();
  const url = request.url;

  // Special handling cho webhook - log redacted metadata
  if (SKIP_PATH_PREFIXES.some(p => url.startsWith(p))) {
    // Webhook ingest: log MINIMAL metadata (no body)
    if (url.includes('/webhooks/')) {
      return next.handle().pipe(
        tap((response) => {
          this.auditService.create({
            action: 'webhook.ingest',
            path: url,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
            apiKeyId: (request as any).apiKey?.id,
            statusCode: context.switchToHttp().getResponse().statusCode,
            metadata: {
              externalId: request.body?.externalId,  // chỉ ID, không body
              amount: request.body?.amount,
              redacted: true,
            },
          });
        }),
      );
    }
    return next.handle();  // Other skip prefixes - giữ skip
  }
  // ... existing logic
}
```

**Option B**: Dedicated table cho bank transaction audit
```prisma
// packages/database/prisma/schema.prisma
model BankTransactionAudit {
  id          BigInt   @id @default(autoincrement())
  externalId  String
  amount      Decimal  @db.Decimal(12, 2)
  apiKeyId    BigInt
  apiKey      ApiKey   @relation(fields: [apiKeyId], references: [id])
  ipAddress   String?
  userAgent   String?
  signatureHash String?  // hash signature để verify replay
  rawTimestamp DateTime
  createdAt   DateTime @default(now())

  @@index([externalId])
  @@index([createdAt])
  @@map("bank_transaction_audits")
}
```

Sau đó trong `BankTransactionsService.ingest`, viết audit row trước khi process.

#### Common Pitfalls
1. **Log body raw → leak secret**: Bank webhook có thể chứa account number, signature - đừng log raw body. Solution: log metadata redacted
2. **Audit table cùng DB chính → có thể bị tampering**: Production tốt nên audit log đi external service (CloudWatch, ELK). Tối thiểu: SA-only delete với approval chain
3. **Audit fail làm fail main request**: Nếu audit log DB write fail → main flow shouldn't fail. Solution: try/catch + log error riêng
4. **Quá nhiều log → performance hit**: Solution: log async (queue), retention policy

#### Key Takeaways
- **Audit log là last line of defense** khi tất cả khác fail - đừng skip thông tin quan trọng
- **Tách body khỏi metadata**: Body có thể chứa secret, metadata (IP/UA/status) không có. Skip body, không skip metadata
- **High-value flow = high audit detail**: Money flow, role changes, data exports - log đầy đủ
- **Compliance**: Vietnam accounting law yêu cầu 10 năm cho financial records - check retention policy

#### Learn More
- CWE-778: Insufficient Logging
- OWASP API10:2023 - Insufficient Logging & Monitoring
- [GDPR Article 30 - Records of Processing Activities](https://gdpr-info.eu/art-30-gdpr/)

---

### C-5. Customer list IDOR via query overwrite

#### Context (Vấn đề là gì)
IDOR (Insecure Direct Object Reference) là lỗi cho phép user truy cập object không thuộc về họ qua việc thay đổi parameter. Ví dụ: `/customers/123` - nếu không check ownership, user A xem được customer của user B.

CRM có pattern `buildAccessFilter(user)` để chống IDOR - tự động thêm `WHERE assigned_user_id = current_user.id` cho USER role. Bug là cách compose filter bị **override** bởi query param.

#### Root cause - Code hiện tại đang sai
File: `apps/api/src/modules/customers/customers.service.ts:42-51`
```ts
async list(query: ListCustomerDto, user: AccessFilterUser) {
  const where: any = {
    deletedAt: null,
    ...buildAccessFilter(user, 'customer'),  // set { assignedUserId: user.id } cho USER
  };

  // BUG - override scope bằng query param
  if (query.assignedUserId) {
    where.assignedUserId = BigInt(query.assignedUserId);  // OVERRIDE!
  }
  // ... query
}
```

Vấn đề: `buildAccessFilter` set `assignedUserId = user.id`. Nhưng sau đó if-check `query.assignedUserId` ghi đè bất kể role nào.

So sánh với `leads.service.ts:67` (đúng):
```ts
// OK pattern - check role trước khi override
if (query.assignedUserId && user?.role !== UserRole.USER) {
  where.assignedUserId = BigInt(query.assignedUserId);
}
```

#### Attack scenario
**Setup**: USER Lan (id=5) đăng nhập, JWT có role=USER.

**Exploit step-by-step**:
1. Lan vào trang Customers → URL `/dashboard/customers` → API call `GET /api/v1/customers`
2. Mở DevTools, gõ console:
   ```js
   fetch('/api/proxy/customers?assignedUserId=10', { credentials: 'include' })
     .then(r => r.json()).then(console.log)
   ```
3. Server xử lý: `buildAccessFilter` set `assignedUserId = 5`, sau đó query param override thành `10`
4. SQL: `SELECT * FROM customers WHERE deleted_at IS NULL AND assigned_user_id = 10`
5. Lan thấy **toàn bộ customer của user id=10** (tên, SĐT, email, label, doanh thu)

**Impact**:
- Privacy leak (PII)
- Competitive intelligence (sale A spy KH sale B)
- Phishing nội bộ (Lan biết KH user 10 có deal lớn → spam liên hệ)

#### Fix - Code đúng

```ts
// apps/api/src/modules/customers/customers.service.ts:42-51
async list(query: ListCustomerDto, user: AccessFilterUser) {
  const where: any = {
    deletedAt: null,
    ...buildAccessFilter(user, 'customer'),  // USER -> { assignedUserId: user.id }
  };

  // FIX - chỉ cho phép override nếu KHÔNG phải USER role
  if (query.assignedUserId && user?.role !== UserRole.USER) {
    where.assignedUserId = BigInt(query.assignedUserId);
  }
  if (query.departmentId && user?.role !== UserRole.USER) {
    where.assignedDepartmentId = BigInt(query.departmentId);
  }
  if (query.status) {
    where.status = query.status;  // status filter OK cho mọi role
  }

  // ... rest of query
}
```

**Hoặc** giải pháp tốt hơn - định nghĩa rõ ràng:
```ts
// Tạo enum cho ai được override scope
function canOverrideScope(user: AccessFilterUser, field: 'assignedUserId' | 'departmentId'): boolean {
  if (user.role === UserRole.SUPER_ADMIN) return true;
  if (user.role === UserRole.MANAGER) return true;  // hoặc check dept ownership
  return false;  // USER không bao giờ override
}

if (query.assignedUserId && canOverrideScope(user, 'assignedUserId')) {
  where.assignedUserId = BigInt(query.assignedUserId);
}
```

#### Common Pitfalls
1. **Spread order trap**: `{ ...buildAccessFilter(), ...query }` - spread sau đè scope. Phải spread query trước, scope sau, hoặc explicit assign
2. **Filter chỉ ở list endpoint**: Forget `findById`, `findFirst`, `update`, `delete` - mỗi method phải apply scope riêng
3. **Trust frontend not to send param**: "UI không cho user gõ assignedUserId" không phải defense - attacker dùng curl/Postman
4. **Bypass qua nested filter**: Nếu query có `{ where: { OR: [...] } }` - OR có thể bypass scope. Phải AND scope với toàn bộ query

#### Key Takeaways
- **Defense in depth**: Server PHẢI verify - đừng tin client
- **Scope filter ở SERVICE layer**, không phải controller (controller dễ quên)
- **Test với role thấp**: Khi test, login với USER role và thử mọi query param thay vì SA
- **Code review pattern**: Mọi `query.X` override `where.X` đều phải check role

#### Learn More
- CWE-639: Authorization Bypass Through User-Controlled Key
- OWASP A01:2021 - Broken Access Control
- [PortSwigger IDOR](https://portswigger.net/web-security/access-control/idor)

---

### C-6. Dashboard drill-down endpoint thiếu @Roles

#### Context (Vấn đề là gì)
Endpoint `/dashboard/employee-reports/sales-breakdown/customers` là drill-down xem customer của một employee cụ thể. Theo business rule, chỉ MANAGER+ mới được xem report nhân viên cấp dưới.

Pattern code: Mọi endpoint `employee-reports/*` khác đều có `@Roles(MANAGER, SUPER_ADMIN)`. Endpoint này quên decorator.

#### Root cause - Code hiện tại đang sai
File: `apps/api/src/modules/dashboard/dashboard.controller.ts:112-141`
```ts
@Controller('dashboard')
@UseGuards(JwtAuthGuard)  // chỉ check login, không check role
export class DashboardController {

  @Get('employee-reports/sales-breakdown')
  @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)  // OK
  async getSalesBreakdown(...) {}

  @Get('employee-reports/sales-breakdown/customers')  // BUG - missing @Roles
  async getSalesBreakdownCustomers(
    @Query('userId') userId: string,  // userId từ query - bất kỳ id nào
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.service.getEmployeeSalesBreakdownCustomers(
      BigInt(userId), startDate, endDate
    );
  }
}
```

`@Roles()` ở method level - không có ở method này → fallback global guard (chỉ check JWT, không check role).

#### Attack scenario
**Exploit (đơn giản 1 request)**:
1. USER Lan login
2. Lan call: `GET /api/v1/dashboard/employee-reports/sales-breakdown/customers?userId=99&startDate=2026-01-01&endDate=2026-12-31`
3. Server không có role check → execute query
4. Return: List khách hàng của user 99 với revenue, đơn hàng, label
5. Lan iterate `userId=1, 2, 3, ...` → harvest toàn bộ portfolio mọi sale

#### Fix - Code đúng

```ts
@Get('employee-reports/sales-breakdown/customers')
@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)  // ADD THIS LINE
async getSalesBreakdownCustomers(...) { ... }
```

**Better**: Lift `@Roles` lên class level cho consistent
```ts
@Controller('dashboard/employee-reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)  // class-level - apply tất cả method
export class EmployeeReportsController {
  // tất cả endpoint đều require MANAGER+
}
```

**Even better**: Service cũng check dept scope (combined với C-2)
```ts
async getEmployeeSalesBreakdownCustomers(
  targetUserId: bigint,
  startDate: string,
  endDate: string,
  currentUser: AccessFilterUser,  // ADD param
) {
  const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId } });
  if (!targetUser) throw new NotFoundException();

  // Manager chỉ xem report của user cùng dept
  await this.deptHelper.assertDeptAccess(currentUser, targetUser.departmentId);

  // ... query report
}
```

#### Common Pitfalls
1. **Forget decorator khi copy-paste method**: Pattern chính - dev copy method khác rồi quên thêm `@Roles`. Solution: class-level decorator
2. **Roles check không có RolesGuard**: `@Roles()` chỉ làm việc nếu `RolesGuard` được apply. Project này có global `RolesGuard` nên OK
3. **`@Roles()` không kết hợp với scope check**: User có role đúng vẫn có thể abuse cross-dept (combined với C-2). Cần cả 2 layer
4. **Quên test với role thấp**: QA test với SA → không phát hiện bug

#### Key Takeaways
- **Class-level decorators** an toàn hơn method-level - khó miss
- **Defense in depth**: role check (controller) + scope check (service) + ownership filter (repository)
- **Linting rule**: Custom ESLint rule "every controller method must have @Roles" (advanced)
- **Code review checklist**: Mọi PR thêm endpoint mới phải verify @Roles

#### Learn More
- CWE-862: Missing Authorization
- OWASP API5:2023 - Broken Function Level Authorization
- [NestJS Authorization](https://docs.nestjs.com/security/authorization)

---

### C-7. Activities module hoàn toàn không có ownership check

#### Context (Vấn đề là gì)
Module `activities` quản lý timeline (lịch sử) của lead/customer: note, call log, status change. Đây là dữ liệu rất nhạy cảm - chứa thông tin chăm sóc khách, ghi chú cá nhân, lịch sử đàm phán giá.

Đáng lẽ: chỉ owner của lead/customer mới được xem/ghi activity của entity đó.

#### Root cause - Code hiện tại đang sai
File: `apps/api/src/modules/activities/activities.service.ts:51-96`
```ts
async getTimeline(entityType: 'LEAD' | 'CUSTOMER', entityId: bigint, limit: number, cursor?: string) {
  // BUG - chỉ check entity tồn tại, không check user có quyền xem entity
  const entity = entityType === 'LEAD'
    ? await this.prisma.lead.findUnique({ where: { id: entityId } })
    : await this.prisma.customer.findUnique({ where: { id: entityId } });
  if (!entity) throw new NotFoundException();

  // Trả tất cả activity của entity - không scope theo user
  return this.prisma.activity.findMany({
    where: { entityType, entityId },
    take: limit,
    // ...
  });
}

async createNote(entityType, entityId, userId, content) {
  // BUG - không check user có quyền ghi note vào entity này không
  return this.prisma.activity.create({
    data: { entityType, entityId, userId, type: 'NOTE', content }
  });
}
```

File: `apps/api/src/modules/activities/activities.controller.ts:27-74`
```ts
@Get('leads/:id/activities')
async leadTimeline(@Param('id') id: string, ...) {
  // BUG - không truyền user xuống service, không check ownership
  return this.service.getTimeline('LEAD', BigInt(id), ...);
}
```

#### Attack scenario
**Scenario A - Read tampering**:
1. USER Lan đọc URL bar khi Tuấn (cùng phòng) xem lead `/dashboard/leads/789`
2. Lan call: `GET /api/v1/leads/789/activities`
3. Server không check → trả full timeline của lead 789
4. Lan đọc note: "Khách hàng quan tâm gói VIP, giá thương lượng 50tr, sẽ confirm thứ 5"
5. Lan dùng info phishing khách hàng đó

**Scenario B - Write tampering**:
1. Lan call: `POST /api/v1/leads/789/activities/notes` với body `{ content: "Khách phàn nàn về sale Tuấn, đòi đổi sale" }`
2. Server không check → ghi note vào lead 789 với `userId = Lan.id`
3. Manager xem lead 789 → thấy note có vẻ chính thức → mất niềm tin vào Tuấn
4. **Worse**: Lan có thể giả mạo `userId` (mass assignment) → ghi note với userId của người khác

**Scenario C - Stats spy**:
1. Lan call `GET /api/v1/dashboard/activities/stats?departmentId=99`
2. Trả số liệu hoạt động dept 99 (số call, số note) → tình báo cạnh tranh nội bộ

#### Fix - Code đúng

**Bước 1**: Service nhận user + delegate ownership check
```ts
// apps/api/src/modules/activities/activities.service.ts
async getTimeline(
  entityType: 'LEAD' | 'CUSTOMER',
  entityId: bigint,
  user: AccessFilterUser,  // NEW param
  limit: number,
  cursor?: string,
) {
  // Delegate ownership check cho service tương ứng - throws 404 nếu no access
  if (entityType === 'LEAD') {
    await this.leadsService.findById(entityId, user);
    // ^ findById đã apply buildAccessFilter - throw 404 nếu user không thấy lead
  } else {
    await this.customersService.findById(entityId, user);
  }

  // Sau khi ownership verified, query activities
  return this.prisma.activity.findMany({
    where: { entityType, entityId },
    take: limit,
    // ...
  });
}

async createNote(entityType, entityId, user: AccessFilterUser, content: string) {
  // Same ownership check
  if (entityType === 'LEAD') {
    await this.leadsService.findById(entityId, user);
  } else {
    await this.customersService.findById(entityId, user);
  }

  return this.prisma.activity.create({
    data: {
      entityType,
      entityId,
      userId: user.id,  // FORCE userId từ JWT, không trust request body
      type: 'NOTE',
      content,
    },
  });
}
```

**Bước 2**: Controller pass user xuống
```ts
@Get('leads/:id/activities')
async leadTimeline(
  @Param('id', ParseBigIntPipe) id: bigint,
  @CurrentUser() user: AccessFilterUser,  // ADD
  @Query('limit') limit = 20,
  @Query('cursor') cursor?: string,
) {
  return this.service.getTimeline('LEAD', id, user, limit, cursor);
}

@Post('leads/:id/activities/notes')
async createLeadNote(
  @Param('id', ParseBigIntPipe) id: bigint,
  @CurrentUser() user: AccessFilterUser,  // ADD
  @Body() body: { content: string },
) {
  return this.service.createNote('LEAD', id, user, body.content);
}
```

**Bước 3**: Stats endpoint check role
```ts
@Get('activities/stats')
@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)  // restrict to MANAGER+
async getStats(
  @CurrentUser() user: AccessFilterUser,
  @Query('departmentId') deptId?: string,
) {
  if (deptId) {
    await this.deptHelper.assertDeptAccess(user, BigInt(deptId));
  }
  return this.service.getStatsByDepartment(deptId ? BigInt(deptId) : null, user);
}
```

#### Common Pitfalls
1. **Circular dependency**: Activities service inject LeadsService - cần check schema. Solution: tạo `LeadAccessGuard` shared module hoặc dùng common helper
2. **Service quên `user` param ở 1 method**: Easy to miss. Solution: TypeScript bắt buộc `user` param ở interface
3. **`userId` từ request body**: Nếu DTO có `userId` optional → mass assignment. Phải force `userId = user.id` từ JWT
4. **Audit log của audit log**: Activities là audit trail của business. Nếu activities bị tamper, business log mất - cần riêng audit log cho `activities.delete`

#### Key Takeaways
- **Composition over duplication**: Inject service đã có ownership check thay vì viết lại logic
- **Force identity từ JWT**: User ID, dept ID không bao giờ trust từ request body
- **Timeline = audit trail**: Treat with same seriousness as audit log
- **Cascade ownership**: Permission của activity = permission của parent entity (lead/customer)

#### Learn More
- CWE-285: Improper Authorization
- CWE-639: Authorization Bypass Through User-Controlled Key
- OWASP A01:2021

---

### C-8. Customer/Lead transfer flaw cho manager unowned entities

#### Context (Vấn đề là gì)
Theo business rule: lead/customer chưa được assign user (`assignedUserId = NULL`) nằm trong "kho mới" (POOL) hoặc "kho thả nổi" (FLOATING). Manager dept A chỉ được phép transfer entities thuộc dept A.

Code có pattern `checkTransferPermission` để verify. Bug ở edge case manager + entity không có assignedUser.

#### Root cause - Code hiện tại đang sai
File: `apps/api/src/modules/customers/customers.service.ts:241-288` (và `leads.service.ts:987-1003` cùng pattern)
```ts
async checkTransferPermission(customer: Customer, user: AccessFilterUser) {
  if (user.role === UserRole.SUPER_ADMIN) return;

  // User đang giữ thì OK
  if (customer.assignedUserId === user.id) return;

  // Manager case
  if (user.role === UserRole.MANAGER) {
    // BUG - manager + customer chưa có assignee → return ngay không check dept
    if (!customer.assignedUserId) return;  // !!! WRONG

    // Check manager có quản lý dept của customer không (chỉ chạy khi có assignedUserId)
    const managed = await this.prisma.managerDepartment.findUnique({
      where: { userId_departmentId: { userId: user.id, departmentId: customer.assignedDepartmentId } }
    });
    if (managed) return;
  }

  throw new ForbiddenException('Không có quyền transfer');
}
```

Logic sai: `if (!customer.assignedUserId) return` cho phép manager bất kỳ transfer entity không có assignee, không kiểm tra dept.

#### Attack scenario
**Setup**: Manager Tuấn (dept A), Manager Hùng (dept B). Lead #500 thuộc dept B nhưng chưa assign user (status POOL).

**Exploit**:
1. Tuấn (dept A) call: `POST /api/v1/leads/500/transfer` với body `{ targetType: 'DEPARTMENT', departmentId: '<dept A id>' }`
2. `findById(500)` không truyền user → trả lead bất kỳ (cần fix riêng, hoặc đây cũng là gap)
3. `checkTransferPermission(lead, Tuấn)`:
   - role = MANAGER → vào nhánh manager
   - `!lead.assignedUserId` (vì POOL) → **return ngay (không check dept)**
4. Lead 500 transfer thành công về dept A
5. Sales dept A claim lead → cướp lead dept B

**Scenario B - Kho thả nổi**:
- Lead `FLOATING` (kho thả nổi, all users claim được) - đây là rule đúng cho USER role
- Nhưng MANAGER transfer FLOATING lead về dept mình → cướp lead khỏi kho chung

#### Fix - Code đúng

```ts
async checkTransferPermission(entity: Lead | Customer, user: AccessFilterUser) {
  if (user.role === UserRole.SUPER_ADMIN) return;

  if (entity.assignedUserId === user.id) return;  // user đang giữ

  if (user.role === UserRole.MANAGER) {
    // Trường hợp 1: entity có assignee và có dept
    if (entity.assignedUserId && entity.assignedDepartmentId) {
      const managed = await this.prisma.managerDepartment.findUnique({
        where: {
          userId_departmentId: {
            userId: user.id,
            departmentId: entity.assignedDepartmentId,
          },
        },
      });
      if (managed) return;
    }

    // Trường hợp 2: entity chưa có assignee NHƯNG có dept (POOL với dept)
    if (!entity.assignedUserId && entity.assignedDepartmentId) {
      const managed = await this.prisma.managerDepartment.findUnique({
        where: {
          userId_departmentId: {
            userId: user.id,
            departmentId: entity.assignedDepartmentId,
          },
        },
      });
      if (managed) return;
    }

    // Trường hợp 3: entity FLOATING hoặc Kho Mới no-dept
    // → Manager KHÔNG được transfer (đây là quyền của SA)
    // Lead/Customer FLOATING phải qua flow claim (USER), không phải transfer
  }

  throw new ForbiddenException('Không có quyền transfer entity này');
}
```

**Lưu ý**: Cần `findById(id, user)` để scope - vấn đề riêng nhưng cùng theme C-5/C-7. Nếu `findById` đã scope thì manager không thấy entity ngoài dept → câu hỏi này ít gặp. Nhưng defense in depth nên check cả 2 layer.

#### Common Pitfalls
1. **Pattern matching không exhaustive**: Code chỉ cover happy path (entity có cả assignedUserId + dept) mà quên POOL no-dept, FLOATING. Solution: switch-case explicit cho mọi state
2. **Quên test với POOL/FLOATING**: QA test với lead ASSIGNED → không phát hiện. Test matrix phải cover mọi status
3. **Hard-code dept null = "ai cũng được"**: Pattern sai. Null không phải permission, là missing data
4. **Race condition trong transfer**: 2 manager transfer cùng lead đồng thời - dùng `updateMany với guard` thay vì find+update

#### Key Takeaways
- **Permission logic phải exhaustive**: Liệt kê mọi case explicit, default = deny
- **NULL không phải permission**: `assignedUserId IS NULL` không có nghĩa "ai cũng được transfer" - phải check business rule
- **Floating vs POOL có rule khác nhau**: USER claim FLOATING OK, MANAGER transfer FLOATING không OK
- **Code review checklist**: Mọi nhánh `if (!X) return` phải explicit lý do return

#### Learn More
- CWE-863: Incorrect Authorization
- OWASP A01:2021

---

### C-9. Next.js 15.5.14 - middleware bypass family advisories

#### Context (Vấn đề là gì)
Next.js publish 10 security advisories đầu tháng 5/2026 cho App Router. Trong đó có 3 HIGH "Middleware / Proxy bypass" cùng family với CVE-2025-29927 (cũ, đã fix nhưng có biến thể mới).

Project dùng Next.js `15.5.14`, advisories patched ở `15.5.16+`.

#### Root cause - Code hiện tại đang sai
File: `apps/web/package.json:27`
```json
{
  "dependencies": {
    "next": "^15.3.0"  // resolve to 15.5.14 (vulnerable)
  }
}
```

Middleware tại `apps/web/src/middleware.ts:26-48` dùng để protect routes `/dashboard/*`. Vulnerability cho phép bypass middleware bằng craft request đặc biệt.

#### Attack scenario
**CVE-2025-29927 family pattern** (chi tiết advisories chưa public hết):
1. Attacker craft request với header `x-middleware-subrequest: middleware:middleware:middleware:...` (recursive)
2. Next.js middleware engine có bug parse header → skip middleware execution
3. Request đến page handler mà không qua auth check
4. Page render với fake "no auth" state

**Combined với C-7 (frontend FIND-003)**: Edge middleware không verify JWT signature → middleware bypass + invalid token = render page như đã auth.

**Actual exploit phụ thuộc** vào page rendering pattern:
- Server Components fetch /auth/me → backend verify token signature → return 401 → catch → user=null → page render với user=null
- Nhưng nếu page có logic `if (typeof user !== 'undefined')` thay vì `if (user)` → render data trước khi check

#### Fix - Code đúng

**Bước 1**: Update Next.js
```bash
cd "F:/Vibe Coding/crm-v4"
pnpm --filter @crm/web up next@^15.5.16
pnpm install
```

**Bước 2**: Verify
```bash
pnpm list next
# Expected output: next 15.5.16 (or higher)

pnpm audit --audit-level=high
# Expected: 14 HIGH related to next → 0
```

**Bước 3**: Build + test
```bash
pnpm --filter @crm/web build
# Verify build success - no breaking changes

# Manual test sau update:
# 1. Login flow
# 2. Middleware redirect khi không có cookie
# 3. Refresh token rotation
# 4. API call có Authorization header đúng
```

**Bước 4** (defense in depth, related C-10 idor FIND-006): Migrate middleware sang Node runtime để verify JWT signature
```ts
// apps/web/src/middleware.ts
export const config = {
  matcher: ['/dashboard/:path*'],
  runtime: 'nodejs',  // ADD - dùng Node runtime để access crypto.verify
};

import { verify } from 'jsonwebtoken';

export function middleware(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;

  if (!token) {
    return redirectToLogin(request);
  }

  try {
    verify(token, process.env.JWT_SECRET!);  // FULL signature verify
    return NextResponse.next();
  } catch {
    return redirectToLogin(request);
  }
}
```

**Trade-off**: Node runtime middleware tăng latency ~50ms vs Edge runtime nhưng auth chính xác.

#### Common Pitfalls
1. **`pnpm up` không hit transitive deps**: Phải `pnpm audit` lại sau update để verify. Một số vuln là transitive (hono, vite, fast-uri)
2. **Breaking change trong minor version**: Next.js 15.5.x supposedly patch-only nhưng đôi khi có change. Test E2E sau update
3. **Update one place forget another**: Monorepo có `package.json` ở root + apps - phải update đúng workspace
4. **Pinned version block update**: Nếu `package.json` ghi `15.5.14` (no caret) → `pnpm up` không bump. Phải sửa manual

#### Key Takeaways
- **Patch dependencies thường xuyên**: Setup `dependabot` hoặc `renovate` cho auto-PR weekly
- **Audit ở CI**: Add `pnpm audit --audit-level=high` vào CI - fail build nếu có HIGH unpatched
- **Subscribe vendor security**: Follow @vercel/next.js GitHub security advisories
- **Middleware = routing only**: Không trust nó cho auth - mọi server component vẫn phải verify

#### Learn More
- [Next.js Security Advisories](https://github.com/vercel/next.js/security/advisories)
- CVE-2025-29927: Original middleware bypass
- CWE-285: Improper Authorization
- OWASP A06:2021 - Vulnerable and Outdated Components

---

## Tổng kết Phần 1 - Critical Findings

9 Critical findings với pattern chung:
1. **Authorization gaps**: 5 findings (C-2, C-5, C-6, C-7, C-8) - chia thành IDOR (query override), missing @Roles, no ownership check
2. **Money flow integrity**: 3 findings (C-1, C-3, C-4) - webhook signature, race condition, audit gap
3. **Dependency**: 1 finding (C-9) - Next.js outdated

### Ưu tiên fix (giữ nguyên P0 trong master report)

```bash
# Day 1 (4-6h)
pnpm up next@^15.5.16 -w           # C-9 (1 command)
# Fix C-5 (5 lines code)
# Fix C-6 (1 line @Roles)
# Fix L-1 Math.random

# Day 2-3 (16-20h)
# Webhook chain (C-1 + C-3 + C-4 + H-8/9/10)
# Activities ownership (C-7) - 3 endpoints

# Day 3-5 (8-12h)
# MANAGER dept scoping (C-2 + C-8 + 8 modules)
```

### Common Themes
- **Spread/override order trap** (C-5): `{ ...filter, ...override }` mà không check role
- **Missing decorator trap** (C-6): copy method quên `@Roles`
- **`if (!X) return` trap** (C-8): exhaustive case check không đủ
- **Pre-parse vs post-parse data** (C-1): HMAC trên parsed body

### Câu hỏi tiếp theo cho bạn
Bạn muốn tôi tiếp tục giải thích chi tiết:
- **Phần 2**: 29 High findings (most impactful sau Critical)
- **Phần 3**: 32 Medium findings (sprint tới)
- **Phần 4**: 15 Low/Info findings (backlog)

Hay tập trung 1 nhóm cụ thể (ví dụ: chỉ giải thích những finding liên quan đến webhook, hoặc chỉ liên quan IDOR)?

---

## Status

**Status**: DONE (Part 1 - Critical only)

**Summary**: Đã walkthrough 9 Critical findings với context + root cause + attack scenario + fix code + pitfalls + takeaways. Mỗi finding ~150-200 dòng giải thích chi tiết theo junior dev style.

**Next**: Đợi user confirm scope tiếp theo (Part 2 High / Part 3 Medium / Part 4 Low hoặc grouped theme).
