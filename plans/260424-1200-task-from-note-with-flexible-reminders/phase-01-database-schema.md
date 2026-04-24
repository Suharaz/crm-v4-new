# Phase 01 — Database Schema

**Priority:** P0 (blocks all) | **Status:** ✅ Completed | **Effort:** 2h

## Overview
Tạo bảng `task_reminders` (1-N với Task). Drop 2 cột cũ `remindAt`/`remindedAt` trên Task.

## Requirements
- 1 Task có 0-N TaskReminder (cascade delete khi xoá task)
- Mỗi reminder có `remindAt`, `label`, `remindedAt` (flag đã gửi)
- Index cho cron query nhanh: `(remindAt, remindedAt)`

## Schema Changes

**File:** `packages/database/prisma/schema.prisma`

### Thêm model mới
```prisma
model TaskReminder {
  id         BigInt    @id @default(autoincrement())
  taskId     BigInt    @map("task_id")
  remindAt   DateTime  @map("remind_at")
  label      String?   @db.VarChar(50)  // "1 ngày trước", "30 phút trước", hoặc custom
  remindedAt DateTime? @map("reminded_at")
  createdAt  DateTime  @default(now()) @map("created_at")

  task Task @relation(fields: [taskId], references: [id], onDelete: Cascade)

  @@index([remindAt, remindedAt])
  @@index([taskId])
  @@map("task_reminders")
}
```

### Sửa model Task
```prisma
model Task {
  // ... giữ nguyên các field khác
  // ❌ XOÁ: remindAt, remindedAt
  // ✅ THÊM: quan hệ reminders
  reminders TaskReminder[]

  // ❌ XOÁ index cũ: @@index([remindAt, remindedAt, status])
  // ✅ GIỮ các index khác
}
```

## Migration SQL (manual review)

**File:** `packages/database/prisma/migrations/{auto_timestamp}_task_reminders/migration.sql`

```sql
-- 1. Tạo bảng mới
CREATE TABLE "task_reminders" (
  "id" BIGSERIAL PRIMARY KEY,
  "task_id" BIGINT NOT NULL,
  "remind_at" TIMESTAMP(3) NOT NULL,
  "label" VARCHAR(50),
  "reminded_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_reminders_task_id_fkey" FOREIGN KEY ("task_id")
    REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "task_reminders_remind_at_reminded_at_idx"
  ON "task_reminders"("remind_at", "reminded_at");
CREATE INDEX "task_reminders_task_id_idx" ON "task_reminders"("task_id");

-- 2. Migrate dữ liệu cũ (chưa có prod data nhưng giữ an toàn)
INSERT INTO "task_reminders" ("task_id", "remind_at", "reminded_at", "label")
SELECT "id", "remind_at", "reminded_at", '30 phút trước'
FROM "tasks"
WHERE "remind_at" IS NOT NULL;

-- 3. Drop cột cũ
DROP INDEX IF EXISTS "tasks_remind_at_reminded_at_status_idx";
ALTER TABLE "tasks" DROP COLUMN "remind_at";
ALTER TABLE "tasks" DROP COLUMN "reminded_at";
```

## Implementation Steps
1. Sửa `schema.prisma` — add `TaskReminder` model, remove `remindAt`/`remindedAt` từ Task
2. Chạy `pnpm db:migrate dev --name task_reminders`
3. Review SQL được generate, bổ sung INSERT migrate data (step 2 trên)
4. Chạy `pnpm db:generate` để update Prisma client
5. Verify bằng `pnpm db:studio`

## Todo
- [x] Update `schema.prisma`
- [x] Generate migration + add manual migrate-data step
- [x] Run migration on dev DB
- [x] Regenerate Prisma client
- [x] Verify schema in Studio

## Success Criteria
- Table `task_reminders` tồn tại với đúng 3 index
- Task table không còn cột `remind_at`/`reminded_at`
- Prisma client có type `TaskReminder`
- Existing tests không break (chưa có test dùng `remindAt`)

## Risks
- Nếu có dev đang dùng branch khác → báo họ pull + migrate
- Rollback: drop table `task_reminders` + re-add 2 cột cũ (migration down script)

## Security
- Không có PII mới
- Cascade delete đảm bảo orphan cleanup
