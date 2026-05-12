# Phase 05 - Tests + verification

## Context Links

- Plan overview: [plan.md](./plan.md)
- Phase trước: [phase-01](./phase-01-backend-extend-employee-scores-api.md), [phase-02](./phase-02-backend-call-operations-endpoints-labels-seed.md), [phase-04](./phase-04-frontend-page-redesign-4-tabs-sales-chips.md)

## Overview

- **Priority:** P1
- **Status:** Complete (manual smoke checklist only - no test framework in API)
- **Effort:** 2h
- **Mô tả:** Viết test cho 3 endpoint mới (calls + sales-breakdown + drill-down) + extend test cho employee-scores, smoke test cho frontend 3-tab, verify role guard và performance.

## Key Insights

- Project có tests API pattern trong `tests/api/` (đã bị xóa trong git status hiện tại - cần kiểm tra với user xem có khôi phục hay viết mới)
- Project có E2E pattern trong `tests/e2e/` (cũng bị xóa)
- Nếu tests folder bị xóa, viết minimal test trong `apps/api/src/modules/dashboard/__tests__/` (Jest unit test) thay vì restoring tests folder
- Frontend không có test framework rõ ràng - dùng manual smoke checklist

## Requirements

### Functional - Tests cần có

#### Backend unit tests (`apps/api/src/modules/dashboard/__tests__/`)

1. **`dashboard.service.spec.ts`** mở rộng:
   - `getEmployeeScores` trả đủ field mới (ordersCount, productsCount, untouchedLeads)
   - Untouched leads không đếm lead có activity
   - Empty result khi from > to
   - Filter deptId hoạt động

2. **`dashboard.service.spec.ts`** thêm test:
   - `getEmployeeCallReport`: answered = OUTGOING+INCOMING duration > 0
   - `getEmployeeSalesBreakdown`: trả đúng `topLabels[7]`, pivot count map đúng, `otherCount = totalLabeled - sum(top7)`, `untouchedCount` chỉ đếm lead không có outgoing call duration > 0
   - `getEmployeeSalesBreakdownCustomers`: 3 mode filter (labelId/untouched/other) trả đúng list, pagination cursor đúng

3. **Controller integration tests** (HTTP layer):
   - Role USER → 403
   - Role MANAGER → 200
   - Param `from` invalid date → 400
   - Drill-down: thiếu `userId` → 400
   - Drill-down: 3 mode khác nhau trả 3 list khác nhau
   - Cache: gọi 2 lần liên tiếp, lần 2 < 50ms

#### Frontend manual smoke test (checklist)

- [ ] Load `/dashboard/employees` không lỗi console
- [ ] Header KPI cards hiển thị đúng số
- [ ] 3 tab render đúng visual
- [ ] Switch tab giữ Range + Dept
- [ ] Range pills (week/month/quarter) re-fetch data
- [ ] Dept select filter đúng
- [ ] Tab Bán hàng: cột động đúng theo `topLabels` từ API
- [ ] Click cell trong tab Bán hàng mở side-panel với list KH đúng filter
- [ ] Side-panel pagination "Tải thêm" hoạt động
- [ ] Đóng side-panel: click X hoặc click outside
- [ ] Mobile (DevTools 375px): tab scroll ngang, table sticky cột, side-panel full-screen
- [ ] URL `?tab=sales` refresh giữ state
- [ ] Role USER thường truy cập → "Bạn không có quyền"

### Non-functional - Performance verification

- API endpoint `/employee-scores`: < 500ms với 200 user, 10k lead
- API endpoint `/employee-reports/calls`: < 800ms với 100k call_logs
- API endpoint `/employee-reports/sales-breakdown`: < 1000ms (pivot)
- API endpoint `/employee-reports/sales-breakdown/customers`: < 300ms (drill-down)
- Cache hit lần 2: < 50ms cả endpoint
- Frontend tab switch: < 100ms (data cached)

## Architecture

```
Tests structure
 ├─ apps/api/src/modules/dashboard/__tests__/
 │   ├─ dashboard.service.spec.ts (unit, Jest)
 │   └─ dashboard.controller.spec.ts (integration, Supertest)
 ├─ packages/database/prisma/seed-test.ts (test fixtures)
 └─ docs/test-checklists/employees-dashboard.md (manual smoke)
```

