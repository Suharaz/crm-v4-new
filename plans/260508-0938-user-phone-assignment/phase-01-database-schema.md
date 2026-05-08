# Phase 01: Database Schema for User Phone Assignment

**Priority:** P0 (blocks all subsequent phases)
**Status:** Done
**Effort:** 1.5h

## Context Links

- Plan: [plan.md](./plan.md)
- Existing schema: `packages/database/prisma/schema.prisma`
- Existing partial-unique pattern: `packages/database/prisma/raw-indexes.sql`
- Reference - lead phone unique pattern: `idx_leads_phone_unique` trong raw-indexes.sql

## Overview

Tạo 2 model Prisma mới: `UserPhone` (current state) và `UserPhoneHistory` (audit trail). Thêm relations vào model `User`. Tạo migration + partial unique index để hỗ trợ soft delete.

## Key Insights

- DB convention: BIGINT IDENTITY PK, snake_case table/column, soft delete với `deleted_at`, partial unique index `WHERE deleted_at IS NULL`
- Phone field MUST normalize trước khi insert (giống `leads.phone`, `customers.phone`)
- Tách 2 bảng (current vs history) đơn giản hơn dùng activeFrom/activeUntil trong cùng bảng - query history gọn hơn, index nhỏ hơn

## Requirements

### Functional
- 1 phone chỉ thuộc 1 user tại 1 thời điểm (UNIQUE active)
- 1 user có thể giữ N phones (no upper limit)
- Audit: ghi `assigned_by` (user nào phân) + history khi chuyển/xóa
- Soft delete: cho phép re-assign số đã xóa cho user khác

### Non-functional
- Index hỗ trợ query: list theo userId, lookup theo phone (match cuộc gọi)
- Naming: `user_phones`, `user_phone_history` (snake_case @@map)

## Architecture

### Schema Diff

```prisma
// Add to User model relations:
userPhones        UserPhone[]        @relation("UserPhoneOwner")
userPhonesAssigned UserPhone[]       @relation("UserPhoneAssigner")
userPhoneHistory  UserPhoneHistory[] @relation("UserPhoneHistoryUser")
userPhoneChanges  UserPhoneHistory[] @relation("UserPhoneHistoryChanger")

// New models (place after Customer/CustomerPhone section):
model UserPhone {
  id         BigInt    @id @default(autoincrement())
  // phone partial unique index (WHERE deleted_at IS NULL) trong raw-indexes.sql
  // Cho phép re-assign số đã soft-delete cho user khác
  phone      String
  userId     BigInt    @map("user_id")
  assignedAt DateTime  @default(now()) @map("assigned_at")
  assignedBy BigInt    @map("assigned_by")
  note       String?
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")
  deletedAt  DateTime? @map("deleted_at")

  user     User @relation("UserPhoneOwner", fields: [userId], references: [id])
  assigner User @relation("UserPhoneAssigner", fields: [assignedBy], references: [id])

  @@index([userId, deletedAt])
  @@index([phone, deletedAt])
  @@map("user_phones")
}

model UserPhoneHistory {
  id         BigInt   @id @default(autoincrement())
  phone      String
  userId     BigInt   @map("user_id")
  assignedAt DateTime @map("assigned_at")
  releasedAt DateTime @map("released_at")
  reason     String                       // TRANSFERRED | DELETED | REASSIGNED
  changedBy  BigInt   @map("changed_by")
  note       String?
  createdAt  DateTime @default(now()) @map("created_at")

  user    User @relation("UserPhoneHistoryUser", fields: [userId], references: [id])
  changer User @relation("UserPhoneHistoryChanger", fields: [changedBy], references: [id])

  @@index([phone, releasedAt])
  @@index([userId, releasedAt])
  @@map("user_phone_history")
}
```

### Raw Partial Unique Index

Thêm vào `packages/database/prisma/raw-indexes.sql`:

```sql
-- 1 SĐT chỉ thuộc 1 user active tại 1 thời điểm (allow re-assign sau soft delete)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_phones_phone_active
  ON user_phones (phone)
  WHERE deleted_at IS NULL;
```

## Related Code Files

### Modify
- `packages/database/prisma/schema.prisma` - thêm 2 model + 4 relation vào User
- `packages/database/prisma/raw-indexes.sql` - thêm partial unique index

### Create
- `packages/database/prisma/migrations/{timestamp}_add_user_phones/migration.sql` (auto-generate)

### Delete
- (none)

## Implementation Steps

1. Mở `schema.prisma`, thêm 4 relation fields vào `User` model (sau dòng 177).
2. Thêm 2 model mới `UserPhone` + `UserPhoneHistory` (sau model `CustomerPhone`).
3. Mở `raw-indexes.sql`, thêm partial unique index `idx_user_phones_phone_active`.
4. Chạy `pnpm db:generate` - verify Prisma client compile pass.
5. Chạy `pnpm db:migrate dev --name add_user_phones` - tạo migration SQL.
6. Mở migration SQL vừa tạo, append phần raw index từ `raw-indexes.sql` (Prisma không tự pick partial index).
7. Chạy lại `pnpm db:migrate dev` để apply migration.
8. Verify: `psql` query `\d user_phones` và `\d user_phone_history` confirm structure.
9. Verify partial index: `\di idx_user_phones_phone_active`.

## Todo List

- [x] Thêm relations vào User model
- [x] Thêm model UserPhone
- [x] Thêm model UserPhoneHistory
- [x] Cập nhật raw-indexes.sql với partial unique
- [x] Chạy db:generate
- [x] Tạo migration với db:migrate dev
- [x] Append partial index vào migration SQL
- [x] Apply migration
- [x] Verify schema bằng psql

## Success Criteria

- `pnpm db:generate` pass không lỗi
- Migration apply thành công, `user_phones` + `user_phone_history` tables tồn tại
- Partial unique index `idx_user_phones_phone_active` hoạt động: insert 2 row cùng phone WHERE deleted_at=null → row 2 fail
- Sau khi soft-delete row 1 → insert row 2 cùng phone OK

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Migration rollback hỏng schema | Test trên dev DB trước, backup schema dump |
| Partial index không pick lên (Prisma generate ignore raw) | Append manually vào migration SQL bước 6 |
| Conflict với migration đang pending khác | Check `git status` trên thư mục migrations trước khi tạo |

## Security Considerations

- `assigned_by` FK chặn xóa user nếu đang giữ vai trò assigner (tốt - audit trail)
- Không expose `user_phone_history` qua API thường - chỉ super admin xem được (sẽ enforce ở phase 02)

## Next Steps

- Phase 02: tạo module backend `user-phones` để CRUD bảng này
- Phase 03 (sau 02): refactor call-logs match logic dùng bảng mới
