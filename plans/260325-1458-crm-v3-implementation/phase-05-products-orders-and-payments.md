---
phase: 5
title: "Products, Orders & Payments"
status: completed
priority: P0
effort: 16h
depends_on: [3]
---

# Phase 05: Products, Orders & Payments

## Context Links

- Product/Order/Payment models: `plans/reports/brainstorm-260325-1224-internal-crm-system-design.md` (line 114-158)
- Conversion rule: brainstorm (line 160)
- Scope limits: brainstorm (line 328) — NO accounting, NO inventory, NO invoicing

## Overview

Implement Product CRUD, Order management, Payment recording with **hybrid verification flow** (auto-match từ webhook + manual verify). Hỗ trợ partial payments (CK lần 1/2/3/4/full). Verified payment → lead conversion.

## Requirements

### Functional
- Product CRUD (super_admin/manager)
- ProductCategory CRUD (manager+)
- PaymentType CRUD (lookup table, super_admin). Types: CK lần 1, CK lần 2, CK lần 3, CK lần 4, CK full, COD, Tiền mặt
- Order CRUD: create (linked to lead + customer + product), update status, list by customer/lead
- **Payment creation:** Bất kỳ user nào cũng có thể tạo payment record (PENDING). Gồm: nội dung CK, số tiền, sản phẩm, type
- **Bank transaction webhook:** Bên thứ 3 push giao dịch ngân hàng → lưu vào bank_transactions
- **Hybrid verification:** Auto-match payment ↔ bank_transaction khi có thể. Batch cron mỗi 2h retry. Còn lại → manager verify thủ công
- Conversion trigger: khi tất cả payments của order được verify → lead converts to customer
- Order status lifecycle: PENDING → CONFIRMED → COMPLETED / CANCELLED / REFUNDED
- **CANCELLED/REFUNDED KHÔNG revert lead status.** Lead giữ CONVERTED, customer giữ nguyên. Refund là business flow riêng trên order. Customer đã tồn tại, có thể có lead khác.

### Non-Functional
- Decimal precision for amounts (2 decimal places)
- Payment verification audit trail (who verified, when, auto/manual)
- Hỗ trợ partial payments: 1 order có nhiều payment records (CK lần 1, lần 2...)

## Architecture

### Module Structure
```
apps/api/src/modules/
├── products/
│   ├── products.module.ts
│   ├── products.controller.ts
│   ├── products.service.ts
│   ├── products.repository.ts
│   └── dto/
├── product-categories/
│   ├── product-categories.module.ts
│   ├── product-categories.controller.ts
│   ├── product-categories.service.ts
│   └── dto/
├── orders/
│   ├── orders.module.ts
│   ├── orders.controller.ts
│   ├── orders.service.ts
│   ├── orders.repository.ts
│   └── dto/
│       ├── create-order.dto.ts
│       ├── update-order-status.dto.ts
│       └── order-query.dto.ts
├── payments/
│   ├── payments.module.ts
│   ├── payments.controller.ts
│   ├── payments.service.ts
│   ├── payments.repository.ts
│   ├── payment-matching.service.ts   # Auto-match logic
│   └── dto/
│       ├── create-payment.dto.ts
│       ├── verify-payment.dto.ts
│       └── payment-query.dto.ts
├── bank-transactions/
│   ├── bank-transactions.module.ts
│   ├── bank-transactions.controller.ts
│   ├── bank-transactions.service.ts
│   ├── bank-transactions.repository.ts
│   └── dto/
│       ├── ingest-bank-transaction.dto.ts
│       └── match-bank-transaction.dto.ts
├── payment-types/
│   ├── payment-types.module.ts
│   ├── payment-types.controller.ts
│   ├── payment-types.service.ts
│   └── dto/
```

