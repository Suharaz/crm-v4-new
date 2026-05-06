# Phase 06 - Seed & Docs

## Context Links

- Plan: [plan.md](plan.md)

## Overview

- **Priority:** Medium
- **Status:** Pending
- Cập nhật seed script và mọi docs nói về Lead-Label N-N.

## Related Code Files

**Modify:**
- `packages/database/prisma/seed.ts:282-287` - đổi `prisma.leadLabel.create` → `prisma.lead.update({ data: { labelId } })`
- `docs/data-model.md` - cập nhật ERD + relation Lead-Label
- `docs/system-architecture.md` - phần data layer
- `docs/codebase-summary.md` - module labels
- `docs/api-reference.md` - endpoint label
- `docs/business-flows.md` - flow gắn nhãn lead
- `docs/project-changelog.md` - append entry mới
- `CLAUDE.md` (project root) - mục "Business Logic - Key Decisions" thêm dòng "Lead 1 nhãn, Customer nhiều nhãn"

## Implementation Steps

### 1. seed.ts

```typescript
// BEFORE: prisma.leadLabel.create({ data: { leadId: leads[0].id, labelId: labels[1].id } })
// AFTER:
await Promise.all([
  prisma.lead.update({ where: { id: leads[0].id }, data: { labelId: labels[1].id } }),
  prisma.lead.update({ where: { id: leads[7].id }, data: { labelId: labels[5].id } }),
  prisma.lead.update({ where: { id: leads[10].id }, data: { labelId: labels[0].id } }),
  prisma.lead.update({ where: { id: leads[14].id }, data: { labelId: labels[8].id } }),
]);
```

Bỏ `prisma.leadLabel.deleteMany()` ở reset block (line 46).

### 2. docs

**`data-model.md`:** đổi sơ đồ
```
Lead ──N─1─ Label   (lead.label_id FK)
Customer N─N Label  (customer_labels junction)
```

**`business-flows.md`:** flow gắn nhãn lead → "Sale chọn 1 nhãn từ dropdown. Đổi = replace."

**`api-reference.md`:** endpoint
```
PATCH /api/v1/leads/:id/label
Body: { labelId: string | null }
Response: { ok: true }
```

**`project-changelog.md`:** append
```markdown
## [Unreleased] - 2026-05-06

### Changed
- **BREAKING:** Lead label cardinality đổi 1-N (1 nhãn / lead). Customer giữ N-N.
- Migration: bảng `lead_labels` drop, thay bằng `leads.label_id` FK. Backup tại `lead_labels_backup_20260506`.
- `recall_configs.auto_label_ids[]` → `auto_label_id BIGINT?` (singular).
- Recall conflict: skip-if-exists (không đè nhãn lead đã có).
- CSV import multi-label: lấy nhãn đầu, log warning.
```

### 3. CLAUDE.md (project)

Thêm vào mục "Business Logic - Key Decisions":
```markdown
### Lead vs Customer Label
- Lead: 1 nhãn duy nhất (labelId nullable FK)
- Customer: nhiều nhãn (junction customer_labels)
- Cron auto-recall skip nếu lead đã có nhãn (không đè)
```

## Todo List

- [ ] Sửa `seed.ts`
- [ ] `pnpm db:seed` chạy clean
- [ ] Update `docs/data-model.md`
- [ ] Update `docs/system-architecture.md`
- [ ] Update `docs/codebase-summary.md`
- [ ] Update `docs/api-reference.md`
- [ ] Update `docs/business-flows.md`
- [ ] Append `docs/project-changelog.md`
- [ ] Update `CLAUDE.md` project root

## Success Criteria

- `pnpm db:seed` không error
- Sau seed: `SELECT COUNT(*) FROM leads WHERE label_id IS NOT NULL` = 4
- Mọi docs nói "Lead nhiều nhãn" đã sửa thành "Lead 1 nhãn"

## Next Steps

→ Phase 07: testing + verification.
