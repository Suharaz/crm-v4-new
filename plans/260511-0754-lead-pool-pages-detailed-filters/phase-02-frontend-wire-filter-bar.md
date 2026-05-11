# Phase 02: Frontend Wire Filter Bar (4 Pool Pages)

**Phase ID:** `phase-02-frontend-wire-filter-bar`
**Effort:** ~3h
**Priority:** P0
**Status:** Pending
**Blocked by:** Phase 01 (Backend filter support)

---

## Context Links

- Plan: [../plan.md](../plan.md)
- Phase trước: [phase-01-backend-pool-filter-support.md](./phase-01-backend-pool-filter-support.md)
- Skills cần activate: `nextjs-developer`, `react-expert`, `ui-styling`, `frontend-development`, `sequential-thinking`

---

## Overview

Mở rộng component `LeadListAdvancedFilterBar` để hỗ trợ 2 prop mới (`hideStatus`, `storageKey`), sau đó wire vào 4 trang pool. Mỗi trang dùng `storageKey` riêng để filter không bleed giữa các trang.

---

## Key Insights

- Component hiện tại có `STORAGE_KEY = 'crm_lead_filters'` hardcode tại module level - cần đổi thành prop để per-page khác nhau.
- Status dropdown hiện luôn render - thêm `hideStatus?: boolean` prop để conditional render.
- 4 trang pool hiện đang fetch list bằng cách riêng. Filter chỉ thêm `searchParams.toString()` vào URL fetch (existing pattern). Backend đã handle filter ở Phase 01.
- Server Components vs Client Components: filter bar là Client (`'use client'`), trang pool có thể là Server hoặc Client tuỳ existing - giữ nguyên pattern, KHÔNG refactor.

---

## Requirements

### Functional
- Mỗi trang pool hiển thị `LeadListAdvancedFilterBar` với status ẨN.
- LocalStorage key khác nhau cho mỗi trang:
  - `/leads/pool/new` → `crm_lead_filters_pool_new`
  - `/leads/pool/zoom` → `crm_lead_filters_pool_zoom`
  - `/leads/dept` → `crm_lead_filters_dept_pool`
  - `/floating` → `crm_lead_filters_floating`
- URL state là single source of truth. LocalStorage chỉ là backup khi URL không có params.
- Fetch API truyền nguyên `searchParams.toString()` để backend nhận filter.

### Non-functional
- No re-render dư thừa (verify với React DevTools Profiler nếu nghi ngờ).
- No regression trên trang `/leads` (giữ default storage key cũ).

---

## Architecture

```
Page (Server/Client Component)
   ↓ render
LeadListAdvancedFilterBar (Client)
   - hideStatus={true}
   - storageKey="crm_lead_filters_pool_new"
   ↓ pushes to URL
useSearchParams
   ↓
Page fetch with searchParams
   ↓
NestJS API (Phase 01)
```

**Component API mới:**
```ts
interface FilterBarProps {
  sources: { id: string; name: string }[];
  products: { id: string; name: string }[];
  users: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  labels: { id: string; name: string; color: string }[];
  hideStatus?: boolean;        // default false
  storageKey?: string;         // default 'crm_lead_filters'
}
```

---

## Related Code Files

### To read first
- `apps/web/src/components/leads/lead-list-advanced-filter-bar.tsx` - existing component (đã đọc)
- `apps/web/src/app/(dashboard)/leads/pool/new/page.tsx` - pool new page
- `apps/web/src/app/(dashboard)/leads/pool/zoom/page.tsx` - pool zoom page
- `apps/web/src/app/(dashboard)/leads/dept/page.tsx` - dept pool page
- `apps/web/src/app/(dashboard)/floating/page.tsx` - floating page
- `apps/web/src/app/(dashboard)/leads/page.tsx` - reference (đang dùng filter bar)
- `apps/web/src/lib/api-client.ts` - API client pattern

### To modify
- `apps/web/src/components/leads/lead-list-advanced-filter-bar.tsx` (thêm 2 prop)
- `apps/web/src/app/(dashboard)/leads/pool/new/page.tsx` (wire filter)
- `apps/web/src/app/(dashboard)/leads/pool/zoom/page.tsx` (wire filter)
- `apps/web/src/app/(dashboard)/leads/dept/page.tsx` (wire filter)
- `apps/web/src/app/(dashboard)/floating/page.tsx` (wire filter)

---

## Implementation Steps