### Payment Hybrid Verification Flow
```
═══ LUỒNG A: Sale tạo payment ═══
Sale tạo payment (nội dung CK, số tiền, type)
  → status = PENDING
  → Tìm trong bank_transactions UNMATCHED (amount + content khớp)
  → Match → auto-verify (verified_source = AUTO)
  → Không match → giữ PENDING, chờ webhook hoặc manager

═══ LUỒNG B: Webhook từ cổng thanh toán ═══
Bên thứ 3 POST /webhooks/bank-transactions (API key auth)
  → Lưu vào bank_transactions (dedup bằng external_id)
  → Tìm trong payments PENDING (amount + content khớp)
  → Match → auto-verify payment
  → Không match → bank_transaction.match_status = UNMATCHED

═══ LUỒNG C: Batch catch-up (cron mỗi 2h) ═══
Cron job:
  → Lấy payments PENDING + bank_transactions UNMATCHED
  → Fuzzy match (amount khớp + content tương tự + thời gian ±24h)
  → Match → auto-verify
  → Vẫn không match → giữ nguyên cho manager

═══ LUỒNG D: Manager verify thủ công ═══
Trang "Giao dịch chờ xác minh":
  → Thấy: payments PENDING + bank_transactions UNMATCHED
  → Ghép thủ công: link bank_transaction → payment
  → Hoặc: verify mà không cần bank_transaction (COD, tiền mặt)
  → Hoặc: reject payment sai
  → verified_source = MANUAL

═══ Conversion trigger ═══
Khi payment verified → check order:
  → Nếu tổng payments verified >= order.amount → lead.status = CONVERTED
  → Tạo/update customer record, log activity
```

### Auto-Match Logic
```
1. Exact match: amount khớp CHÍNH XÁC + payment.transfer_content
   nằm trong bank_transaction.content (substring match)
2. Fuzzy match (batch only): amount khớp + Levenshtein(content) > 0.7
   + transaction_time trong ±24h của payment.created_at
3. Ambiguous (>1 candidate): KHÔNG auto-match, đẩy cho manager
```

### API Endpoints

**Products:**
- `GET /products` — list active, cursor paginated
- `GET /products/:id` — detail
- `POST /products` — create (manager+)
- `PATCH /products/:id` — update (manager+)
- `DELETE /products/:id` — soft delete (super_admin)

**Product Categories:**
- `GET /product-categories` — list active
- `POST /product-categories` — create (manager+)
- `PATCH /product-categories/:id` — update (manager+)
- `DELETE /product-categories/:id` — deactivate (super_admin)

**Payment Types:**
- `GET /payment-types` — list active
- `POST /payment-types` — create (super_admin)
- `PATCH /payment-types/:id` — update (super_admin)
- `DELETE /payment-types/:id` — deactivate (super_admin)

**Orders:**
- `GET /orders` — list, filter by status/customer/lead/user/date
- `GET /orders/:id` — detail with payments + bank transactions
- `POST /orders` — create (any auth user, linked to their assigned lead)
- `PATCH /orders/:id/status` — update status (manager+)
- `DELETE /orders/:id` — soft delete (super_admin, only PENDING orders)

**Payments:**
- `GET /payments` — list, filter by status/order
- `GET /payments/:id` — detail with matched bank_transaction
- `POST /payments` — create for order (any auth user). Fields: transfer_content, amount, payment_type_id
- `POST /payments/:id/verify` — verify thủ công (manager+), optional link bank_transaction_id
- `POST /payments/:id/reject` — reject payment (manager+)
- `GET /payments/pending` — list payments chờ xác minh (manager+)

**Bank Transactions (webhook):**
- `POST /webhooks/bank-transactions` — ingest từ cổng TT (API key auth)
- `GET /bank-transactions` — list, filter by match_status (manager+)
- `GET /bank-transactions/unmatched` — unmatched queue (manager+)
- `POST /bank-transactions/:id/match` — ghép thủ công với payment (manager+)

## Related Code Files

### Create
- `apps/api/src/modules/products/` — all product files
- `apps/api/src/modules/orders/` — all order files
- `apps/api/src/modules/payments/` — all payment files
- `apps/api/src/modules/payment-types/` — all payment-type files

### Modify
- `apps/api/src/app.module.ts` — register modules
- `apps/api/src/modules/leads/leads.service.ts` — add conversion method (or call from payments)
- `packages/types/src/` — Product, Order, Payment interfaces

## Implementation Steps

1. **Implement PaymentTypes module**
   - Simple lookup table CRUD, super_admin only for writes
   - Seed: Bank Transfer, COD, Installment, Cash

2. **Implement ProductCategories module**
   - Simple CRUD, super_admin/manager for writes
   - `GET /product-categories` — list active categories
   - `POST /product-categories` — create (manager+)
   - `PATCH /product-categories/:id` — update (manager+)
   - `DELETE /product-categories/:id` — deactivate (super_admin)

