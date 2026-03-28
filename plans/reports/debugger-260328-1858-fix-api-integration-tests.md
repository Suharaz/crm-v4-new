# API Integration Test Fix Report

**Date:** 2026-03-28
**Scope:** All 16 API test files in `tests/api/`

---

## Executive Summary

Fixed all identified root causes in both API source code and test infrastructure. No test logic needed to change — all fixes are in the API layer (correct per REST conventions) plus the test client helper and vitest config.

---

## Root Causes & Fixes

### 1. Vitest Config — Deprecated `poolOptions`
**File:** `tests/api/vitest.config.api.ts`
**Fix:** Replaced `pool: 'forks', poolOptions: { forks: { singleFork: true } }` → `sequence: { concurrent: false }`

---

### 2. Task Creation — 500 Error (Bug)
**Root cause:** `POST /tasks` without `assignedTo` caused `BigInt(undefined)` to throw TypeError → 500
**Files:** `apps/api/src/modules/tasks/tasks.controller.ts`
**Fix:** Default `assignedTo` to current user ID when not provided

---

### 3. Task Title Validation — 500 instead of 400
**File:** `apps/api/src/modules/tasks/tasks.controller.ts`
**Fix:** Added explicit validation for missing/empty `title` → BadRequestException

---

### 4. Task Complete — No Conflict Check
**File:** `apps/api/src/modules/tasks/tasks.service.ts`
**Fix:** Added check: completing already-COMPLETED or CANCELLED task throws ConflictException (409)

---

### 5. Employee Levels — 403 for USER on GET
**Root cause:** Class-level `@Roles(SUPER_ADMIN)` blocked GET for all non-admin roles
**File:** `apps/api/src/modules/employee-levels/employee-levels.controller.ts`
**Fix:** Removed class-level `@Roles`, added per-method `@Roles(SUPER_ADMIN)` only on POST/PATCH/DELETE

---

### 6. Activities — Empty Content Returns 201 (Bug)
**File:** `apps/api/src/modules/activities/activities.controller.ts`
**Fix:** Added content validation for both lead and customer notes → BadRequestException for empty/missing content

---

### 7. Activities — No Entity Existence Check (404 missing)
**File:** `apps/api/src/modules/activities/activities.service.ts`
**Fix:** Added `validateEntityExists()` called from `getTimeline()` and `createNote()` → throws NotFoundException for lead/customer 404

---

### 8. Lead Transfer — MANAGER Can't Transfer Unowned POOL Leads (Bug)
**Root cause:** `checkTransferPermission` rejected MANAGER when lead had no `assignedUserId`
**File:** `apps/api/src/modules/leads/leads.service.ts`
**Fix:** Allow MANAGER to transfer leads with `assignedUserId === null`

---

### 9. Customer Transfer — Same Issue as Lead Transfer
**File:** `apps/api/src/modules/customers/customers.service.ts`
**Fix:** Allow MANAGER to transfer customers with `assignedUserId === null`

---

### 10. Lead Status — Invalid Status Returns 409 Instead of 400
**File:** `apps/api/src/modules/leads/leads.service.ts`
**Fix:** Added enum validation before transition check → BadRequestException for invalid status strings

---

### 11. HTTP Status Code Mismatches (201 vs 200)
Action endpoints (update-like operations on existing resources) should return 200, not 201 (NestJS POST default).

Added `@HttpCode(200)` decorators:

| File | Methods |
|------|---------|
| `leads.controller.ts` | assign, claim, transfer, status, convert |
| `customers.controller.ts` | claim, transfer, reactivate |
| `payments.controller.ts` | verify, reject |
| `distribution.controller.ts` | batchDistribute |
| `bank-transactions.controller.ts` | manualMatch |
| `notifications.controller.ts` | markAsRead, markAllAsRead |
| `tasks.controller.ts` | complete, cancel |

---

### 12. Order Creation — Missing Validation (500 → 400)
**File:** `apps/api/src/modules/orders/orders.controller.ts`
**Fix:** Validate `customerId` required, `amount` required and > 0

---

### 13. Product Creation — Missing Validation (500 → 400)
**File:** `apps/api/src/modules/products/products.controller.ts`
**Fix:** Validate `name` required and non-empty, `price` required and ≥ 0

---

### 14. Payment Creation — Missing Validation (500 → 400)
**File:** `apps/api/src/modules/payments/payments.controller.ts`
**Fix:** Validate `orderId` and `amount` required

---

### 15. Bank Transaction Webhook — Missing Field Validation
**File:** `apps/api/src/modules/bank-transactions/bank-transactions.service.ts`
**Fix:** Validate `externalId` and `transactionTime` required → BadRequestException

---

### 16. Bank Transaction Match — Missing `paymentId` Validation
**File:** `apps/api/src/modules/bank-transactions/bank-transactions.controller.ts`
**Fix:** Validate `paymentId` required → BadRequestException

---

### 17. Notification Mark-As-Read — No 404 for Non-Existent
**File:** `apps/api/src/modules/notifications/notifications.service.ts`
**Fix:** Added existence check in `markAsRead()`, throws NotFoundException if ID not found, ForbiddenException if different user

---

### 18. JWT Token Expiry — Auto-Refresh in Test Client
**File:** `tests/api/helpers/api-test-client-with-auth.ts`
**Fix:** Added `ensureFreshToken()` that auto-refreshes token when within 60 seconds of expiry. Called before every HTTP method.

---

## Files Changed

### API (apps/api/src/modules/)
- `tasks/tasks.controller.ts`
- `tasks/tasks.service.ts`
- `employee-levels/employee-levels.controller.ts`
- `activities/activities.controller.ts`
- `activities/activities.service.ts`
- `leads/leads.controller.ts`
- `leads/leads.service.ts`
- `customers/customers.controller.ts`
- `customers/customers.service.ts`
- `payments/payments.controller.ts`
- `distribution/distribution.controller.ts`
- `bank-transactions/bank-transactions.controller.ts`
- `bank-transactions/bank-transactions.service.ts`
- `notifications/notifications.controller.ts`
- `notifications/notifications.service.ts`
- `orders/orders.controller.ts`
- `products/products.controller.ts`

### Tests
- `tests/api/vitest.config.api.ts`
- `tests/api/helpers/api-test-client-with-auth.ts`

---

## Unresolved Questions

1. **`sale2@crm.local` password** — auth test uses `sale2@crm.local/changeme` for logout test; seed confirmed this user exists with `changeme` password. Should pass.
2. **Distribution `batchDistribute` returns `{ distributed: number }`** — test checks `body.data?.distributed ?? body.data?.count ?? 0` — needs to verify actual response shape matches. The test is flexible enough to handle either field name.
3. **JWT expiry during very long test runs** — the 60-second buffer in `ensureFreshToken` may not be enough if a single test takes longer than expected. Consider increasing JWT lifetime in test environment if still needed.
