# Plan: Customer Multi-Phone (Số điện thoại phụ cho khách hàng)

**Created:** 2026-05-04 11:56
**Slug:** customer-multi-phone
**Branch:** master
**Estimate:** ~10-14h

## Mục tiêu

Cho phép mỗi Customer có **nhiều số điện thoại** (1 chính + N phụ), với:
- **Dedup cross-table** — không cho 2 customer chung 1 số (kể cả số chính trùng số phụ).
- **Search match** — tìm theo SĐT phải match được cả số chính lẫn số phụ.
- **Tương thích ngược** — không phá `Customer.phone` hiện có, không migrate data cũ.

## 6 Quyết định kiến trúc đã chốt

1. **Schema 1A:** Giữ `Customer.phone` làm số chính + bảng `customer_phones` chỉ chứa số phụ.
2. **Dedup:** App-level enforce qua helper `assertPhoneNotExists()`.
3. **Search:** Silent — match số phụ vẫn trả Customer info bình thường.
4. **Scope:** Chỉ Customer. Lead **không** có `lead_phones`, nhưng khi findOrCreate Customer phải match cả số phụ.
5. **Permission:** Chỉ MANAGER+ mới được sửa số phụ (như số chính).
6. **Schema minimal:** `id, customerId, phone, label, note, createdBy, timestamps, deletedAt`. Không có `verifiedAt`, `isActive`.

## Phases

| # | Phase | File | Status | Depends |
|---|---|---|---|---|
| 01 | Schema + Migration | [phase-01-schema-migration.md](phase-01-schema-migration.md) | ✅ | — |
| 02 | Backend Helper Service | [phase-02-backend-helper-service.md](phase-02-backend-helper-service.md) | ✅ | 01 |
| 03 | Update Existing Services | [phase-03-backend-update-existing-services.md](phase-03-backend-update-existing-services.md) | ✅ | 02 |
| 04 | API Endpoints CRUD | [phase-04-backend-api-endpoints.md](phase-04-backend-api-endpoints.md) | ✅ | 02 |
| 05 | Frontend UI | [phase-05-frontend-ui.md](phase-05-frontend-ui.md) | ✅ | 04 |
| 06 | Test + Docs | [phase-06-test-and-docs.md](phase-06-test-and-docs.md) | ✅ | 05 |

## Dependency Graph

```
01 ─→ 02 ─┬─→ 03 ─┐
          │       ├─→ 06
          └─→ 04 ─→ 05 ─┘
```

- **Sequential:** 01 → 02 → (03 ∥ 04) → 05 → 06.
- **03 và 04 có thể song song** sau khi 02 xong (khác file).
- **05 đợi 04** (cần API endpoint mới có UI gọi).

## Files ảnh hưởng (preview)

- **Tạo mới:** `customer-phone.dto.ts`, `customer-phones.service.ts` (helper), test files.
- **Sửa:** `schema.prisma`, `customers.service.ts`, `search.service.ts`, `import.processor.ts`, `third-party-api.controller.ts`, `customers.controller.ts`, `customer-detail` page UI.

## Risk

- **Race condition** khi 2 request đồng thời thêm cùng 1 số → mitigate bằng transaction + check trong tx.
- **Quên search số phụ** ở 1 chỗ nào đó → mitigate bằng helper duy nhất `findCustomerByAnyPhone()` thay vì lặp `findFirst({ where: { phone } })`.
- **N+1 query** khi list → mitigate bằng `_count` hoặc include khi cần.

## Success Criteria

- [ ] Tạo customer với phone trùng số phụ KH khác → bị reject.
- [ ] Search SĐT match số phụ → trả ra customer.
- [ ] Import CSV với phone trùng số phụ KH cũ → match đúng (không tạo customer mới).
- [ ] Sale (không phải MANAGER) gọi API thêm số phụ → 403.
- [ ] Tất cả test pass, lint pass, build pass.
