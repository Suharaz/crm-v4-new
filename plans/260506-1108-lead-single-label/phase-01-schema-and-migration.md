# Phase 01 — Schema & Migration

## Context Links

- Plan overview: [plan.md](plan.md)
- Schema: `packages/database/prisma/schema.prisma:337,552-582,750`
- Pre-push: `packages/database/prisma/pre-push-migrations.sql`

## Overview

- **Priority:** Critical (blocks all)
- **Status:** Pending
- Đổi schema Lead-Label sang 1-N qua FK. Drop `lead_labels`. Đổi `auto_label_ids[]` → `auto_label_id?`.

## Key Insights

- Project dùng `prisma db push` ở production (xem `scripts/deploy.sh`) → cần `pre-push-migrations.sql` cho data-aware ops.
- DB local hiện chỉ có 4 lead_labels, prod có nhiều lead 2 nhãn → migration phải defensive nhưng đơn giản (set all NULL).
- `customer_labels` KHÔNG đụng tới.

## Requirements

- Lead có `labelId BigInt?` (nullable)
- DROP TABLE `lead_labels` sau khi backup
- `recall_configs.auto_label_ids BIGINT[]` → `auto_label_id BIGINT?`
- Idempotent: re-run an toàn

## Architecture

```
BEFORE:                        AFTER:
Lead 1──N LeadLabel N──1 Label      Lead N──1 Label
                                      (label_id FK)

Customer 1──N CustomerLabel N──1 Label  (giữ nguyên)
```

## Related Code Files

**Modify:**
- `packages/database/prisma/schema.prisma` — Lead model, drop LeadLabel, RecallConfig field
- `packages/database/prisma/pre-push-migrations.sql` — append idempotent block

**Create:**
- `packages/database/prisma/migrations/<timestamp>_lead_single_label/migration.sql` (nếu dùng prisma migrate dev cho local)

**Read for context:**
- `packages/database/prisma/migrations/20260505111000_label_recall_minutes/migration.sql` — naming pattern
- `packages/database/prisma/migrations/20260504070357_add_customer_phones/migration.sql`

## Implementation Steps

### 1. Update `schema.prisma`

**Lead model (line ~337):**
```prisma
// Remove:
labels LeadLabel[]

// Add:
labelId BigInt? @map("label_id")
label   Label?  @relation(fields: [labelId], references: [id])

@@index([labelId])  // for kanban groupBy + filter
```

**Drop `LeadLabel` model entirely** (lines 568-582). Bỏ luôn relation `leadLabels LeadLabel[]` trên `Label` (line 561).

**RecallConfig (line ~750):**
```prisma
// Replace:
autoLabelIds BigInt[] @map("auto_label_ids")
// With:
autoLabelId BigInt? @map("auto_label_id")
autoLabel   Label?  @relation("recall_auto", fields: [autoLabelId], references: [id])
```

Thêm reverse relation trên Label:
```prisma
recallAutoConfigs RecallConfig[] @relation("recall_auto")
```

### 2. Append `pre-push-migrations.sql`

```sql
-- ── 2026-05-06: lead_labels → leads.label_id (single label per lead) ─────
DO $$
BEGIN
  -- Step A: add column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'label_id'
  ) THEN
    ALTER TABLE "leads" ADD COLUMN "label_id" BIGINT;
    ALTER TABLE "leads" ADD CONSTRAINT "leads_label_id_fkey"
      FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE SET NULL;
    CREATE INDEX "leads_label_id_idx" ON "leads"("label_id");
  END IF;

  -- Step B: backup + drop lead_labels (idempotent)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_labels'
  ) THEN
    CREATE TABLE IF NOT EXISTS "lead_labels_backup_20260506" AS
      SELECT * FROM "lead_labels";
    DROP TABLE "lead_labels";
  END IF;
END $$;

-- ── 2026-05-06: recall_configs.auto_label_ids[] → auto_label_id ─────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recall_configs' AND column_name = 'auto_label_ids'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'recall_configs' AND column_name = 'auto_label_id'
  ) THEN
    ALTER TABLE "recall_configs" ADD COLUMN "auto_label_id" BIGINT;
    -- Take first element from array (NULL if empty)
    UPDATE "recall_configs"
      SET "auto_label_id" = "auto_label_ids"[1]
      WHERE array_length("auto_label_ids", 1) > 0;
    ALTER TABLE "recall_configs" ADD CONSTRAINT "recall_configs_auto_label_id_fkey"
      FOREIGN KEY ("auto_label_id") REFERENCES "labels"("id") ON DELETE SET NULL;
    ALTER TABLE "recall_configs" DROP COLUMN "auto_label_ids";
  END IF;
END $$;
```

### 3. Run migrations

```bash
# Local dev
docker compose up -d postgres
pnpm --filter @crm/database exec prisma db push --skip-generate
pnpm db:generate
```

### 4. Verify

```sql
\d leads        -- xác nhận có cột label_id + FK
\d recall_configs  -- xác nhận có auto_label_id (không còn auto_label_ids)
SELECT COUNT(*) FROM lead_labels_backup_20260506;  -- backup tồn tại
```

## Todo List

- [ ] Cập nhật `schema.prisma` (Lead, drop LeadLabel, RecallConfig)
- [ ] Append idempotent block vào `pre-push-migrations.sql`
- [ ] Chạy `prisma db push` trên DB local
- [ ] Chạy `prisma generate`
- [ ] Verify schema bằng `\d leads`, `\d recall_configs`
- [ ] Confirm `lead_labels_backup_20260506` tồn tại

## Success Criteria

- `pnpm db:push` chạy không error
- `Lead.labelId` xuất hiện trong Prisma client (`pnpm db:generate`)
- DB không còn bảng `lead_labels` (nhưng có backup)
- `recall_configs` có cột `auto_label_id`, không còn `auto_label_ids`

## Risk Assessment

- **Risk:** `prisma db push` detect schema drift khi cột đã add bằng pre-push → có thể prompt confirm. **Mitigation:** Pre-push SQL idempotent + cùng schema → push thành no-op.
- **Risk:** Backup table tồn tại lâu dài chiếm space. **Mitigation:** Note trong changelog, xoá sau 1 sprint.

## Security Considerations

- FK ON DELETE SET NULL — xoá Label không xoá Lead
- Không lộ thông tin nhạy cảm qua backup table (label name không phải PII)

## Next Steps

→ Phase 02: cập nhật service code dùng Lead.labelId thay vì leadLabel.
