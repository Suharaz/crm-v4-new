# Plan: Bộ lọc chi tiết cho các trang Lead Pool

**Plan ID:** `260511-0754-lead-pool-pages-detailed-filters`
**Created:** 2026-05-11
**Status:** Phase 01 + 02 DONE, Phase 03 SKIPPED (test infra removed from workspace)
**Total effort:** ~7h actual (Phase 03 skipped)

---

## Mục tiêu

Bổ sung bộ lọc chi tiết (nguồn, sản phẩm, người được phân, phòng ban, nhãn, đã mua, khoảng ngày, search) cho 4 trang lead pool hiện đang thiếu filter:

- `/leads/pool/new` - Kho Mới (chờ phân phối)
- `/leads/pool/zoom` - Kho Zoom
- `/leads/dept` - Kho Phòng Ban
- `/floating` - Kho Thả Nổi

Trang `/leads` chính đã có đủ filter, không trong scope.

---

## Bối cảnh

- Component `LeadListAdvancedFilterBar` đã có sẵn tại `apps/web/src/components/leads/lead-list-advanced-filter-bar.tsx` với 9 filter (URL state + localStorage), hiện chỉ trang `/leads` dùng.
- Backend `GET /leads` đã hỗ trợ đủ filter params. 4 endpoint pool (`/leads/pool/new`, `/leads/pool/zoom`, `/leads/pool/department/:id`, `/leads/pool/floating`, `/leads/my-dept-pool`) chỉ nhận `limit + cursor`, cần bổ sung filter params.
- Status filter sẽ **ẩn** trên các trang pool (mỗi trang đã cố định scope status). LocalStorage dùng **per-page keys** để tránh bleed.

---

## Phases

| # | Phase | Effort | Blocks | Status |
|---|---|---|---|---|
| 01 | [Backend pool filter support](./phase-01-backend-pool-filter-support.md) | ~4h | 02 | DONE (commit 727f236) |
| 02 | [Frontend wire filter bar 4 trang pool](./phase-02-frontend-wire-filter-bar.md) | ~3h | 03 | DONE (commit 6d5da85) |
| 03 | [E2E tests filter trên pool pages](./phase-03-e2e-tests.md) | ~2h | - | SKIPPED (test infra deleted from workspace, defer until restored) |

---

## Dependencies

```
Phase 01 (Backend) ─┬─> Phase 02 (Frontend) ─> Phase 03 (E2E)
                    │
                    └─ Index DB included
```

- Phase 01 phải hoàn thành trước Phase 02 (frontend cần API hỗ trợ filter).
- Phase 03 chạy cuối, verify end-to-end.

---

## Key Decisions (đã được duyệt)

1. **Status filter ẨN** trên 4 trang pool (scope cố định).
2. **AssignedUser filter HIỆN trên tất cả** pool pages.
3. **LocalStorage per-page keys** (`crm_lead_filters_pool_new`, `crm_lead_filters_pool_zoom`, `crm_lead_filters_dept_pool`, `crm_lead_filters_floating`).
4. **Scope bao gồm:** Backend + Frontend + E2E + Optimize index DB.

---

## Files Impact Summary

### Backend
- `apps/api/src/modules/leads/dto/pool-list-query.dto.ts` (new)
- `apps/api/src/modules/leads/leads.service.ts` (modify 5 methods)
- `apps/api/src/modules/leads/leads.controller.ts` (5 endpoints accept DTO)
- `packages/database/prisma/schema.prisma` (add composite index)
- `packages/database/prisma/migrations/` (new migration)

### Frontend
- `apps/web/src/components/leads/lead-list-advanced-filter-bar.tsx` (add `hideStatus` + `storageKey` props)
- `apps/web/src/app/(dashboard)/leads/pool/new/page.tsx` (wire filter)
- `apps/web/src/app/(dashboard)/leads/pool/zoom/page.tsx` (wire filter)
- `apps/web/src/app/(dashboard)/leads/dept/page.tsx` (wire filter)
- `apps/web/src/app/(dashboard)/floating/page.tsx` (wire filter)

### Tests
- `tests/e2e/leads/lead-pool-filters.spec.ts` (new)

---

## Risk

- **DB index thêm vào bảng leads** (đang có data thật) - cần dùng `CREATE INDEX CONCURRENTLY` để không lock table.
- **Pool/new mix 2 nguồn data** (raw pool + 72h distributed): filter sẽ áp dụng cho cả 2 nhánh - cần verify behavior với business.

---

## Success Criteria

- [ ] 4 trang pool hiển thị `LeadListAdvancedFilterBar` với Status bị ẩn.
- [ ] Filter trên mỗi trang lưu URL params + localStorage riêng (không bleed).
- [ ] Backend nhận đủ filter params trên 5 endpoint pool.
- [ ] Query plan dùng index mới (verify bằng `EXPLAIN ANALYZE` với combo source+product+status).
- [ ] E2E test pass: filter từng cái + clear all + filter combo.
- [ ] No regression trên trang `/leads`.

---

## Unresolved Questions

1. Pool/new mix 2 nhánh (raw pool + 72h distributed) - filter áp dụng cho cả 2 hay chỉ pool slice? **Default:** áp dụng cho cả 2 (đơn giản nhất).
2. Có cần URL share-link để team trao đổi không? Nếu cần, đảm bảo URL params là single source of truth (localStorage chỉ là backup).
