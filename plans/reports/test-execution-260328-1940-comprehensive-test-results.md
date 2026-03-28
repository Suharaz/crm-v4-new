# Test Execution Report — CRM V4

**Date:** 2026-03-28 | **Branch:** master | **Executor:** Claude Code

---

## Summary

| Category | Files | Tests | Passed | Failed | Skipped | Status |
|----------|-------|-------|--------|--------|---------|--------|
| Unit Tests | 9 | 195 | 195 | 0 | 0 | **ALL PASS** |
| API Integration | 16 | 288 | 288 | 0 | 0 | **ALL PASS** |
| E2E Playwright | 13 | 66 | 48 | 0 | 18 | **ALL PASS** |
| **TOTAL** | **38** | **549** | **531** | **0** | **18** | **ALL PASS** |

---

## 1. Unit Tests (Vitest) — 195/195 PASSED

**Config:** `tests/unit/vitest.config.unit.ts` | **Duration:** ~1.2s

| File | Tests | Status |
|------|-------|--------|
| `utils/phone-normalization-and-validation.test.ts` | ✓ | PASS |
| `utils/csv-formula-injection-sanitizer.test.ts` | ✓ | PASS |
| `validation/zod-form-schemas-vietnamese-validation.test.ts` | 40 | PASS |
| `services/lead-status-transition-rules.test.ts` | ✓ | PASS |
| `services/payment-matching-and-conversion-trigger.test.ts` | ✓ | PASS |
| `services/ai-distribution-weighted-scoring.test.ts` | ✓ | PASS |
| `services/assignment-template-round-robin-distribution.test.ts` | ✓ | PASS |
| `services/auto-recall-pool-expiry-logic.test.ts` | ✓ | PASS |
| `guards/roles-guard-authorization-logic.test.ts` | ✓ | PASS |

### Fixes Applied
- **Zod 4 API:** `orderSchema.customerId` — use `error` instead of `required_error` for type-level error message (Zod 4 breaking change from v3)

---

## 2. API Integration Tests (Vitest) — 288/288 PASSED

**Config:** `tests/api/vitest.config.api.ts` | **Duration:** ~88s

| File | Tests | Status |
|------|-------|--------|
| `auth/auth-login-refresh-logout-me-endpoints.test.ts` | 15 | PASS |
| `users/users-crud-and-rbac-role-access-control.test.ts` | 17 | PASS |
| `leads/leads-create-read-update-delete-crud.test.ts` | 16 | PASS |
| `leads/leads-status-transitions-valid-and-invalid.test.ts` | 12 | PASS |
| `leads/leads-pool-assign-claim-transfer-operations.test.ts` | 20 | PASS |
| `customers/customers-crud-transfer-dedup-reactivate.test.ts` | 22 | PASS |
| `orders/orders-create-status-and-payments-verify-reject.test.ts` | 22 | PASS |
| `products/products-crud-with-price-and-vat.test.ts` | 13 | PASS |
| `settings/settings-lookup-tables-departments-sources-labels-crud.test.ts` | 27 | PASS |
| `tasks/tasks-create-complete-cancel-update-delete-scoped-by-user.test.ts` | 18 | PASS |
| `search/global-search-grouped-results-min-chars.test.ts` | 7 | PASS |
| `notifications/notifications-list-unread-count-mark-read.test.ts` | 8 | PASS |
| `import-export/csv-import-leads-customers-and-export-download.test.ts` | 20 | PASS |
| `distribution/ai-distribution-config-scores-batch-distribute.test.ts` | 12 | PASS |
| `bank-transactions/bank-webhook-ingest-dedup-automatch-manual-match.test.ts` | 17 | PASS |
| `activities/activity-timeline-notes-auto-inprogress-trigger.test.ts` | 22 | PASS |

### Fixes Applied (API Source)
1. **Throttle config:** Env-configurable `THROTTLE_LIMIT`/`THROTTLE_AUTH_LIMIT` for testing
2. **Self-deactivation guard:** `UsersService.deactivate()` blocks self-deactivation (400)
3. **@HttpCode(200):** Added on 12 action endpoints (assign, claim, transfer, verify, reject, complete, cancel, etc.)
4. **Task creation fix:** `BigInt(undefined)` crash for missing `assignedTo` → now optional
5. **EmployeeLevels GET:** Removed class-level `@Roles()` so all authenticated users can view
6. **Activities validation:** Empty content → 400, non-existent entity → 404
7. **Lead transfer permission:** MANAGER can transfer POOL leads without ownership
8. **Query DTOs:** Added `TaskListQueryDto`, `OrderListQueryDto`, `ProductListQueryDto`, `BankTransactionListQueryDto`, `PaymentListQueryDto` for filter params rejected by `forbidNonWhitelisted`
9. **Leads DTO:** Added `notes` to `CreateLeadDto`
10. **Payment verify:** Moved `findById()` outside `$transaction()` to avoid stale read

### Fixes Applied (Tests)
- JWT auto-refresh helper with 60s buffer
- Vitest 4 config migration (remove deprecated `poolOptions`)
- Random phone numbers in dedup tests (avoid seed collision)
- Bank-transaction manual match test uses fresh unique tx

---

## 3. E2E Playwright Tests — 48/48 PASSED (18 skipped)

**Config:** `tests/playwright.config.ts` | **Duration:** ~19min | **Browser:** Chrome (system)

| File | Passed | Skipped | Status |
|------|--------|---------|--------|
| `auth/login-logout-and-session-guard.spec.ts` | 9 | 0 | PASS |
| `leads/lead-crud-create-edit-delete-convert.spec.ts` | ✓ | — | PASS |
| `leads/lead-pools-kho-moi-kho-phong-ban-tha-noi.spec.ts` | ✓ | — | PASS |
| `leads/lead-assign-claim-transfer-between-pools.spec.ts` | ✓ | — | PASS |
| `customers/customer-crud-claim-transfer-role-visibility.spec.ts` | ✓ | — | PASS |
| `orders/order-create-status-change-payment-verify.spec.ts` | ✓ | — | PASS |
| `products/product-crud-via-dialog-price-format-vnd.spec.ts` | ✓ | — | PASS |
| `settings/settings-tabs-departments-levels-sources-labels-payment-types.spec.ts` | ✓ | — | PASS |
| `users/user-management-crud-roles-deactivate-admin-only.spec.ts` | ✓ | — | PASS |
| `tasks/task-quick-add-complete-cancel-edit-delete.spec.ts` | ✓ | — | PASS |
| `dashboard/dashboard-kpi-stats-cards-per-role.spec.ts` | ✓ | — | PASS |
| `search/global-search-dropdown-results-navigation.spec.ts` | ✓ | — | PASS |
| `notifications/notification-bell-unread-count-mark-read.spec.ts` | ✓ | — | PASS |

### Fixes Applied
- Test credentials updated: `admin@crm.vn` → `admin@crm.local`, passwords → `changeme`
- Playwright config: `channel: 'chrome'` (Chromium headless shell ICU data issue on Windows)
- Error message matching: "Email hoặc mật khẩu không đúng"

### Screenshots Captured
Screenshots stored in `tests/test-results/screenshots/` — includes login flow, dashboard, error states.

---

## Commits
1. `fix: use Zod 4 error API for orderSchema customerId`
2. `fix: resolve all API integration test failures (288/288 passing)`
3. `fix: E2E tests — update credentials, Chrome channel, error messages`

---

## Unresolved
- 18 E2E tests skipped — feature-level specs awaiting frontend implementation
- Test upload CSVs committed to repo (may want to gitignore `apps/api/uploads/`)
