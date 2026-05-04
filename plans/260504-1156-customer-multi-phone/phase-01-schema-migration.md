# Phase 01 — Schema + Migration

**Priority:** Critical (blocks all other phases)
**Status:** ⬜ Pending
**Estimate:** 1h

## Context

Thêm bảng `customer_phones` chứa số phụ. Giữ nguyên `customers.phone` làm số chính. Không migrate data — bảng mới rỗng từ đầu.

## Requirements

### Functional
- Mỗi Customer có thể có 0..N số phụ.
- Mỗi số phụ thuộc đúng 1 Customer (FK NOT NULL).
- Soft delete: số phụ xóa đi vẫn lưu lại để audit.
- Track ai thêm số (`createdBy`).

### Non-functional
- Query search by phone phải nhanh (index trên `phone`).
- Query dedup phải nhanh (composite index `(phone, deletedAt)`).
- Cascade delete: xóa customer → soft delete tất cả số phụ (do app handle, không CASCADE ở DB).

## Architecture

```
┌──────────┐   1     N   ┌────────────────┐
│ Customer │────────────→│ CustomerPhone  │
└──────────┘             └────────────────┘
     │                          │
     │ phone (số chính)         │ phone (số phụ)
     │ name                     │ label, note
     │ ...                      │ createdBy
                                │ deletedAt
```

## Related Code Files

### Modify
- `packages/database/prisma/schema.prisma` — Thêm model `CustomerPhone`, thêm relation vào `Customer` và `User`.

### Create
- `packages/database/prisma/migrations/{timestamp}_add_customer_phones/migration.sql` — Auto-generated.

## Implementation Steps

### Step 1: Thêm model `CustomerPhone` vào `schema.prisma`

Đặt **sau** model `Customer` (line ~278) và **trước** model `Lead` (line 280).

```prisma
model CustomerPhone {
  id         BigInt    @id @default(autoincrement())
  customerId BigInt    @map("customer_id")
  phone      String    // đã normalize trước khi lưu (qua normalizePhone util)
  label      String?   // "Vợ", "Thư ký", "Công ty"...
  note       String?   // ghi chú tự do
  createdBy  BigInt?   @map("created_by")
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")
  deletedAt  DateTime? @map("deleted_at")

  customer Customer @relation(fields: [customerId], references: [id])
  creator  User?    @relation("CustomerPhoneCreator", fields: [createdBy], references: [id])

  @@index([customerId])
  @@index([phone])
  @@index([phone, deletedAt])
  @@map("customer_phones")
}
```

### Step 2: Thêm relation vào model `Customer`

Trong block `model Customer { ... }` (line 247-278), thêm sau dòng `labels CustomerLabel[]` (line 273):

```prisma
phones CustomerPhone[]
```

### Step 3: Thêm relation vào model `User`

Tìm model `User`, thêm relation:

```prisma
createdCustomerPhones CustomerPhone[] @relation("CustomerPhoneCreator")
```

### Step 4: Generate migration

```bash
cd packages/database
pnpm db:migrate dev --name add_customer_phones
pnpm db:generate
```

### Step 5: Verify SQL

Mở migration SQL và kiểm tra:
- `CREATE TABLE customer_phones` đúng cột.
- 3 index được tạo.
- FK constraint với `customers(id)` và `users(id)`.

### Step 6: Smoke test

```bash
pnpm db:push  # nếu cần đẩy nhanh
pnpm db:studio  # mở Prisma Studio xác nhận bảng mới hiện ra
```

## Todo List

- [ ] Thêm model `CustomerPhone` vào schema.prisma
- [ ] Thêm relation `phones` vào Customer
- [ ] Thêm relation `createdCustomerPhones` vào User
- [ ] Chạy `pnpm db:migrate dev --name add_customer_phones`
- [ ] Chạy `pnpm db:generate`
- [ ] Verify migration SQL có 3 index
- [ ] Smoke test trên Prisma Studio

## Success Criteria

- [ ] Migration chạy thành công, không lỗi.
- [ ] Prisma Client generate ra type `CustomerPhone`.
- [ ] Bảng `customer_phones` xuất hiện trong DB với đúng schema + index.
- [ ] Backend build pass: `pnpm build` không lỗi type.

## Risk

| Risk | Mitigation |
|---|---|
| Conflict với migration cũ | Pull main mới nhất, rebase migration trước khi gen mới |
| Quên `pnpm db:generate` | Sẽ thấy ngay khi import `CustomerPhone` ở phase 02 — TS error |

## Security

- FK constraint NOT NULL → không tạo được orphan record.
- Soft delete `deletedAt` → audit trail không mất.

## Next Steps

Sau khi xong phase này:
- Phase 02 — viết helper service dùng các Prisma types mới.
