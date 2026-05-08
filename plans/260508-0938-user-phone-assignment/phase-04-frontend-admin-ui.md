# Phase 04: Frontend Admin UI for User Phones

**Priority:** P1 (cần cho super admin quản lý)
**Status:** Done
**Effort:** 4h
**Depends on:** Phase 02 (parallel với Phase 03)

## Context Links

- Plan: [plan.md](./plan.md)
- Phase 02: [phase-02-backend-api.md](./phase-02-backend-api.md)
- Existing admin pages: `apps/web/src/app/(dashboard)/admin/`
- API client: `apps/web/src/lib/api-client.ts`
- shadcn/ui components: `apps/web/src/components/ui/`
- Existing admin UI pattern reference: `apps/web/src/app/(dashboard)/admin/users/`
- Form pattern: `apps/web/src/components/leads/lead-create-form.tsx` (React Hook Form + Zod)

## Overview

Tạo trang `/admin/user-phones` cho super admin quản lý SĐT phân cho user. Bao gồm: list view với filter, dialog tạo/bulk import, action transfer, dialog xem history. Thêm tab "SĐT phụ trách" trong user detail page.

## Key Insights

- Pattern Next.js App Router: Server Component cho list + Client Component cho form/dialog
- URL-based filter state (shareable view) - dùng `searchParams`
- shadcn/ui: import từng component (no barrel) - `<Button>` from `@/components/ui/button`
- Vietnamese only - tất cả labels/error messages bằng tiếng Việt
- Date format DD/MM/YYYY, no decimal currency
- Mobile responsive: card view < 640px, table > 640px
- Touch target min 44x44px

## Requirements

### Functional

#### Trang chính `/admin/user-phones`
- **Header**: tiêu đề "Phân SĐT cho nhân viên" + button "Thêm SĐT" + button "Nhập hàng loạt"
- **Filter bar**: 
  - Search by phone (input + debounce 300ms)
  - Select user (Combobox, search-as-you-type)
  - Reset button
- **Table cột**:
  - Số điện thoại (formatted DD/MM)
  - Người phụ trách (link đến user detail)
  - Phòng ban
  - Ngày phân (DD/MM/YYYY HH:mm)
  - Người phân
  - Ghi chú
  - Actions (3-dot menu): Chuyển sang user khác, Xem lịch sử, Xóa
- **Pagination**: cursor-based, 20 rows/page
- **Empty state**: "Chưa có SĐT nào được phân"

#### Dialog "Thêm SĐT"
- Input phone (validate VN format real-time)
- Combobox chọn user (search by name/email)
- Textarea ghi chú (optional)
- Confirm button → POST `/admin/user-phones`
- Toast success/error

#### Dialog "Nhập hàng loạt"
- Textarea cho list `phone,userEmail` (mỗi dòng 1 mapping) HOẶC upload CSV
- Preview parse: hiển thị table mapping + validation status (OK/Sai format/User không tồn tại/Trùng)
- Confirm button → POST `/admin/user-phones/bulk`
- Sau submit: hiển thị kết quả (X created, Y skipped, Z failed)

#### Dialog "Chuyển SĐT"
- Hiển thị phone + user hiện tại
- Combobox chọn user mới
- Textarea ghi chú
- Confirm → PATCH `/admin/user-phones/:id/transfer`

#### Dialog "Xem lịch sử"
- Timeline hiển thị các lần chuyển/xóa
- Mỗi entry: ngày, từ user, sang user (hoặc DELETED), reason, người thực hiện, ghi chú

#### Tab "SĐT phụ trách" trong user detail
- Path: `/admin/users/[id]?tab=phones`
- List các số đang phân cho user này
- Action quick-transfer/quick-delete

### Non-functional
- All API calls qua `lib/api-client.ts` (handle token refresh)
- Loading states (skeleton table)
- Error boundary cho mỗi dialog
- Suspense + lazy load dialogs

## Architecture

### Routes & Files

