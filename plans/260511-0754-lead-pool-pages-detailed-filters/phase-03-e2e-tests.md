# Phase 03: E2E Tests Filter Trên Pool Pages

**Phase ID:** `phase-03-e2e-tests`
**Effort:** ~2h
**Priority:** P1
**Status:** Pending
**Blocked by:** Phase 02 (Frontend wire filter bar)

---

## Context Links

- Plan: [../plan.md](../plan.md)
- Phase trước: [phase-02-frontend-wire-filter-bar.md](./phase-02-frontend-wire-filter-bar.md)
- Skills cần activate: `test`, `playwright-expert`, `web-testing`, `sequential-thinking`

---

## Overview

Viết Playwright E2E tests verify filter hoạt động đúng trên 4 trang pool. Test cover: filter từng cái, filter combo, clear all, URL share, localStorage persistence per-page.

---

## Key Insights

- Test có sẵn pattern trong `tests/e2e/leads/` (đã có nhiều file - check existing trước).
- Cần seed data: tối thiểu 3-5 leads với source/product/dept/user khác nhau cho mỗi pool type.
- Login as manager+ role để thấy `/pool/new`, `/pool/zoom`, `/dept`. Login any role để thấy `/floating`.

---

## Requirements

### Functional Test Cases

#### Per page (4 trang × 6 case = 24 case)
1. **Filter by source:** chọn nguồn → list chỉ còn lead nguồn đó.
2. **Filter by product:** chọn sản phẩm → list filter đúng.
3. **Filter by assigned user:** chọn user → list filter đúng (relevant với pool/new "72h distributed" + dept pool).
4. **Filter combo:** source + product + dept → list filter đúng tất cả.
5. **Search:** nhập tên/SĐT → list filter đúng.
6. **Clear all:** click "Xóa lọc" → list về full + URL không có params + localStorage clear.

#### Cross-page (2 case)
7. **No bleed:** filter `sourceId=1` ở `/leads/pool/new`, navigate sang `/floating` → filter KHÔNG xuất hiện.
8. **URL share:** copy URL có filter, paste vào tab mới → cùng filter restored.

#### Refresh (1 case)
9. **LocalStorage restore:** set filter → close tab → mở tab mới đúng URL không params → filter restored từ localStorage.

### Non-functional
- Tests chạy parallel-safe (mỗi test có teardown).
- Total test runtime < 2 phút.

---

## Architecture

```
tests/e2e/leads/
├── lead-pool-filters.spec.ts        # NEW - 4 pool pages
├── helpers/
│   └── pool-filter-helpers.ts       # NEW - reusable helpers (optional, if needed)
└── fixtures/
    └── pool-test-data.ts            # NEW - seed data factory
```

---

## Related Code Files

### To read first
- `tests/e2e/leads/` - existing E2E test files (find pattern)
- `tests/e2e/helpers/` hoặc `tests/playwright.config.ts` - config + auth helpers
- `apps/web/src/components/leads/lead-list-advanced-filter-bar.tsx` - selector reference
- `apps/api/test/fixtures/` - existing seed data pattern (nếu có)

### To create
- `tests/e2e/leads/lead-pool-filters.spec.ts` (new)

### To possibly modify
- Test fixtures nếu cần seed thêm data cho pool scenarios.

---

## Implementation Steps

1. **Activate skills:** `playwright-expert`, `web-testing`.
2. **Read existing tests:** Tìm pattern auth, page navigation, data-testid trong `tests/e2e/leads/` (chưa biết cụ thể, scout sẽ confirm).
3. **Identify selectors:** Filter bar elements - check component để biết text labels hoặc data-testid:
   - Input search: placeholder "Tìm theo tên, SĐT, email..."
   - Button "Bộ lọc"
   - Select "Nguồn", "Sản phẩm", "Nhân viên", "Phòng ban", "Nhãn", "Đã mua"
   - Input date "Từ ngày" / "Đến ngày"
   - Button "Xóa lọc"
4. **Write helper functions** (nếu cần):
   - `expandFilterBar(page)` - click "Bộ lọc" button
   - `selectFilter(page, label, value)` - chọn dropdown
   - `getLeadRowCount(page)` - đếm rows trong table
5. **Write test cases** (per spec file):
   - `describe('Lead Pool Filters - /pool/new')` → 6 case
   - `describe('Lead Pool Filters - /pool/zoom')` → 6 case
   - `describe('Lead Pool Filters - /dept')` → 6 case
   - `describe('Lead Pool Filters - /floating')` → 6 case
   - `describe('Cross-page')` → 3 case (no bleed, URL share, localStorage restore)
6. **Seed data setup:**
   - `beforeAll`: tạo 5 leads pool với source/product/dept khác nhau qua API.
   - `afterAll`: cleanup leads tạo.
7. **Run tests:** `pnpm test:e2e tests/e2e/leads/lead-pool-filters.spec.ts`.
8. **Fix flakiness nếu có:** dùng `waitForURL`, `waitForResponse`, KHÔNG dùng `waitForTimeout` (anti-pattern).

---

## Todo List

- [ ] Scout `tests/e2e/leads/` để hiểu existing pattern
- [ ] Activate skill `playwright-expert`
- [ ] Tạo `lead-pool-filters.spec.ts`
- [ ] Viết helper `expandFilterBar` + `selectFilter` (nếu cần)
- [ ] Test case: filter source per page (4 case)
- [ ] Test case: filter product per page (4 case)
- [ ] Test case: filter assigned user per page (4 case)
- [ ] Test case: filter combo (4 case)
- [ ] Test case: search per page (4 case)
- [ ] Test case: clear all per page (4 case)
- [ ] Test case: cross-page no bleed
- [ ] Test case: URL share
- [ ] Test case: localStorage restore
- [ ] Seed data factory (beforeAll/afterAll)
- [ ] Run full E2E suite verify pass
- [ ] Fix flakiness nếu có
- [ ] Commit: `test(leads-pool): add e2e tests for pool page filters`

---

## Success Criteria

- [ ] Tất cả 27 test case pass.
- [ ] Total runtime < 2 phút.
- [ ] Không có `waitForTimeout` cứng trong code (dùng `waitForURL` / `waitForResponse`).
- [ ] Tests chạy isolated (parallel-safe).
- [ ] CI pipeline xanh sau khi push.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Test flaky do race condition data | High | Seed unique data per test, dùng `waitForResponse('/leads/pool/...')` |
| Selector brittle (text-based) | Medium | Thêm `data-testid` vào filter bar nếu cần (Phase 02 có thể add) |
| Long runtime do nhiều case | Low | Run parallel via Playwright workers |
| Localstorage state leak giữa test | Medium | `await context.clearCookies()` + `localStorage.clear()` ở `beforeEach` |

---

## Security Considerations

- Test data KHÔNG dùng real PII.
- Test credentials chỉ dùng môi trường test (đọc từ `.env.test`).

---

## Common Pitfalls (Junior Reminder)

1. **Đừng dùng `page.waitForTimeout(1000)`** - flaky. Dùng `waitForURL` hoặc `waitForResponse`.
2. **Đừng hardcode lead ID** - dùng API tạo + return ID.
3. **Đừng quên `afterAll` cleanup** - leak data sang test khác.
4. **Đừng login mỗi test** - dùng Playwright `storageState` để share auth.

---

## Learn More

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright Auth Storage State](https://playwright.dev/docs/auth)

---

## Next Steps

→ Plan complete. Update `docs/development-roadmap.md` + `docs/project-changelog.md` qua docs-manager agent sau khi tất cả phase merge.
