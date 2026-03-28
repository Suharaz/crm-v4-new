# Phase Implementation Report

## Executed Phase
- Phase: Playwright E2E Test Suites
- Plan: none (direct task)
- Status: completed

## Files Created

### Config
- `tests/playwright.config.ts` — chromium only, screenshot always, video retain-on-failure, 30s timeout, html+list reporter

### Helpers (3 files)
- `tests/helpers/test-auth-login-helper.ts` — loginAs/loginAsAdmin/loginAsManager/loginAsUser/logout helpers
- `tests/helpers/test-api-data-factory.ts` — createTestLead/Customer/Product/Order via fetch() + cleanup helpers
- `tests/helpers/test-screenshot-on-step-helper.ts` — screenshotStep/screenshotFullPage with auto timestamp naming

### E2E Spec Files (14 files)
- `tests/e2e/auth/login-logout-and-session-guard.spec.ts` — 7 tests: login 3 roles, wrong password, logout, session guard, persist
- `tests/e2e/leads/lead-crud-create-edit-delete-convert.spec.ts` — 4 tests: create, edit, delete, convert
- `tests/e2e/leads/lead-pools-kho-moi-kho-phong-ban-tha-noi.spec.ts` — 6 tests: pool visibility per role
- `tests/e2e/leads/lead-assign-claim-transfer-between-pools.spec.ts` — 4 tests: assign, claim, transfer dept, transfer floating
- `tests/e2e/customers/customer-crud-claim-transfer-role-visibility.spec.ts` — 6 tests: CRUD + claim + transfer + role visibility
- `tests/e2e/orders/order-create-status-change-payment-verify.spec.ts` — 5 tests: list, create, status change, add payment, verify
- `tests/e2e/products/product-crud-via-dialog-price-format-vnd.spec.ts` — 6 tests: list, open dialog, create, VND format, edit, delete
- `tests/e2e/settings/settings-tabs-departments-levels-sources-labels-payment-types.spec.ts` — 7 tests: access, 5 tabs, CRUD dept/source/label
- `tests/e2e/users/user-management-crud-roles-deactivate-admin-only.spec.ts` — 6 tests: SUPER_ADMIN access, manager/user blocked, create/edit/deactivate
- `tests/e2e/tasks/task-quick-add-complete-cancel-edit-delete.spec.ts` — 7 tests: page, dialog create, quick add, complete, cancel, edit, delete, filter tab
- `tests/e2e/dashboard/dashboard-kpi-stats-cards-per-role.spec.ts` — 5 tests: admin/manager/user view, no "--", no JS errors
- `tests/e2e/search/global-search-dropdown-results-navigation.spec.ts` — 7 tests: bar visible, dropdown, grouped results, empty, clear, navigate, escape
- `tests/e2e/notifications/notification-bell-unread-count-mark-read.spec.ts` — 7 tests: bell, badge, dropdown, list, mark-read, mark-all-read, outside-click
- `tests/e2e/import-export/csv-import-upload-and-export-download.spec.ts` — 5 tests: export leads, export customers, import page, upload valid CSV, invalid file error
- `tests/e2e/distribution/ai-distribution-config-weights-batch-assign.spec.ts` — 7 tests: admin/manager access, user blocked, weights config, save, preview scores, batch distribute

## Tasks Completed
- [x] playwright.config.ts — chromium, screenshot always, video retain-on-failure, 30s timeout
- [x] helpers/test-auth-login-helper.ts — loginAs(page, role) + shortcuts
- [x] helpers/test-api-data-factory.ts — createTest* via fetch API + cleanup
- [x] helpers/test-screenshot-on-step-helper.ts — screenshotStep with auto naming
- [x] auth spec — 7 test cases incl. session guard
- [x] leads specs — 3 files covering CRUD, pools, assign/claim/transfer
- [x] customers spec — CRUD + claim + transfer + role visibility
- [x] orders spec — create, status change, payment create/verify
- [x] products spec — dialog CRUD + VND price format assertion
- [x] settings spec — 5 tabs + CRUD per tab
- [x] users spec — admin-only access + CRUD + deactivate
- [x] tasks spec — quick add + complete/cancel/edit/delete + filter tabs
- [x] dashboard spec — KPI cards per role, real values (not "--"), no JS errors
- [x] search spec — dropdown, grouped results, navigation, escape
- [x] notifications spec — bell, unread count, mark-read, mark-all-read
- [x] import-export spec — CSV export download event, upload valid/invalid CSV
- [x] distribution spec — role access + weights config + batch distribute

## Tests Status
- Type check: not run (write-only task per instructions)
- Unit tests: not run
- Integration tests: not run

## Design Decisions
- `test.skip()` used for cases requiring pre-existing data that may not exist in seed — safe degradation
- No `waitForTimeout` except after debounced API calls (search 300ms debounce, notifications)
- Role-access "blocked" tests use flexible assertion (redirect OR heading not visible) — handles both middleware redirect and 403 page
- Export tests use `page.waitForEvent('download')` pattern — proper download detection
- All selectors use role-based or text-based locators per Playwright best practices; CSS class fallbacks only where necessary

## Issues Encountered
None — all files written as specified.

## Next Steps
- Run `pnpm add -D @playwright/test` in workspace root or `apps/web` before executing
- Run `npx playwright install chromium` to install browser
- Start dev servers (`pnpm dev`) before running `npx playwright test --config tests/playwright.config.ts`
- Seed database (`pnpm db:seed`) to ensure test accounts exist
