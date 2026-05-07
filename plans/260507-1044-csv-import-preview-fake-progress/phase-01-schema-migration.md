# Phase 01 - Schema + Migration

## Context Links

- Parent plan: [plan.md](plan.md)
- Design doc: [`../reports/brainstorm-260507-1033-csv-import-preview-fake-progress.md`](../reports/brainstorm-260507-1033-csv-import-preview-fake-progress.md) - Section 5.2
- Dependencies: none (foundation phase)
- Blocks: Phase 02 (processor cần enum mới + fields mới)

## Overview

- **Date:** 2026-05-07
- **Priority:** P2
- **Effort:** 0.5h
- **Status:** completed
- **Description:** Mở rộng `ImportJobStatus` enum + thêm 3 fields trên `ImportJob` để support state machine PENDING_REVIEW -> REVIEWED -> PROCESSING. Tạo migration.

## Key Insights

- Existing enum đã có PROCESSING/COMPLETED/FAILED -> chỉ thêm 3 value mới
- `previewSummary` JSON column tránh tạo bảng riêng cho sample errors (KISS)
- Migration phải backward-safe: existing rows status PROCESSING/COMPLETED/FAILED không bị ảnh hưởng
- Default status mới khi tạo job đổi từ PROCESSING -> PENDING_REVIEW (sẽ áp dụng ở phase 02)

## Requirements

### Functional
- Enum `ImportJobStatus` thêm 3 value: `PENDING_REVIEW`, `REVIEWED`, `CANCELLED`
- Field `previewSummary Json?` lưu kết quả dry-run
- Field `reviewedAt DateTime?` mark thời điểm dry-run xong
- Field `startedAt DateTime?` mark thời điểm user bấm Import

### Non-functional
- Migration không lock bảng lâu (ImportJob nhỏ, không lo perf)
- Tương thích với Prisma 6 syntax

## Architecture

```
ImportJobStatus enum:
  PENDING_REVIEW   <- mới (default khi upload)
  REVIEWED         <- mới (dry-run xong)
  PROCESSING       <- existing (đang insert thật)
  COMPLETED        <- existing
  FAILED           <- existing
  CANCELLED        <- mới (user huỷ)

ImportJob model thêm:
  previewSummary  Json?
  reviewedAt      DateTime?
  startedAt       DateTime?
```

`previewSummary` JSON shape (document trong code comment):
```typescript
{
  totalRows: number,
  validRows: number,
  errorRows: number,
  sampleErrors: Array<{ row: number; message: string }>  // top 5
}
```

## Related Code Files

### Read
- `packages/database/prisma/schema.prisma` - tìm model ImportJob + enum ImportJobStatus
- `packages/database/prisma/migrations/` - xem naming convention migration cũ

### Modify
- `packages/database/prisma/schema.prisma`

### Create
- `packages/database/prisma/migrations/{timestamp}_add_import_preview_state/migration.sql`

### Delete
- (none)

## Implementation Steps

1. **Đọc schema hiện tại**
   - Tìm `model ImportJob` + `enum ImportJobStatus` trong `packages/database/prisma/schema.prisma`
   - Note column names hiện tại (snake_case mapping)

2. **Edit `schema.prisma`**
   - Thêm 3 enum value: `PENDING_REVIEW`, `REVIEWED`, `CANCELLED`
   - Thêm 3 fields:
     ```prisma
     previewSummary  Json?      @map("preview_summary")
     reviewedAt      DateTime?  @map("reviewed_at")
     startedAt       DateTime?  @map("started_at")
     ```

3. **Tạo migration**
   - Run: `cd packages/database && pnpm prisma migrate dev --name add_import_preview_state`
   - Verify migration SQL: `ALTER TYPE ... ADD VALUE` cho enum + `ADD COLUMN` cho 3 fields nullable

4. **Generate Prisma client**
   - `pnpm db:generate` (hoặc auto-run sau migrate dev)

5. **Smoke test**
   - `pnpm typecheck` - đảm bảo không break type ở module khác

## Todo List

- [ ] Đọc schema.prisma + locate ImportJob model
- [ ] Thêm 3 enum values vào ImportJobStatus
- [ ] Thêm 3 fields previewSummary/reviewedAt/startedAt
- [ ] Run prisma migrate dev với name `add_import_preview_state`
- [ ] Verify migration SQL không có em dash hoặc kí tự lạ
- [ ] Run `pnpm db:generate`
- [ ] Run `pnpm typecheck` - pass

## Success Criteria

- [ ] Schema.prisma compile OK với 6 enum values + 3 new fields
- [ ] Migration SQL được tạo đúng (ADD VALUE cho enum, ADD COLUMN cho fields)
- [ ] `pnpm typecheck` pass toàn workspace
- [ ] Existing ImportJob rows không bị ảnh hưởng (3 fields mới đều nullable)
- [ ] Prisma client regenerate, types có 3 enum mới + 3 fields mới

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Postgres không cho ADD VALUE trong transaction | LOW | Prisma migrate dev chạy ngoài transaction tự động |
| Existing code dùng exhaustive switch trên ImportJobStatus | MED | Phase 02 sẽ update tất cả switch/if để xử 3 state mới |
| JSON column performance | LOW | previewSummary < 5KB, không index, chỉ read khi user mở dialog |

## Security Considerations

- 3 enum value mới không expose field nhạy cảm
- `previewSummary` chứa sample data từ CSV - cần sanitize khi return frontend (no XSS, no SQL fragments). Đã handled vì là plain text từ row.

## Next Steps

- Phase 02: refactor processor để dùng enum mới + write `previewSummary` khi dry-run xong
- Document JSON shape trong TypeScript type ở `@crm/types` (làm cùng phase 02)
