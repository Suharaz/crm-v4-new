# Phase 05 — Frontend UI

**Priority:** High
**Status:** ⬜ Pending
**Estimate:** 2-3h
**Depends on:** Phase 04

## Context

Thêm section "Số điện thoại phụ" vào trang chi tiết customer. Form động: thêm/sửa/xóa được nhiều số. Chỉ MANAGER+ thấy nút edit.

## Requirements

### Functional
- Customer detail page có section riêng "Số điện thoại khác" hiển thị danh sách số phụ + label + note.
- Nút "Thêm số" → modal hoặc inline form.
- Nút sửa/xóa từng số (chỉ MANAGER+ thấy).
- Confirm dialog khi xóa.
- Toast success/error sau mỗi action.

### Non-functional
- Tiếng Việt 100%.
- Theo design system: shadcn/ui + Tailwind 4 + Sky blue.
- Responsive: mobile card, desktop list.
- Touch target ≥44x44px.
- Form validation: phone format VN.

## Architecture

```
CustomerDetailPage
  ├── ...existing sections (info, orders, leads...)
  └── CustomerPhonesSection  ← MỚI
        ├── PhoneListItem (mỗi số)
        │     ├── badge label
        │     ├── note (truncate)
        │     └── action menu (edit/delete) [MANAGER+]
        └── AddPhoneDialog (modal)
              └── form: phone, label, note
```

## Related Code Files

### Read for context
- `apps/web/src/app/(dashboard)/customers/[id]/page.tsx` (hoặc tương đương) — customer detail page hiện tại
- Component pattern: shadcn `Dialog`, `Form`, `Input`, `Button`
- `lib/api-client.ts` — cách gọi API + handle BigInt string
- Cách check role hiện có trong codebase (hook `useCurrentUser`?)

### Create
- `apps/web/src/components/customer/customer-phones-section.tsx` — main section
- `apps/web/src/components/customer/add-phone-dialog.tsx` — modal add/edit
- `apps/web/src/components/customer/phone-list-item.tsx` — 1 số phụ
- `apps/web/src/lib/api/customer-phones.ts` — API client functions

### Modify
- Customer detail page — render `<CustomerPhonesSection customerId={id} />`

## Implementation Steps

### Step 1: API client functions

`apps/web/src/lib/api/customer-phones.ts`:

```typescript
export type CustomerPhone = {
  id: string;
  customerId: string;
  phone: string;
  label?: string;
  note?: string;
  createdAt: string;
};

export const customerPhonesApi = {
  list: (customerId: string) =>
    apiClient.get<CustomerPhone[]>(`/customers/${customerId}/phones`),

  add: (customerId: string, data: { phone: string; label?: string; note?: string }) =>
    apiClient.post<CustomerPhone>(`/customers/${customerId}/phones`, data),

  update: (customerId: string, phoneId: string, data: Partial<...>) =>
    apiClient.patch<CustomerPhone>(`/customers/${customerId}/phones/${phoneId}`, data),

  remove: (customerId: string, phoneId: string) =>
    apiClient.delete(`/customers/${customerId}/phones/${phoneId}`),
};
```

### Step 2: `CustomerPhonesSection` component

Khoảng dưới 80 lines. Dùng React Query (nếu codebase đang dùng) hoặc useState + useEffect.

```tsx
export function CustomerPhonesSection({ customerId }: { customerId: string }) {
  const { user } = useCurrentUser();
  const isManager = ['MANAGER', 'SUPER_ADMIN'].includes(user.role);
  const { data: phones, refetch } = useQuery(['phones', customerId],
    () => customerPhonesApi.list(customerId));

  return (
    <Card className="hover-lift">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Số điện thoại khác</CardTitle>
        {isManager && (
          <AddPhoneDialog customerId={customerId} onSuccess={refetch} />
        )}
      </CardHeader>
      <CardContent>
        {phones?.length === 0 && <p className="text-muted-foreground">Chưa có số phụ</p>}
        {phones?.map(p => (
          <PhoneListItem key={p.id} phone={p} canEdit={isManager}
            onChange={refetch} customerId={customerId} />
        ))}
      </CardContent>
    </Card>
  );
}
```

### Step 3: `AddPhoneDialog` (modal)

Dùng React Hook Form + Zod cho validation:

```tsx
const schema = z.object({
  phone: z.string().regex(/^(0|\+84)\d{9}$/, 'SĐT VN không hợp lệ'),
  label: z.string().max(50).optional(),
  note: z.string().max(255).optional(),
});
```

Form fields:
- `phone` — Input, required, validate VN format
- `label` — Input, max 50 chars, placeholder "VD: Vợ, Thư ký, Công ty"
- `note` — Textarea, max 255 chars, placeholder "Ghi chú thêm..."

Submit:
- `onSuccess` toast "Đã thêm số phụ"
- 409 → toast "Số đã tồn tại trên KH khác"
- error khác → toast generic

### Step 4: `PhoneListItem`

Hiển thị:
- Phone format: `format-vn-phone(phone)` → `0901 234 567`
- Label badge nếu có
- Note (truncate nếu dài)
- Dropdown menu icon → Edit / Delete (chỉ canEdit)
- Confirm dialog khi delete

### Step 5: Lazy load

Section này không quá nặng → KHÔNG cần `next/dynamic`. Đơn giản import trực tiếp.

### Step 6: Mount vào customer detail page

Tìm vị trí phù hợp (sau section info, trước orders), thêm:

```tsx
<CustomerPhonesSection customerId={customer.id} />
```

### Step 7: Test UX manual

- Thêm số phụ → list refresh.
- Thêm số trùng → toast error.
- Sửa số phụ → list cập nhật.
- Xóa → confirm → list mất số đó.
- Sale role → không thấy nút Add/Edit/Delete.
- Mobile view → responsive ok.

## Todo List

- [ ] Tạo `lib/api/customer-phones.ts` với 4 method
- [ ] Tạo `customer-phones-section.tsx`
- [ ] Tạo `add-phone-dialog.tsx` với Zod schema
- [ ] Tạo `phone-list-item.tsx` với dropdown edit/delete
- [ ] Confirm dialog cho delete (dùng AlertDialog của shadcn)
- [ ] Mount vào customer detail page
- [ ] Hiding edit controls cho non-MANAGER
- [ ] Toast feedback cho mọi action
- [ ] Manual test 6 case ở Step 7

## Success Criteria

- [ ] Section hiển thị đúng list số phụ.
- [ ] Add/Edit/Delete chạy đúng, có toast feedback.
- [ ] Validation Zod chặn SĐT sai format.
- [ ] 409 conflict hiện đúng message tiếng Việt.
- [ ] Sale không thấy nút edit (test manual với 2 account).
- [ ] Responsive mobile + desktop ok.
- [ ] Touch target ≥44x44px.
- [ ] Build pass: `pnpm build`.

## Risk

| Risk | Mitigation |
|---|---|
| BigInt as string → quên parse khi compare → bug | Luôn dùng string comparison cho id |
| Race khi user click thêm 2 lần → tạo 2 số | Disable button khi pending |
| Form không reset sau submit | Dùng `form.reset()` trong `onSuccess` |

## Security

- Không tin client role → API guard ở backend (đã làm phase 04) là source of truth. UI hiding chỉ là UX, không phải security boundary.
- XSS: không dùng `dangerouslySetInnerHTML`. React escape default an toàn.

## Next Steps

- Phase 06 — viết test + cập nhật docs.
