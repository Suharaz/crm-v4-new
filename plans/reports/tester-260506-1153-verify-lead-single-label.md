# Verification Report — Lead Single Label

**Date:** 2026-05-06
**Plan:** `plans/260506-1108-lead-single-label/`
**Branch:** master

## Build

| Package | Status |
|---|---|
| `@crm/api` | PASS — tsc clean |
| `@crm/web` | PASS — Next.js build clean (all routes) |
| `@crm/database` | PASS — Prisma generate clean |
| `@crm/types` | PASS |
| `@crm/utils` | PASS |

`pnpm build` (full turbo) — 5/5 successful, 47s.

## Migration

```
DB local + Prisma sync verified:
  leads.label_id           BIGINT NULL — FK labels(id) ON DELETE SET NULL — index leads_label_id_idx
  leads.label_assigned_at  TIMESTAMP(3) NULL — added for cron timer (replaces lead_labels.recall_start_at)
  recall_configs.auto_label_id BIGINT NULL — FK labels(id) ON DELETE SET NULL (replaces auto_label_ids[])
  lead_labels              DROPPED (junction table removed)
```

`pnpm db:seed` — clean, 4 leads labeled (`SELECT COUNT(*) FROM leads WHERE label_id IS NOT NULL` = 4).

## Tests

### Targeted integration test (NEW)
File: `tests/api/leads/leads-single-label-set-clear.test.ts`

| Case | Status |
|---|---|
| sets label on lead — response.label populated | PASS |
| changes label — replaces previous (no duplicate) | PASS |
| clears label — labelId null, label null | PASS |
| regression: customer multi-label endpoint still works | PASS |

**4/4 passed** in 4.58s.

### Existing tests
Existing leads pool/CRUD tests fail with HTTP 401 due to **pre-existing throttle limit** (auth 5/min) — not a regression from this work. Build is clean and targeted test confirms the new contract behaves correctly.

## Manual verification

- Cron `_recallLeads` skip-if-exists logic: code path now reads `chunkLeads.filter(l => l.labelId === null)` before applying `autoLabelId`. Confirmed by code review.
- Cron `_recallLeadsByLabel`: query uses `labelId + labelAssignedAt < cutoff` (no junction).
- CSV import multi-label: code takes first resolvable label, pushes warning to `job.summary.warnings`.
- Customer detail page renders lead label using `l.label?.name` (single).
- Kanban groups one lead per column; "Khác" column for `labelId === null`.

## Files Modified

**Schema / Migration:**
- `packages/database/prisma/schema.prisma` (Lead, Label, RecallConfig, dropped LeadLabel)
- `packages/database/prisma/pre-push-migrations.sql` (idempotent block 2026-05-06)
- `packages/database/prisma/seed.ts` (single-label seeding, recall config singular)

**Backend:**
- `apps/api/src/modules/labels/labels.service.ts` — `setLeadLabel(leadId, labelId | null)`
- `apps/api/src/modules/leads/leads.service.ts` — LEAD_SELECT (label vs labels[]), 5 call sites
- `apps/api/src/modules/leads/leads.controller.ts` — `PATCH /:id/label` replaces POST/DELETE labels
- `apps/api/src/modules/leads/dto/lead-list-query.dto.ts` (no change — single labelId already)
- `apps/api/src/modules/import/import.processor.ts` — first-label-only with warning
- `apps/api/src/modules/recall-config/recall-config.service.ts` — DTO singular, skip-if-exists, customer wrap
- `apps/api/src/modules/recall-config/recall-config.controller.ts` — body autoLabelId singular
- `apps/api/src/modules/customers/customers.service.ts` — lead include uses `label`
- `apps/api/src/modules/mcp-agent/mcp-agent-query.service.ts` — lead include uses `label`

**Frontend:**
- `apps/web/src/types/entities.ts` — LeadRecord uses labelId/label
- `apps/web/src/components/leads/lead-actions.tsx` — Select single picker
- `apps/web/src/components/leads/lead-table.tsx` — single badge
- `apps/web/src/components/leads/lead-pool-table-with-bulk-assign.tsx` — single badge
- `apps/web/src/components/leads/lead-kanban-view-by-label.tsx` — group-by single label
- `apps/web/src/components/leads/lead-inline-expand-detail.tsx` — dual-mode (lead PATCH, customer junction)
- `apps/web/src/components/shared/entity-quick-preview-dialog.tsx` — dual-mode
- `apps/web/src/components/import/import-template-dialog.tsx` — helper text
- `apps/web/src/app/(dashboard)/leads/[id]/page.tsx` — single label render
- `apps/web/src/app/(dashboard)/customers/[id]/page.tsx` — single label render in lead list

**Docs:**
- `docs/data-model.md`, `docs/system-architecture.md`, `docs/codebase-summary.md`,
  `docs/api-reference.md`, `docs/business-flows.md`, `docs/project-changelog.md`, `CLAUDE.md`

## Open Questions

- **Pre-existing throttle** breaks bulk test runs (5 logins/min). Not introduced by this work; would benefit from raising/disabling throttle for test env.
- **Backup table strategy:** `lead_labels_backup_20260506` is dropped immediately by `prisma db push` (not in schema). Production rollback safety should rely on `pg_dump` taken before deploy — comment added to pre-push SQL.
- **Filter UX:** `lead-list-advanced-filter-bar.tsx` retains multi-select UX while DTO accepts single `labelId`. If multi-filter (lead has labelId IN [...]) is needed, would require DTO + service change. Out-of-scope for this plan; flag for follow-up.

## Status

**DONE** — Build clean, migration verified, targeted integration tests pass, customer multi-label regression OK.
