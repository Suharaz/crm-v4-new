# Phase 01: Edit Lead Drawer (Sheet) + Readonly Fields cho USER

**Priority:** P0
**Status:** COMPLETE
**Effort:** ~2h
**Depends:** none

## Context Links

- Scout findings: `plan.md` (parent)
- Existing file: `apps/web/src/components/leads/lead-edit-button.tsx`
- Existing file: `apps/web/src/components/leads/lead-form.tsx`
- Existing: `apps/web/src/components/ui/dialog.tsx` (Radix Dialog primitive base)

## Overview

Đổi nút cây bút trên `/leads` từ mở `EntityQuickPreviewDialog` (popup quick view) sang mở Sheet/Drawer trượt từ phải chứa LeadForm đầy đủ. USER readonly cho phone/name/sourceId, MANAGER+ vẫn editable bình thường.

## Key Insights (WHY)

- **Sheet thay vì Dialog**: Sheet giữ context table phía dưới (user vẫn thấy data) và cảm giác native như Notion/Linear khi sửa nhanh nhiều record liên tiếp.
- **Readonly cho USER**: Lead đã được sale claim, các field danh tính (tên, sdt, nguồn) là dữ liệu gốc khi import - sale chỉ được sửa note/label/payment. MANAGER+ giữ quyền sửa khi cần fix typo từ CSV.
- **Tận dụng LeadForm sẵn có**: Không viết form mới, dùng prop để toggle readonly. DRY principle.

## Requirements

### Functional
- F1: Click nút cây bút trên `/leads` mở Sheet trượt từ phải (animation slide-in).
- F2: Sheet hiển thị tất cả field của LeadForm.
- F3: USER thấy 3 field readonly: phone, name, sourceId. MANAGER/SUPER_ADMIN edit bình thường.
- F4: Đóng Sheet bằng nút X / Escape / click overlay.
- F5: Submit thành công -> đóng Sheet + refresh data table (không reload full page).
- F6: Validation hiện inline, không đóng Sheet khi error.

### Non-functional
- NF1: Sheet width fixed 480px desktop, full width mobile.
- NF2: Animation 200ms, dùng tailwindcss-animate (đã có).
- NF3: Không break các trang khác đang dùng `LeadForm` (page `/leads/[id]/edit` và `/leads/new`).

## Architecture

```
LeadEditButton (modified)
  -> opens <Sheet>
       -> <SheetContent side="right">
            -> <LeadEditDrawerContent leadId>
                 -> fetch lead data via SWR (or pass via prop)
                 -> render <LeadForm lead={...} sources={...} products={...} 
                            mode="drawer" onSuccess={closeSheet} />

LeadForm (modified)
  -> accept new prop: mode?: 'page' | 'drawer'
  -> accept new prop: onSuccess?: () => void
  -> in drawer mode: skip router.push, call onSuccess instead
  -> existing canEditPhone logic already handles USER readonly for phone
  -> extend readonly gate to: name, sourceId (when USER)
```

## Related Code Files

### To Create
- `apps/web/src/components/ui/sheet.tsx` - Shadcn-style Sheet wrapper on Radix Dialog. Export: Sheet, SheetTrigger, SheetContent, SheetClose, SheetHeader, SheetTitle, SheetDescription. Side variants: right (default), left, top, bottom.
- `apps/web/src/components/leads/lead-edit-drawer.tsx` - Drawer wrapper component. Props: `{ open, onOpenChange, leadId }`. Fetches lead + sources + products via SWR, renders LeadForm with mode="drawer".

### To Modify
- `apps/web/src/components/leads/lead-edit-button.tsx` - Replace `EntityQuickPreviewDialog` with `LeadEditDrawer`.
- `apps/web/src/components/leads/lead-form.tsx` - Add props `mode?: 'page' | 'drawer'`, `onSuccess?: () => void`. Extend readonly gate to name + sourceId for USER role. Use `mode==='drawer'` to skip `router.push('/leads')`, call `onSuccess()` instead and trigger SWR revalidation.

### To Delete
- None.

## Implementation Steps

1. **Create `ui/sheet.tsx`** based on Radix Dialog. Copy structure from `dialog.tsx`, change content animation classes from zoom-center to slide-in-from-right. Add `side` prop ('left' | 'right' | 'top' | 'bottom'). Width 480px on desktop.

