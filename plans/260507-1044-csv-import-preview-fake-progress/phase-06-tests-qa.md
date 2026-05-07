# Phase 06 - Tests + QA

## Context Links

- Parent plan: [plan.md](plan.md)
- Design doc: Section 8 (Validation Criteria)
- Dependencies: Phase 01-05 (all features ready)
- Blocks: nothing (phase cuối)

## Overview

- **Date:** 2026-05-07
- **Priority:** P2
- **Effort:** 1h
- **Status:** completed
- **Description:** Unit test cho `ImportValidationService` (logic core), e2e test happy path upload -> review -> import, manual QA checklist edge cases.

## Key Insights

- Validation service tách rồi -> test riêng dễ, mock Prisma + lookups
- Existing e2e test `tests/e2e/import-export/csv-import-upload-and-export-download.spec.ts` cần update để cover flow mới (preview -> start)
- Manual QA cho phần UX (progress bar mượt, dialog responsive) - không tự động hoá được
- Backward compat test: existing import flow không bị break (vẫn upload + xử lý đúng)

## Requirements

### Functional
- Unit test `ImportValidationService.validateLeadRow`: 5+ cases (valid, missing phone, invalid phone, missing source, dedup, label warnings)
- Unit test `ImportValidationService.validateCustomerRow`: 4+ cases
- Unit test `useFakeProgress` hook: 3 cases (linear progress, ease-out, reset)
- E2E test: upload -> wait REVIEWED -> assert previewSummary -> POST /start -> wait COMPLETED
- E2E test: upload -> POST /cancel -> assert CANCELLED + file xoá
- Manual QA checklist (10+ scenarios)

### Non-functional
- Tests pass trong CI
- E2E test < 30s mỗi test (dùng file CSV nhỏ, ~10 row)

## Architecture

```
tests/
  unit/
    api/
      import/
        import-validation.service.spec.ts  (NEW) - Vitest, mock Prisma
    web/
      hooks/
        use-fake-progress.spec.ts          (NEW) - Vitest, fake timers
  e2e/
    import-export/
      csv-import-upload-and-export-download.spec.ts  (EXTEND) - thêm preview/start/cancel
  api/
    import-export/
      csv-import-leads-customers-and-export-download.test.ts  (EXTEND) - API integration
```

## Related Code Files

### Read
- `tests/e2e/import-export/csv-import-upload-and-export-download.spec.ts` (existing pattern)
- `tests/api/import-export/csv-import-leads-customers-and-export-download.test.ts` (existing pattern)
- `tests/unit/utils/csv-formula-injection-sanitizer.test.ts` (existing unit test pattern)
- `apps/api/src/modules/import/import-validation.service.ts` (target dưới test)
- `apps/web/src/hooks/use-fake-progress.ts` (target dưới test)

### Modify
- `tests/e2e/import-export/csv-import-upload-and-export-download.spec.ts` (extend cho flow mới)
- `tests/api/import-export/csv-import-leads-customers-and-export-download.test.ts` (extend)

### Create
- `tests/unit/api/import/import-validation.service.spec.ts`
- `tests/unit/web/hooks/use-fake-progress.spec.ts`

### Delete
- (none)

## Implementation Steps

1. **Unit test `ImportValidationService`** (Vitest)
   - Setup: mock `PrismaClient`, mock `CustomerPhonesService`
   - Test cases cho `validateLeadRow`:
     - Happy path: phone+name+source+product valid -> `{ valid: true, parsed: {...}, warnings: [] }`
     - Missing phone -> `{ valid: false, error: 'Thiếu số điện thoại' }`
     - Invalid phone format -> `{ valid: false, error: 'SĐT không hợp lệ' }`
     - Missing source (optional) -> valid
     - Product không tồn tại -> `{ valid: false, error: '...không tồn tại...' }`
     - Lead trùng (phone+source+product) -> `{ valid: false, error: 'Trùng lead' }`
     - Multi-label CSV -> warnings = ['chỉ nhận 1 nhãn']
   - Test cases cho `validateCustomerRow`:
     - Happy path
     - Missing phone
     - Phone trùng KH cũ -> `{ valid: false, error: 'Trùng khách hàng' }`
     - Label không tồn tại -> warnings

2. **Unit test `useFakeProgress`** (Vitest + React Testing Library + fake timers)
   - `vi.useFakeTimers()`
   - Case 1: `isRunning=true` -> advance 60s -> progress ≈ 49.5
   - Case 2: `isRunning=true` -> advance 130s -> progress = 99 (clamp)
   - Case 3: `isRunning=true` -> setProgress trigger isDone=true -> advance 1500ms -> progress = 100
   - Case 4: `isRunning=false` mid-run -> progress reset 0