## Related Code Files

### Read for context (MUST read before coding)
- `apps/api/src/modules/dashboard/dashboard.service.ts` (sau khi Phase 01-02 đã modify)
- Any existing `.spec.ts` file trong `apps/api/src/modules/` để học pattern test (vd `apps/api/src/modules/leads/leads.service.spec.ts` nếu có)
- `package.json` apps/api - check script `test` đang dùng Jest hay Vitest
- `apps/api/jest.config.js` hoặc `vitest.config.ts` để biết config

### Create
- `apps/api/src/modules/dashboard/__tests__/dashboard-employee-reports.service.spec.ts`
- `apps/api/src/modules/dashboard/__tests__/dashboard-employee-reports.controller.spec.ts`
- `docs/test-checklists/employees-dashboard.md` - manual smoke checklist

### Modify (nếu có file spec sẵn)
- Existing `dashboard.service.spec.ts` nếu đã có

## Implementation Steps

1. **Đọc** config test trong api: `apps/api/package.json`, `jest.config.*` hoặc `vitest.config.*`
2. **Đọc** 1-2 spec file hiện hành để học pattern (mock Prisma, fixtures)
3. **Viết** `dashboard-employee-reports.service.spec.ts`:
   - Mock PrismaService với fixture data: 3 user, 5 lead, 2 order, 4 call_log, 3 activity
   - Test từng method với fixture
4. **Viết** controller spec với Supertest:
   - Mock auth bằng request user override
   - Test 200/403/400 cho 3 endpoint
5. **Performance test ad-hoc**:
   - Seed staging DB ~200 user, 50k call, 10k lead
   - Chạy curl `time` đo response cho mỗi endpoint
   - EXPLAIN ANALYZE trong psql
6. **Viết** `docs/test-checklists/employees-dashboard.md` - checklist manual cho QA
7. **Run** `pnpm test` apps/api - đảm bảo pass
8. **Manual smoke** trên dev: load page, click tab, change range/dept, filter chip
9. **Verify** role guard: login user role USER thường, không thấy được trang

## Todo List

- [ ] Đọc config test framework (Jest/Vitest)
- [ ] Đọc 1-2 spec file mẫu hiện có
- [ ] Viết service spec (8-10 test case)
- [ ] Viết controller spec (role guard + param validation)
- [ ] Performance test ad-hoc 3 endpoint
- [ ] Viết manual smoke checklist trong docs/
- [ ] Run `pnpm test` pass
- [ ] Manual smoke trên dev local
- [ ] Verify role guard
- [ ] Update `docs/project-changelog.md` ghi feature mới
- [ ] Update `docs/development-roadmap.md` mark phase complete

## Success Criteria

- Tất cả test pass: `pnpm test` không error
- Coverage cho dashboard service > 70% (riêng 3 method mới)
- Manual smoke checklist hoàn thành 100%
- Performance đạt SLA (< 500ms / < 800ms)
- Role guard hoạt động cả 3 endpoint
- Docs updated (changelog + roadmap)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Test framework không có sẵn (project mới) | Setup Jest + Supertest theo NestJS docs |
| Fixture data phức tạp khó setup | Dùng factory pattern hoặc seed test data riêng |
| Performance test trên dev không reflect prod | Test trên staging mirror prod data nếu có |
| Mock Prisma raw SQL khó | Dùng Prisma test container (`@testcontainers/postgresql`) hoặc shared test DB |
| Time test bị flaky do clock skew | Mock `Date.now()` với jest fake timers |

## Security Considerations

- Test không leak secrets vào fixture (use fake JWT)
- Test DB không reuse prod data
- Role guard test cover cả negative case (USER → 403)

## Next Steps

- Sau khi Phase 05 done: commit + push toàn bộ feature
- Cập nhật `docs/project-changelog.md` với entry feature
- Cập nhật `docs/development-roadmap.md` mark task complete
- Future: thêm E2E test khi tests/ folder được khôi phục