```
apps/web/src/app/(dashboard)/admin/user-phones/
├── page.tsx                           # Server component - fetch list + render shell
├── _components/
│   ├── user-phone-list-client.tsx     # Client - table + filter + pagination
│   ├── user-phone-create-dialog.tsx   # Client - form thêm 1 số
│   ├── user-phone-bulk-dialog.tsx     # Client - bulk import textarea/CSV
│   ├── user-phone-transfer-dialog.tsx # Client - chuyển user
│   ├── user-phone-history-dialog.tsx  # Client - timeline history
│   └── user-phone-row-actions.tsx     # Client - 3-dot menu
```

### Data Flow

```
page.tsx (server) ──┐
                    ├──> fetch GET /admin/user-phones ──> list-client (hydrate)
                    └──> fetch GET /users (for combobox)

list-client ─clicks "Thêm"──> create-dialog ─submit──> POST /admin/user-phones ──> revalidate
list-client ─clicks "Chuyển"─> transfer-dialog ─submit──> PATCH /transfer ──> revalidate
list-client ─clicks "Xóa"────> confirm ────> DELETE ──> revalidate
list-client ─clicks "Lịch sử"─> history-dialog ─fetch──> GET /:id/history
```

### Components Mapping

| UI element | shadcn/ui base |
|---|---|
| Table | `Table`, `TableHeader`, `TableRow`, `TableCell` |
| Filter combobox | `Command` + `Popover` |
| Form field | `Form`, `FormField` (RHF + Zod) |
| Dialog | `Dialog`, `DialogContent` |
| 3-dot menu | `DropdownMenu` |
| Toast | `useToast` hook |
| Pagination | Custom cursor pagination component có sẵn |

### Form Schemas (Zod)

```typescript
// create dialog
const createSchema = z.object({
  phone: z.string()
    .transform(s => s.trim())
    .refine(s => /^(\+?84|0)\d{9,10}$/.test(s.replace(/[\s\-\.]/g, '')), 'SĐT không hợp lệ'),
  userId: z.string().min(1, 'Chọn nhân viên'),
  note: z.string().max(500).optional(),
});

// transfer dialog
const transferSchema = z.object({
  newUserId: z.string().min(1),
  note: z.string().max(500).optional(),
});

// bulk dialog
const bulkSchema = z.object({
  raw: z.string().min(1, 'Nhập danh sách'),  // parse client-side trước khi submit
});
```

### Sidebar Menu Update

`apps/web/src/components/dashboard/dashboard-sidebar.tsx` - thêm menu item:
- Group: Admin
- Label: "Phân SĐT"
- Icon: `PhoneOutgoing` (lucide-react)
- Path: `/admin/user-phones`
- Visible: chỉ super_admin

## Related Code Files

### Modify
- `apps/web/src/components/dashboard/dashboard-sidebar.tsx` - thêm menu "Phân SĐT"
- `apps/web/src/lib/api-client.ts` - thêm 7 helpers (listUserPhones, createUserPhone, transferUserPhone, removeUserPhone, bulkCreate, getHistory, listByUser)
- `apps/web/src/app/(dashboard)/admin/users/[id]/page.tsx` - thêm tab "SĐT phụ trách"
- `packages/types/src/user-phone.types.ts` - đảm bảo export DTO types (nếu phase 02 chưa có)

### Create
- `apps/web/src/app/(dashboard)/admin/user-phones/page.tsx`
- `apps/web/src/app/(dashboard)/admin/user-phones/_components/user-phone-list-client.tsx`
- `apps/web/src/app/(dashboard)/admin/user-phones/_components/user-phone-create-dialog.tsx`
- `apps/web/src/app/(dashboard)/admin/user-phones/_components/user-phone-bulk-dialog.tsx`
- `apps/web/src/app/(dashboard)/admin/user-phones/_components/user-phone-transfer-dialog.tsx`
- `apps/web/src/app/(dashboard)/admin/user-phones/_components/user-phone-history-dialog.tsx`
- `apps/web/src/app/(dashboard)/admin/user-phones/_components/user-phone-row-actions.tsx`
- `apps/web/src/components/users/user-detail-phones-tab.tsx`

### Delete
- (none)

## Implementation Steps