1. **Activate skills:** `nextjs-developer`, `react-expert`, `ui-styling`, `sequential-thinking`.
2. **Read related files:** đọc 7 file trong "Related Code Files" để hiểu pattern + cách fetch list của từng trang.
3. **Sửa `LeadListAdvancedFilterBar`:**
   - Thêm 2 prop optional: `hideStatus?: boolean`, `storageKey?: string`.
   - Đổi `const STORAGE_KEY = 'crm_lead_filters'` thành dùng prop `storageKey ?? 'crm_lead_filters'`.
   - Conditional render Status dropdown: `{!hideStatus && (<div>...Status...</div>)}`.
   - Nếu `hideStatus`, KHÔNG count `currentStatus` vào `activeFilterCount`.
4. **Wire filter bar vào 4 trang pool:**
   - Mỗi trang fetch options (sources, products, users, departments, labels) qua existing API endpoints (hoặc dùng SSR).
   - Render `<LeadListAdvancedFilterBar hideStatus storageKey="crm_lead_filters_pool_new" {...options} />` ở đầu list.
   - Sửa data fetch của trang nhận `searchParams` từ URL và truyền vào API call.
5. **Test manual trên browser:**
   - Vào từng trang pool, mở Bộ lọc, chọn nguồn + sản phẩm → URL update + list refresh.
   - Chuyển sang trang khác → filter của trang cũ KHÔNG bleed sang.
   - Refresh trang → filter restore từ localStorage.
6. **Compile check:** `pnpm --filter @crm/web build`.

---

## Todo List

- [ ] Đọc tất cả file trong "Related Code Files"
- [ ] Thêm prop `hideStatus` + `storageKey` vào `LeadListAdvancedFilterBar`
- [ ] Cập nhật logic `STORAGE_KEY` dùng prop thay constant
- [ ] Conditional render Status dropdown
- [ ] Wire filter bar vào `/leads/pool/new` (storageKey `crm_lead_filters_pool_new`)
- [ ] Wire filter bar vào `/leads/pool/zoom` (storageKey `crm_lead_filters_pool_zoom`)
- [ ] Wire filter bar vào `/leads/dept` (storageKey `crm_lead_filters_dept_pool`)
- [ ] Wire filter bar vào `/floating` (storageKey `crm_lead_filters_floating`)
- [ ] Sửa data fetch của 4 trang để truyền searchParams xuống API
- [ ] Compile check: `pnpm --filter @crm/web build`
- [ ] Test manual trên browser (4 trang + verify no bleed + verify URL share)
- [ ] Verify no regression trên `/leads` (filter bar gốc còn hoạt động)
- [ ] Commit: `feat(leads-pool): add detailed filter bar to 4 pool pages`

---

## Success Criteria

- [ ] 4 trang pool có filter bar đầy đủ (trừ Status).
- [ ] LocalStorage không bleed: filter trang A không xuất hiện trên trang B.
- [ ] URL share-able: copy URL filter, paste vào tab mới → cùng filter.
- [ ] Refresh trang giữ filter (qua URL hoặc localStorage).
- [ ] `/leads` không bị regression.
- [ ] No TypeScript / lint error.
- [ ] No unused import / dead code.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Refactor STORAGE_KEY break trang `/leads` | High | Giữ default value `'crm_lead_filters'` khi prop undefined |
| Trang pool là Server Component, không pass props được | Medium | Wrap filter bar trong Client Component, dùng `'use client'` ở wrapper hoặc page |
| Options data (sources, products, ...) load chậm | Low | Cache + SSR fetch hoặc dùng React Query staleTime |
| Filter Status hiển thị accidentally khi prop quên truyền | Low | Default `hideStatus = false` đúng - không truyền = giống cũ |

---

## Security Considerations

- Frontend không tự áp dụng RBAC - backend đã handle ở Phase 01 (`buildAccessFilter`).
- Options data (users list) phải đến từ endpoint có RBAC: user role thấp không thấy danh sách full user.

---

## Common Pitfalls (Junior Reminder)

1. **Đừng tạo file mới** - sửa trực tiếp 5 file đã liệt kê (theo development rules).
2. **Đừng spread `searchParams` vào fetch URL không escape** - dùng `searchParams.toString()` an toàn.
3. **Đừng bỏ qua `'use client'`** ở trang pool nếu trang đang dùng Server Component (sẽ break hooks).
4. **Đừng quên `cursor` reset khi filter thay đổi** - logic này đã có trong `updateFilter()`.

---

## Next Steps

→ Phase 03: E2E tests (sau khi manual test pass).
