# Phase 01 — Database Schema

**Priority:** P0 (blocks all) | **Status:** Pending | **Est:** 1h

## Overview
Thêm 2 bảng mới: `audit_logs` (user actions) + `cron_runs` (cron execution history). Tạo migration và regenerate Prisma client.

## Requirements
- BIGINT IDENTITY PK (theo CLAUDE.md rule)
- snake_case column + `@@map`
- Index hỗ trợ filter chi tiết (user, action, entity, time-range, IP)
- Nullable user_id cho system actions
- Soft delete: KHÔNG cần (data có retention 60 ngày, hard delete OK)

## Architecture

### Bảng `audit_logs`
- `userId` nullable: cron/system action không có user
- `action` string enum-like: dùng string thay enum để dễ thêm action mới không cần migration (vd: `LEAD_TRANSFER`, `USER_LOGIN`, `RECALL_LEAD_LABEL`)
- `entityType` + `entityId` nullable: không phải action nào cũng có entity (login chẳng hạn)
- `metadata` JSONB: store request body sanitized + before/after diff khi cần
- `ipAddress` + `userAgent`: cho forensic

### Bảng `cron_runs`
- `jobName`: identifier cố định (`auto-recall`, `task-reminder`, `notification-cleanup`)
- `startedAt` + `finishedAt`: tính duration
- `status`: `RUNNING` (lúc start) → `SUCCESS`/`FAILED` (lúc end)
- `affected`: row count thay đổi (vd: số lead recall)
- `errorMsg`: stack trace nếu fail
- `metadata`: per-job custom data (vd: configs đã quét, breakdown theo label)

## Related Code Files

### Read first
- `packages/database/prisma/schema.prisma` (line 596 — Activity model làm reference)
- `packages/database/prisma/migrations/20260505111000_label_recall_minutes/migration.sql` (latest migration làm reference)

### Modify
- `packages/database/prisma/schema.prisma` — thêm 2 model

### Create
- `packages/database/prisma/migrations/{timestamp}_add_audit_logs_cron_runs/migration.sql` — auto generate

## Implementation Steps

1. **Mở** `packages/database/prisma/schema.prisma`
2. **Thêm** 2 model vào cuối file (sau model Document, trước CallLog hoặc cuối):

```prisma
// ─── AUDIT & TRACE ──────────────────────────────────────────────────────────

model AuditLog {
  id         BigInt   @id @default(autoincrement())
  userId     BigInt?  @map("user_id")
  action     String                              // "LEAD_TRANSFER", "USER_LOGIN", etc
  entityType String?  @map("entity_type")        // "LEAD" | "CUSTOMER" | "ORDER" | ...
  entityId   BigInt?  @map("entity_id")
  ipAddress  String?  @map("ip_address")
  userAgent  String?  @map("user_agent")
  method     String?                             // "POST" | "PUT" | "PATCH" | "DELETE"
  path       String?                             // request path
  statusCode Int?     @map("status_code")        // HTTP status returned
  metadata   Json?                               // sanitized body, params, before/after
  createdAt  DateTime @default(now()) @map("created_at")

  user User? @relation("AuditLogUser", fields: [userId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@index([action, createdAt(sort: Desc)])
  @@index([entityType, entityId])
  @@index([createdAt(sort: Desc)])
  @@index([ipAddress])
  @@map("audit_logs")
}

model CronRun {
  id         BigInt    @id @default(autoincrement())
  jobName    String    @map("job_name")
  startedAt  DateTime  @map("started_at")
  finishedAt DateTime? @map("finished_at")
  status     String                              // "RUNNING" | "SUCCESS" | "FAILED"
  affected   Int       @default(0)
  errorMsg   String?   @map("error_msg")
  metadata   Json?
  createdAt  DateTime  @default(now()) @map("created_at")

  @@index([jobName, startedAt(sort: Desc)])
  @@index([status, startedAt(sort: Desc)])
  @@index([startedAt(sort: Desc)])
  @@map("cron_runs")
}
```

3. **Cập nhật** model `User` — thêm relation:
```prisma
auditLogs AuditLog[] @relation("AuditLogUser")
```
   (đặt cùng chỗ với các relation khác trong User model)

4. **Generate migration:**
```bash
pnpm db:migrate dev --name add_audit_logs_cron_runs
```

5. **Verify:**
```bash
pnpm db:generate  # regenerate client
```

6. **Test query nhanh:**
```bash
psql $DATABASE_URL -c "\d audit_logs"
psql $DATABASE_URL -c "\d cron_runs"
```

## Todo List
- [ ] Đọc `schema.prisma` line 100-200 để xác định vị trí model User + relation pattern
- [ ] Thêm model `AuditLog` + `CronRun`
- [ ] Thêm relation `auditLogs` vào model User
- [ ] Run `pnpm db:migrate dev --name add_audit_logs_cron_runs`
- [ ] Run `pnpm db:generate`
- [ ] Verify schema bằng `psql \d`
- [ ] Compile check: `pnpm build` (api workspace)

## Success Criteria
- 2 bảng tồn tại trong DB với đúng index
- Prisma client export `prisma.auditLog` + `prisma.cronRun`
- `pnpm build` không lỗi type
- Migration file ở `packages/database/prisma/migrations/`

## Risk Assessment
- **R1:** Migration conflict nếu DB đã có data — mitigation: chỉ thêm bảng mới, không sửa bảng cũ
- **R2:** Index quá nhiều slow insert — chấp nhận: insert audit không phải hot path

## Security Considerations
- `metadata` JSONB phải được sanitize **TRƯỚC khi insert** (xử lý ở Phase 02, không phải DB)
- DB không enforce sanitization → buộc phải đi qua service layer

## Next Steps
Phase 02 (audit service) + Phase 03 (cron tracking) parallel sau khi phase này xong.