1. Đọc UI pattern hiện có: `apps/web/src/app/(dashboard)/admin/users/page.tsx` + form components để bám style + Vietnamese labels.
2. Update `api-client.ts` thêm 7 helper methods (typed với DTO từ `@crm/types`).
3. Update `packages/types/src/user-phone.types.ts` export DTO types nếu chưa có.
4. Tạo `page.tsx` (Server Component): fetch initial list + danh sách users → pass props cho list-client.
5. Tạo `user-phone-list-client.tsx`: table + filter + pagination + dialogs trigger.
6. Tạo `user-phone-create-dialog.tsx`: RHF + Zod + combobox user.
7. Tạo `user-phone-bulk-dialog.tsx`: textarea parse `phone,email` per line + preview + submit.
8. Tạo `user-phone-transfer-dialog.tsx`: similar pattern với create.
9. Tạo `user-phone-history-dialog.tsx`: fetch history + render timeline.
10. Tạo `user-phone-row-actions.tsx`: dropdown menu wire 3 dialogs.
11. Update sidebar menu thêm item "Phân SĐT" - visible super_admin only.
12. Tạo `user-detail-phones-tab.tsx` + wire vào user detail page.
13. Kiểm tra mobile (< 640px): table chuyển sang card view (đã có pattern `useMediaQuery`).
14. Test E2E playwright (nếu có infra): super_admin tạo/chuyển/xóa được; USER role bị block (404 hoặc redirect).
15. Manual test 6 flow:
   - Login super_admin → vào trang
   - Thêm 1 SĐT → list reload đúng
   - Bulk import 5 SĐT → 4 OK + 1 fail (email không tồn tại)
   - Transfer 1 SĐT → history có entry mới
   - Xóa 1 SĐT → biến mất khỏi list, history còn entry DELETED
   - Login USER thường → /admin/user-phones bị block

## Todo List

- [x] Update api-client.ts với 7 helpers
- [x] Update types package
- [x] Tạo page.tsx (server component)
- [x] Tạo list-client với table + filter + pagination
- [x] Tạo create-dialog
- [x] Tạo bulk-dialog với parse + preview
- [x] Tạo transfer-dialog
- [x] Tạo history-dialog timeline
- [x] Tạo row-actions dropdown
- [x] Update sidebar menu super_admin only
- [x] Tạo tab "SĐT phụ trách" trong user detail
- [x] Mobile responsive check
- [x] Manual test 6 flow
- [x] Update docs/business-flows.md mục Call Match
- [x] Update docs/project-changelog.md

## Success Criteria

- Super admin truy cập `/admin/user-phones` thấy đầy đủ data
- USER role thường truy cập → 403 hoặc redirect (do guard backend + middleware frontend)
- Tạo SĐT validate đúng (sai format reject, trùng số reject với toast lỗi)
- Bulk import 100 row hiển thị progress + breakdown kết quả
- Transfer / Delete tạo entry trong history (verify qua history dialog)
- Mobile UI: table chuyển card view, không tràn ngang, touch target ≥ 44px
- Vietnamese labels: 100% (không sót English string)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Combobox search user chậm với 200+ users | Server-side search via API `/users?q=...` thay vì load all |
| Bulk import textarea quá dài crash browser | Cap 500 rows + client validation trước khi gửi |
| Race condition: 2 admin transfer cùng row | UI hiển thị optimistic update + rollback nếu API fail |
| User edit phone → mất link với call_logs cũ | NOT-A-CASE: phone là string, call_logs match qua lookup tại thời điểm ingest, không có FK |

## Security Considerations

- Frontend middleware check role super_admin trước khi render route
- API client tự handle 403 → redirect login
- Validate input client-side + server-side (defense in depth)
- Note: client validation chỉ là UX, server validation mới là source of truth
- KHÔNG hiển thị `assigned_by` user info nếu người xem không có quyền (đã enforce bởi backend chỉ super admin xem được endpoint)

## Next Steps

- Sau khi merge: monitor cuộc gọi ingest qua `audit_logs` để verify match flow đúng
- Future enhancement: 
  - Hiển thị "Số này thuộc Sale X" trong customer detail (read-only badge)
  - Export user_phones list ra CSV cho audit
  - Notification cho user khi được phân số mới
- Update docs:
  - `docs/business-flows.md` - mục "Call Match Flow" thêm bước user_phones
  - `docs/data-model.md` - thêm 2 bảng mới
  - `docs/project-changelog.md` - log breaking change
