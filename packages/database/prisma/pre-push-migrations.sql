-- Pre-push migrations: idempotent SQL run BEFORE `prisma db push`.
--
-- Why this exists:
--   The project uses `prisma db push` for production schema sync (see
--   scripts/deploy.sh). `db push` cannot perform data-preserving column
--   renames or backfills - it refuses when adding a NOT NULL column to
--   a table with existing rows. This file applies those data-aware
--   migrations idempotently so `db push` afterwards is a no-op for them.
--
-- Rules for entries:
--   - Every statement MUST be safe to re-run on an already-migrated DB.
--   - Use IF EXISTS / IF NOT EXISTS / DO blocks with information_schema checks.
--   - Keep statements ordered chronologically; never edit past entries.

-- ── 2026-05-05: label_recall_configs.days → recall_minutes ────────────────
-- Old: days INT NOT NULL; New: recall_minutes INT NOT NULL.
-- Backfill: minutes = days * 1440.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'label_recall_configs' AND column_name = 'days'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'label_recall_configs' AND column_name = 'recall_minutes'
  ) THEN
    ALTER TABLE "label_recall_configs" ADD COLUMN "recall_minutes" INTEGER;
    UPDATE "label_recall_configs" SET "recall_minutes" = "days" * 1440;
    ALTER TABLE "label_recall_configs" ALTER COLUMN "recall_minutes" SET NOT NULL;
    ALTER TABLE "label_recall_configs" DROP COLUMN "days";
  END IF;
END $$;

-- ── 2026-05-05: lead_labels - replace single-col index with composite ─────
-- Composite (label_id, recall_start_at) supports the cron's filter and still
-- covers label-only lookups via the leftmost prefix.
-- NOTE: superseded by 2026-05-06 block below (lead_labels dropped). Kept as
-- historical no-op (DROP/CREATE on non-existent table guarded by IF EXISTS
-- - but CREATE INDEX on missing table errors; wrap in conditional).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_labels') THEN
    DROP INDEX IF EXISTS "lead_labels_label_id_idx";
    CREATE INDEX IF NOT EXISTS "lead_labels_label_id_recall_start_at_idx"
      ON "lead_labels"("label_id", "recall_start_at");
  END IF;
END $$;

-- ── 2026-05-06: lead_labels → leads.label_id (single label per lead) ──────
-- BREAKING: Lead label cardinality changes from N-N (junction) to 1-N (FK).
-- Decision (per plan 260506-1108-lead-single-label): all leads reset to NULL
-- label (user re-labels manually).
--
-- ROLLBACK NOTE: backup table created here is dropped by `prisma db push` on
-- next sync (not in schema). For real rollback safety, take a `pg_dump` of
-- `lead_labels` BEFORE running deploy. Backup here is best-effort within the
-- pre-push → db-push window only.
DO $$
BEGIN
  -- Step A: add leads.label_id column + FK + index if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'label_id'
  ) THEN
    ALTER TABLE "leads" ADD COLUMN "label_id" BIGINT;
    ALTER TABLE "leads" ADD CONSTRAINT "leads_label_id_fkey"
      FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE SET NULL;
    CREATE INDEX "leads_label_id_idx" ON "leads"("label_id");
  END IF;

  -- Step B: add label_assigned_at column for cron timer (replaces lead_labels.recall_start_at)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'label_assigned_at'
  ) THEN
    ALTER TABLE "leads" ADD COLUMN "label_assigned_at" TIMESTAMP(3);
  END IF;

  -- Step C: backup + drop lead_labels (idempotent)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'lead_labels'
  ) THEN
    CREATE TABLE IF NOT EXISTS "lead_labels_backup_20260506" AS
      SELECT * FROM "lead_labels";
    DROP TABLE "lead_labels";
  END IF;
END $$;

-- ── 2026-05-06: recall_configs.auto_label_ids[] → auto_label_id ───────────
-- Take first element of array (NULL if empty) for new singular column.
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
    UPDATE "recall_configs"
      SET "auto_label_id" = "auto_label_ids"[1]
      WHERE array_length("auto_label_ids", 1) > 0;
    ALTER TABLE "recall_configs" ADD CONSTRAINT "recall_configs_auto_label_id_fkey"
      FOREIGN KEY ("auto_label_id") REFERENCES "labels"("id") ON DELETE SET NULL;
    ALTER TABLE "recall_configs" DROP COLUMN "auto_label_ids";
  END IF;
END $$;