3. **Implement Products module**
   - CRUD with Decimal price field, optional categoryId FK
   - Status: ACTIVE/INACTIVE enum
   - Manager+ for create/update, super_admin for delete

3. **Implement Orders module**
   - SECURITY: Apply buildAccessFilter pattern (from Phase 04) to ALL order queries
     - User sees only orders linked to their assigned leads/customers
     - Manager sees orders in their managed departments
     - Super admin sees all
     - Never fetch order by ID alone without access check
   - `orders.repository.ts`: queries with lead, customer, product, payments joins
   - `orders.service.ts`:
     - Create: validate lead exists + assigned to current user (or manager), validate product active
     - Status update: validate transition (PENDING→CONFIRMED→COMPLETED, PENDING→CANCELLED, COMPLETED→REFUNDED)
     - List: cursor pagination with filters
   - Guard: order creator or manager+ can modify

4. **Implement Payments module**
   - `payments.service.ts`:
     - **Create:** validate order exists, set status=PENDING. Gồm: transfer_content, amount, payment_type_id
       - Sau khi tạo → gọi `paymentMatchingService.tryMatch(payment)` để tìm bank_transaction khớp
       - Nếu match → auto-verify ngay
     - **Verify (manual):** manager+ verify thủ công, optional link bank_transaction_id
       - SECURITY: Pessimistic locking chống double-verify:
       ```
       await prisma.$transaction(async (tx) => {
         const payment = await tx.$queryRaw`
           SELECT * FROM payments WHERE id = ${paymentId} FOR UPDATE
         `
         if (payment.status !== 'PENDING') {
           throw new ConflictException('Payment already processed')
         }
         await tx.payment.update({
           where: { id: paymentId },
           data: { status: 'VERIFIED', verifiedBy: userId, verifiedAt: new Date(),
                   verifiedSource: 'MANUAL', matchedBankTransactionId: bankTxId || null }
         })
         // Nếu có bankTxId → update bank_transaction.match_status
         if (bankTxId) {
           await tx.bankTransaction.update({
             where: { id: bankTxId },
             data: { matchedPaymentId: paymentId, matchStatus: 'MANUALLY_MATCHED' }
           })
         }
       })
       ```
       - Sau verify → check conversion trigger
     - **Reject:** set status=REJECTED, verified_by, verified_at, reason
   - Validation in create-payment.dto.ts:
     - amount > 0
     - Tổng amount payments của order không vượt quá order.totalAmount
     - Decimal precision: max 2 decimal places
   - **Conversion trigger** (gọi sau mỗi lần verify):
     - Tính tổng amount của tất cả payments VERIFIED cho order
     - Nếu tổng >= order.totalAmount → gọi `leadsService.convertLead(leadId)`
     - Tạo/update customer, set lead status=CONVERTED, log activity

5. **Implement BankTransactions module**
   - `bank-transactions.controller.ts`:
     - `POST /webhooks/bank-transactions` — API key auth, ingest webhook
     - `GET /bank-transactions` — list (manager+)
     - `GET /bank-transactions/unmatched` — unmatched queue (manager+)
     - `POST /bank-transactions/:id/match` — ghép thủ công `{ paymentId }` (manager+)
   - `bank-transactions.service.ts`:
     - **Ingest:** validate + dedup bằng external_id → lưu raw data
       - Sau lưu → gọi `paymentMatchingService.tryMatchBankTx(bankTx)` để tìm payment khớp
     - **Manual match:** link bank_transaction ↔ payment → verify payment

6. **Implement PaymentMatching service**
   - `payment-matching.service.ts` (shared service, inject vào cả Payments + BankTransactions module):
     - `tryMatch(payment)`: tìm bank_transactions UNMATCHED với amount khớp + content match
     - `tryMatchBankTx(bankTx)`: tìm payments PENDING với amount khớp + content match
     - Match logic:
       1. **Exact:** amount === bankTx.amount AND bankTx.content.includes(payment.transferContent)
       2. Chỉ match nếu DUY NHẤT 1 candidate. Nếu >1 → skip (đẩy cho manager)
     - Khi match thành công: update cả 2 bên trong transaction → trigger verify flow

