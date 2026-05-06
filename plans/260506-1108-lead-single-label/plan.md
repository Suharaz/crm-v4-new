# Plan: Lead Single Label (Customer giữ nguyên multi-label)

## Goal

Đổi quan hệ Lead ↔ Label từ **N-N (junction `lead_labels`)** sang **1-N (FK `lead.label_id`)**.
Customer giữ nguyên N-N qua `customer_labels`. Nhất quán hóa `recall_configs.auto_label_ids[]` → `auto_label_id?`.

## Approach

**Option A - FK trực tiếp.** Xoá hẳn `LeadLabel` model + bảng `lead_labels`. Thêm `labelId BigInt?` (nullable) lên Lead.
**Migration data**: set tất cả lead về `label_id = NULL` (không cố giữ nhãn cũ - user gắn lại).

## Decisions (đã chốt)

| Mục | Quyết định |
|---|---|
| Schema | Option A - FK trực tiếp |
| Migration data | All NULL (không migrate nhãn cũ) |
| Recall conflict | **Skip** - cron không gắn `auto_label` nếu lead đã có `label_id` ≠ NULL |
| CSV import multi-label | Lấy nhãn đầu, log warning |
| UI single-select | `<Select>` dropdown |
| `recall_configs.auto_label_ids[]` | → `auto_label_id BIGINT?` (singular) |

## Phases

| # | File | Status | Estimate |
|---|---|---|---|
| 01 | [phase-01-schema-and-migration.md](phase-01-schema-and-migration.md) | ✅ done | 1h |
| 02 | [phase-02-backend-services.md](phase-02-backend-services.md) | ✅ done | 1.5h |
| 03 | [phase-03-backend-api-contract.md](phase-03-backend-api-contract.md) | ✅ done | 0.5h |
| 04 | [phase-04-frontend-types-and-data.md](phase-04-frontend-types-and-data.md) | ✅ done | 0.5h |
| 05 | [phase-05-frontend-ui-components.md](phase-05-frontend-ui-components.md) | ✅ done | 1.5h |
| 06 | [phase-06-seed-and-docs.md](phase-06-seed-and-docs.md) | ✅ done | 0.5h |
| 07 | [phase-07-testing-and-verification.md](phase-07-testing-and-verification.md) | ✅ done | 1h |

**Tổng:** ~6.5h | **Status:** ✅ completed 2026-05-06 | Report: [plans/reports/tester-260506-1153-verify-lead-single-label.md](../reports/tester-260506-1153-verify-lead-single-label.md)

## Schema Addition (deviation from original plan)

`leads.label_assigned_at TIMESTAMP(3)?` was added to preserve the per-label-recall cron feature (`LabelRecallConfig`). The original plan dropped `lead_labels.recall_start_at` without addressing how the cron tracks "time since label assigned." This new column replaces that semantics and is updated by:
- `setLeadLabel(leadId, labelId)` (set/replace)
- assign / bulk-assign / transfer flows (reset on re-assign, only if `labelId IS NOT NULL`)
- recall-config auto-label-set (when applying `autoLabelId` to label-less leads)

The cron `_recallLeadsByLabel` now queries `lead.labelId + labelAssignedAt < cutoff` instead of the dropped junction `recallStartAt`.

## Dependencies

- 01 blocks all (schema phải xong trước)
- 02 blocks 03 (service trước controller contract)
- 03 blocks 04, 05 (FE phụ thuộc API shape)
- 04, 05 có thể parallel sau 03
- 06, 07 chạy cuối

## Rollback Strategy

- Migration trong **single transaction** (BEGIN/COMMIT)
- Backup `lead_labels` data trước khi DROP (`CREATE TABLE lead_labels_backup AS SELECT * FROM lead_labels`)
- Nếu rollback: re-migrate tạo lại bảng + restore từ backup
- Bảng backup giữ ít nhất 1 release cycle rồi mới drop

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Production có nhiều lead 2+ nhãn | All NULL - skip vấn đề (user re-label) |
| Frontend cũ vẫn gửi `labelIds: string[]` | Controller accept cả 2 dạng (compat 1 sprint) hoặc bump version |
| Cron recall fire trong lúc deploy | Migration chạy giờ thấp tải; cron skip-if-exists tự an toàn |
| Lead.kanban-by-label đếm sai sau migrate | Refresh client cache, message banner thông báo "Label reset" |

## Success Criteria

- [ ] `pnpm db:push` (hoặc migrate) chạy clean trên DB local + sample prod dump
- [ ] `pnpm build` pass cho cả `apps/api` + `apps/web`
- [ ] CRUD lead label qua UI: chỉ chọn được 1 nhãn, đổi nhãn replace đúng
- [ ] Cron auto-recall: không đè nhãn business của lead
- [ ] CSV import: lead có cột `labels="VIP|Hot Lead"` → chỉ gắn `VIP`, log warning
- [ ] Customer label vẫn multi-select bình thường (không regression)
- [ ] Docs `data-model.md`, `system-architecture.md`, `business-flows.md` đã update
