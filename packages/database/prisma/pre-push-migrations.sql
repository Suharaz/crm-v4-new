-- Pre-push migrations: idempotent SQL run BEFORE `prisma db push`.
--
-- Why this exists:
--   The project uses `prisma db push` for production schema sync (see
--   scripts/deploy.sh). `db push` cannot perform data-preserving column
--   renames or backfills — it refuses when adding a NOT NULL column to
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

-- ── 2026-05-05: lead_labels — replace single-col index with composite ─────
-- Composite (label_id, recall_start_at) supports the cron's filter and still
-- covers label-only lookups via the leftmost prefix.
DROP INDEX IF EXISTS "lead_labels_label_id_idx";
CREATE INDEX IF NOT EXISTS "lead_labels_label_id_recall_start_at_idx"
  ON "lead_labels"("label_id", "recall_start_at");