7. **Implement batch catch-up cron**
   - Cron `@Cron('0 */2 * * *')` (mỗi 2h):
     - Lấy payments PENDING + bank_transactions UNMATCHED
     - Fuzzy match: amount khớp + Levenshtein(content) > 0.7 + thời gian ±24h
     - Match DUY NHẤT 1 candidate → auto-verify
     - Log kết quả batch

8. **Wire up cross-module dependencies**
   - PaymentsModule imports LeadsModule (for conversion trigger)
   - PaymentMatchingService shared giữa Payments + BankTransactions modules
   - Use EventEmitter2: payment.verified event → leads listener (loose coupling)

9. **Test end-to-end flows**
   - Flow A: Sale tạo payment → webhook đến sau → auto-match → verify → convert
   - Flow B: Webhook đến trước → sale tạo payment sau → auto-match → verify → convert
   - Flow C: Không match → batch cron catch-up → verify
   - Flow D: Vẫn không match → manager verify thủ công
   - Flow E: Partial payment (CK lần 1 + lần 2) → convert khi tổng đủ
   - Flow F: COD/tiền mặt → manager verify không cần bank_transaction
   - Test rejection flow
   - Test dedup webhook (external_id trùng → reject)

## Todo List

- [ ] Implement PaymentTypes CRUD module (seed: CK lần 1/2/3/4, CK full, COD, Tiền mặt)
- [ ] Implement ProductCategories CRUD module
- [ ] Implement Products CRUD module (with categoryId FK)
- [ ] Implement Orders module (repo, service, controller)
- [ ] Implement order status transitions
- [ ] Implement Payments module (create, verify manual, reject)
- [ ] Implement BankTransactions module (webhook ingest, list, manual match)
- [ ] Implement PaymentMatching service (exact match logic)
- [ ] Implement batch catch-up cron (mỗi 2h, fuzzy match)
- [ ] Implement conversion trigger (tổng verified payments >= order.totalAmount)
- [ ] Wire cross-module dependencies (EventEmitter2)
- [ ] Add order query filters (status, customer, lead, date)
- [ ] Register all modules in AppModule
- [ ] Apply IDOR-safe queries to orders repository
- [ ] Implement pessimistic lock on payment verification
- [ ] Validate payment amount (> 0, tổng <= order.totalAmount)
- [ ] Test Flow A: sale tạo trước → webhook sau → auto-match
- [ ] Test Flow B: webhook trước → sale tạo sau → auto-match
- [ ] Test Flow C: batch cron catch-up
- [ ] Test Flow D: manager verify thủ công
- [ ] Test Flow E: partial payment → convert khi tổng đủ
- [ ] Test dedup webhook (external_id trùng)

## Success Criteria

- Product CRUD works with Decimal prices + categories
- Order created and linked to lead + customer + product
- Payment PENDING created by any user with transfer_content
- Webhook ingests bank_transaction, dedup bằng external_id
- Auto-match: payment ↔ bank_transaction khi amount + content khớp
- Batch cron: catch missed matches mỗi 2h
- Manager verify thủ công: ghép hoặc verify không cần bank_transaction
- Partial payments: convert khi tổng verified >= order.totalAmount
- Lead status → CONVERTED sau payment verified đủ
- Customer record created/updated on conversion
- Order status transitions validated
- Activity logged cho mọi verify/reject/conversion event

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Auto-match sai (false positive) | High | Chỉ match khi DUY NHẤT 1 candidate. Ambiguous → đẩy manager |
| Conversion race: double-verify | High | Pessimistic locking (SELECT FOR UPDATE) trong transaction |
| Webhook duplicate | Medium | Dedup bằng external_id unique constraint |
| Circular module dependency | Medium | EventEmitter2 cho loose coupling |
| Decimal precision loss | Medium | Prisma Decimal type, never convert to JS float |
| IDOR on orders/payments | Critical | buildAccessFilter trên mọi query |
| Payment amount manipulation | High | Validate tổng payments <= order.totalAmount |
| Batch cron fail | Low | Log errors, retry next cycle. Manager luôn có thể verify thủ công |
| Bank transaction content không chuẩn | Medium | Fuzzy match chỉ trong batch, exact trong real-time. Ambiguous → manager |
