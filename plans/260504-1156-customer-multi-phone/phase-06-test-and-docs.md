# Phase 06 — Test + Docs

**Priority:** Medium
**Status:** ⬜ Pending
**Estimate:** 2h
**Depends on:** Phase 05

## Context

Đảm bảo behavior đúng thông qua tests + cập nhật documentation cho team biết tính năng mới.

## Requirements

### Functional
- **Unit test:** `CustomerPhonesService` 6 method.
- **Integration test:** API endpoints (4 endpoints, 2 role).
- **Edge case test:** Cross-table dedup (số chính KH A trùng số phụ KH B).
- **Docs:** Update `changelog.md`, `docs/code-standards.md` (nếu có pattern mới đáng note).

### Non-functional
- Test không dùng mocks cho DB layer (theo memory feedback) — dùng real test DB.
- Tests fast (<10s tổng).

## Related Code Files

### Read for context
- Test pattern hiện có: `apps/api/test/**/*.spec.ts` hoặc `**/*.e2e-spec.ts`
- `vitest.config.ts` / `jest.config.ts` — runner setup
- `docs/code-standards.md`, `docs/changelog.md` (hoặc `docs/project-changelog.md`)

### Create
- `apps/api/src/modules/customers/customer-phones.service.spec.ts` — unit
- `apps/api/test/customer-phones.e2e-spec.ts` — integration

### Modify
- `docs/changelog.md` (hoặc `project-changelog.md`)
- `docs/code-standards.md` — thêm pattern "phone matching cross-table" (nếu phù hợp)

## Implementation Steps

### Step 1: Unit test `CustomerPhonesService`

```typescript
describe('CustomerPhonesService', () => {
  describe('findCustomerByAnyPhone', () => {
    it('returns customer when phone matches primary', async () => {...});
    it('returns customer when phone matches alt phone', async () => {...});
    it('returns null when no match', async () => {...});
    it('skips soft-deleted alt phones', async () => {...});
  });

  describe('assertPhoneNotExists', () => {
    it('throws when phone exists as primary of another customer', async () => {...});
    it('throws when phone exists as alt of another customer', async () => {...});
    it('does not throw when phone exists on excludeCustomerId', async () => {...});
    it('throws when phone format is invalid', async () => {...});
  });

  describe('addPhone', () => {
    it('creates phone for given customer', async () => {...});
    it('rejects duplicate phone (cross-customer)', async () => {...});
    it('normalizes phone before save', async () => {...});
  });

  describe('updatePhone / softDeletePhone / listPhones', () => {...});
});
```

### Step 2: Integration test API

```typescript
describe('POST /customers/:id/phones', () => {
  it('MANAGER can add phone', async () => {...});       // 201
  it('SALE gets 403', async () => {...});                // 403
  it('rejects if phone duplicates another customer', async () => {...});  // 409
  it('rejects invalid phone format', async () => {...});  // 400
});

describe('Cross-table dedup', () => {
  it('cannot create customer with phone same as alt phone of existing customer', async () => {
    // 1. customer A has alt phone 0902222222
    // 2. POST /customers { phone: '0902222222' } → 409
  });

  it('searchByPhone matches alt phones too', async () => {
    // search '0902222222' → returns customer A
  });

  it('CSV import lead with phone matching alt phone → reuses existing customer', async () => {...});
});
```

### Step 3: Run tests

```bash
pnpm test                      # unit
pnpm test:e2e                  # integration
```

Mọi test phải pass. Coverage ≥80% cho service mới.

### Step 4: Update changelog

`docs/project-changelog.md` (hoặc `changelog.md`):

```markdown
## [Unreleased]

### Added
- Customer can now have multiple alternate phone numbers (số phụ) — bảng `customer_phones`.
- API `GET/POST/PATCH/DELETE /customers/:id/phones` (MANAGER+ for mutations).
- Search and dedup now match alternate phones across all customers.
- UI section "Số điện thoại khác" on customer detail page.

### Changed
- `searchByPhone` returns customer if input matches primary OR alternate phone.
- CSV import + 3rd party API findOrCreate now matches alternate phones.
```

### Step 5: Update code-standards (nếu cần)

Thêm pattern dùng `CustomerPhonesService.findCustomerByAnyPhone()` thay cho `findFirst({ phone })` khi cần lookup customer theo SĐT.

### Step 6: Commit + push

Theo CLAUDE.md project: "Mỗi khi hoàn thành 1 tính năng cần commit và push luôn nếu không lỗi gì."

```bash
git add .
git commit -m "feat(customers): add multi-phone support with cross-table dedup"
git push origin master
```

> Hỏi user trước khi push (theo memory: NEVER edit/push without explicit approval).

## Todo List

- [ ] Viết unit test `CustomerPhonesService` (≥10 test cases)
- [ ] Viết integration test 4 API endpoints (≥8 test cases)
- [ ] Viết edge case test cross-table dedup (≥3 test cases)
- [ ] Run `pnpm test` — all green
- [ ] Run `pnpm test:e2e` — all green
- [ ] Coverage ≥80% cho service mới
- [ ] Update `docs/project-changelog.md` (hoặc tương đương)
- [ ] Update `docs/code-standards.md` nếu phù hợp
- [ ] Commit message conventional format
- [ ] Hỏi user trước khi push

## Success Criteria

- [ ] All tests pass (unit + e2e).
- [ ] Coverage ≥80% cho `CustomerPhonesService`.
- [ ] Changelog cập nhật rõ ràng.
- [ ] Code review pass (delegate `code-reviewer` agent).
- [ ] Commit message đúng format conventional.

## Risk

| Risk | Mitigation |
|---|---|
| Test DB state leak giữa các test | Dùng `beforeEach` truncate hoặc transaction rollback |
| Flaky test do timing | Tránh `setTimeout`, await đúng promise |
| Forget update docs | Checklist trên |

## Security

- Test xác nhận RBAC làm việc đúng (Sale 403).
- Test xác nhận access filter không bị bypass.

## Next Steps

- Sau phase này: feature ready for QA.
- Theo dõi production logs xem có edge case nào miss.
