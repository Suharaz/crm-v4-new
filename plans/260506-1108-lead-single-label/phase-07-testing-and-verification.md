# Phase 07 - Testing & Verification

## Context Links

- Plan: [plan.md](plan.md)

## Overview

- **Priority:** High (gate before merge)
- **Status:** Pending
- Verify end-to-end + regression test customer label.

## Test Scope

### Backend (API)
- [ ] `PATCH /leads/:id/label` set label → 200 + DB updated
- [ ] `PATCH /leads/:id/label` set null → 200 + label removed
- [ ] `GET /leads/:id` response có `label: {...} | null`, không còn `labels[]`
- [ ] Cron recall: lead có labelId → bị recall (status=FLOATING) NHƯNG label giữ nguyên
- [ ] Cron recall: lead labelId=null → bị recall + label = config.autoLabelId
- [ ] CSV import row `labels="VIP|Hot Lead"` → lead.labelId = VIP, job warnings có entry

### Frontend (Manual E2E)
- [ ] Lead detail: Select dropdown chỉ chọn 1
- [ ] Đổi nhãn → badge thay đổi (không xếp chồng)
- [ ] Bỏ nhãn → không còn badge
- [ ] Lead table: 1 cell 1 badge max
- [ ] Kanban by label: 1 lead 1 cột
- [ ] Filter multi-select labels → list lọc đúng
- [ ] CSV import dialog: hiển thị helper text

### Regression (Customer - KHÔNG ĐƯỢC vỡ)
- [ ] Customer detail: gắn được 2-3 nhãn
- [ ] Customer table: hiển thị nhiều badge
- [ ] Customer kanban (nếu có): hiển thị đúng

### Migration
- [ ] DB local: `lead_labels` không tồn tại
- [ ] DB local: `lead_labels_backup_20260506` tồn tại
- [ ] DB local: `leads.label_id` cột tồn tại + FK + index
- [ ] DB local: `recall_configs.auto_label_id` thay `auto_label_ids`

## Related Code Files

**Read (chạy test):**
- Existing test files: `apps/api/test/*` - pattern reference
- `tests/test-results/` - output dir

**Optional create (nếu thiếu coverage):**
- `apps/api/test/leads-label.e2e-spec.ts`

## Implementation Steps

### 1. Build full

```bash
pnpm build  # cả api + web
```
Phải pass không TS error.

### 2. API integration tests

Nếu project có Jest setup:
```bash
pnpm test --filter @crm/api -- leads-label
```
Nếu chưa có file test, viết quick e2e cover 6 case ở Backend section trên.

### 3. Manual smoke test

```bash
pnpm dev
```
Mở browser → đi qua checklist Frontend ở trên. Screenshot + ghi chú vào report.

### 4. Cron simulation

Trigger cron thủ công (nếu có endpoint admin) hoặc query trực tiếp:
```sql
-- setup: 2 lead, 1 có label, 1 không
INSERT INTO leads (..., label_id) VALUES (..., 5), (..., NULL);
-- run cron
-- verify: lead 1 vẫn label=5, lead 2 = config.autoLabelId
```

### 5. Verification report

Ghi vào `plans/reports/tester-260506-XXXX-verify-lead-single-label.md`:
- Test cases pass/fail
- Screenshots các UI chính
- Migration DB diff (`\d leads`, `\d recall_configs`)
- Time taken

## Todo List

- [ ] `pnpm build` pass cả 2 app
- [ ] Run API tests (existing + new)
- [ ] Manual E2E qua checklist
- [ ] Cron skip-if-exists verification
- [ ] CSV import warning verification
- [ ] Customer regression check
- [ ] Viết verification report

## Success Criteria

- All checkboxes Test Scope checked
- Verification report uploaded
- Không có regression Customer
- Migration backup tồn tại + có thể rollback (test thử restore từ `lead_labels_backup_20260506` nếu cần)

## Risk Assessment

- **Risk:** Test environment khác production → bug chỉ hiện trên prod. **Mitigation:** Smoke test trên staging trước, monitor 24h sau deploy.

## Next Steps

→ Commit + push (theo CLAUDE.md project: "Mỗi khi hoàn thành 1 tính năng cần commit và push luôn").
→ Optional: drop `lead_labels_backup_20260506` sau 1 sprint nếu ổn định.