2. **Create `lead-edit-drawer.tsx`** with skeleton:
   ```tsx
   export function LeadEditDrawer({ open, onOpenChange, leadId }: Props) {
     const { data: lead } = useSWR(open ? `/leads/${leadId}` : null, ...);
     const { data: sources } = useSWR(open ? '/lead-sources' : null, ...);
     const { data: products } = useSWR(open ? '/products' : null, ...);
     return (
       <Sheet open={open} onOpenChange={onOpenChange}>
         <SheetContent side="right" className="w-[480px] sm:max-w-[480px] overflow-y-auto">
           <SheetHeader>
             <SheetTitle>Chỉnh sửa lead</SheetTitle>
           </SheetHeader>
           {lead && (
             <LeadForm lead={lead} sources={sources?.data ?? []} products={products?.data ?? []}
               mode="drawer" onSuccess={() => { onOpenChange(false); mutate('/leads'); }} />
           )}
         </SheetContent>
       </Sheet>
     );
   }
   ```

3. **Modify `lead-form.tsx`**:
   - Add prop signature: `mode?: 'page' | 'drawer'; onSuccess?: () => void;`
   - Compute `canEditNameSource` similar to `canEditPhone`: `!isEdit || ['SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role || '')`
   - Apply readonly to Họ tên Input + Nguồn Select (use `disabled` for Select, `readOnly` + className for Input).
   - Add hint `Chỉ quản lý mới được sửa` next to readonly field (same as phone hint).
   - Modify success handler: if `mode === 'drawer'`, call `onSuccess?.()` instead of `router.push('/leads')`.

4. **Modify `lead-edit-button.tsx`**:
   - Remove `EntityQuickPreviewDialog` import.
   - Import `LeadEditDrawer`.
   - Replace dialog mount with `<LeadEditDrawer open={open} onOpenChange={setOpen} leadId={leadId} />`.

5. **Test manually**:
   - Login as USER -> click cây bút -> verify Sheet opens, name/phone/source readonly with hint.
   - Login as MANAGER -> click cây bút -> verify all fields editable.
   - Submit -> verify Sheet closes + table refreshes.
   - Click overlay/X/Escape -> verify Sheet closes.

## Todo List

- [x] Tạo `apps/web/src/components/ui/sheet.tsx` (Radix Dialog wrapper, slide-from-right animation)
- [x] Tạo `apps/web/src/components/leads/lead-edit-drawer.tsx` (SWR fetch + render LeadForm)
- [x] Modify `lead-form.tsx`: thêm prop `mode` + `onSuccess`, extend readonly cho name + sourceId
- [x] Modify `lead-edit-button.tsx`: thay `EntityQuickPreviewDialog` bằng `LeadEditDrawer`
- [x] Test manual với 2 role (USER, MANAGER)
- [x] `pnpm --filter @crm/web build` để verify no TS errors

## Success Criteria

- [x] Click cây bút mở Sheet trượt từ phải, không reload page
- [x] USER: phone + name + sourceId readonly, có hint
- [x] MANAGER: tất cả field editable
- [x] Submit thành công đóng Sheet + table refresh tự động
- [x] Trang `/leads/[id]/edit` cũ vẫn hoạt động bình thường (full-page form)
- [x] Trang `/leads/new` vẫn hoạt động (create lead full page)
- [x] `pnpm typecheck` pass

## Risk Assessment

- **Risk:** Sheet animation conflict với dialog overlay z-index nếu mở dialog khác bên trong Sheet.
  - **Mitigation:** Test mount của dialog inside drawer (vd: confirmDialog). Nếu fail, tăng z-index nested dialog hoặc dùng portal khác.
- **Risk:** SWR cache stale sau submit -> table không refresh.
  - **Mitigation:** Gọi `mutate('/leads')` + `invalidatePreviewCache('lead', leadId)` trong `onSuccess`.

## Security Considerations

- Backend đã check field-level permission cho phone (service line 447-470). Readonly trên UI chỉ là UX, không phải security boundary.
- Nếu USER gửi PATCH với field readonly, backend từ chối (existing behavior).

## Next Steps

- Phase 02 (SĐT phụ): Sau khi Drawer hoạt động, thêm section SĐT phụ vào LeadForm.