3. **E2E test extend** (Playwright)
   - `tests/e2e/import-export/csv-import-upload-and-export-download.spec.ts`:
     - Upload file leads -> assert dialog mở với "Đã kiểm tra"
     - Assert hiện count đúng
     - Click "Import" -> assert toast + status PROCESSING
     - Wait status COMPLETED -> assert successCount đúng
   - Test mới: cancel flow
     - Upload -> click "Huỷ" trong dialog -> assert status CANCELLED

4. **API test extend** (Vitest API integration)
   - `tests/api/import-export/csv-import-leads-customers-and-export-download.test.ts`:
     - POST /imports/leads -> assert status PENDING_REVIEW
     - Poll until status REVIEWED -> assert previewSummary có {totalRows, validRows, errorRows, sampleErrors}
     - POST /imports/:id/start -> assert status PROCESSING
     - Poll until COMPLETED -> assert successCount = validRows
     - State guard test: POST /:id/start lần 2 -> 409
     - Permission test: USER khác creator -> 403

5. **Manual QA checklist** (record kết quả vào PR description)
   - [ ] Upload CSV hợp lệ -> dialog mở < 5s, đủ count + 5 sample errors
   - [ ] Upload CSV all-error -> nút Import disabled
   - [ ] Bấm Import -> progress bar tăng đều
   - [ ] Job xong sớm (file ~30 row) -> bar ease-out lên 100% mượt
   - [ ] Job > 2 phút (file ~5000 row) -> bar dừng 99% chờ
   - [ ] Bấm Huỷ -> dialog đóng, status CANCELLED, file xoá khỏi disk
   - [ ] Refresh trang giữa REVIEWED -> dialog mở lại
   - [ ] Refresh trang giữa PROCESSING -> progress bar tiếp tục (từ 0 lại, OK)
   - [ ] Force FAIL (vd kill DB connection) -> bar đỏ, message rõ
   - [ ] Mobile responsive: dialog không bị cắt
   - [ ] Header CSV sai (không có cột phone) -> báo lỗi global, không cho start
   - [ ] Backward compat: gọi POST /imports/leads via curl + manual /start -> end-to-end pass

6. **Run full test suite**
   - `pnpm test` (unit)
   - `pnpm test:e2e` (Playwright)
   - Fix bất kỳ test cũ nào break do refactor (đặc biệt existing import test)

7. **Update docs**
   - `docs/codebase-summary.md`: thêm note về state machine ImportJob
   - `docs/project-changelog.md`: entry "Add CSV import preview + fake progress bar"

## Todo List

- [ ] Tạo `import-validation.service.spec.ts` với 7+ cases lead, 4+ cases customer
- [ ] Tạo `use-fake-progress.spec.ts` với 4 cases
- [ ] Extend e2e Playwright test cho preview + cancel flow
- [ ] Extend API integration test cho /start, /cancel + state guard + permission
- [ ] Run `pnpm test` pass
- [ ] Run `pnpm test:e2e` pass
- [ ] Manual QA 12 scenarios + record kết quả
- [ ] Update docs/codebase-summary.md + docs/project-changelog.md
- [ ] Update plan.md status -> completed (cho Phase 01-05) + đánh dấu Phase 06 done

## Success Criteria

- [ ] All unit tests pass
- [ ] All e2e tests pass
- [ ] Existing import test KHÔNG break
- [ ] Manual QA 12/12 scenarios pass
- [ ] Docs updated với note state machine + changelog entry
- [ ] No memory leak frontend (devtools profiler verify)

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Existing e2e test break do flow đổi | HIGH | Update test trong cùng PR, không skip |
| Mock Prisma trong unit test khó setup | MED | Dùng `vitest-mock-extended` hoặc factory pattern đơn giản |
| Playwright timing issue cho dialog mở | MED | Dùng `expect.poll` chờ status thay vì setTimeout |
| Manual QA bỏ sót edge case | LOW | Checklist 12 mục đã cover chính, document new edge cases tìm được |

## Security Considerations

- Test permission case (USER khác creator gọi /start /cancel -> 403)
- Test path traversal trên fileUrl (đã handled phase 03)
- Không commit file CSV test có data thật (dùng synthetic data)

## Next Steps

- Sau phase 06 done -> commit + push (theo rule project: commit mỗi feature xong)
- Update Notion VeloCRM progress DB (theo memory rule)
- Optional: tạo journal entry qua `/ck:journal` về implementation experience
