# Phase 03: Cập nhật 2 lead table components

**Status:** Draft | **Priority:** P0 (sau 01+02) | **Est:** 2.5h

## Mục tiêu
Áp cột mới cho 2 component table → đồng bộ 5 trang.

## Files cần sửa
- `apps/web/src/components/leads/lead-table.tsx` (dùng ở /leads + /leads/dept)
- `apps/web/src/components/leads/lead-pool-table-with-bulk-assign.tsx` (dùng ở pool/new, pool/zoom, floating)

## Cột mới (header thứ tự)

| # | Cột | Source | Sticky | Role |
|---|---|---|---|---|
| 1 | Checkbox | UI state | ✓ left-0 | all |
| 2 | STT | row index | ✓ left-[40px] | all |
| 3 | Tên + ⓘ | `LeadNameWithInfo` | ✓ left-[80px] | all |
| 4 | SĐT + carrier + 3 icons | `PhoneCell` | ✓ left-[280px] | all |
| 5 | Sản phẩm | `lead.product?.name` | - | all |
| 6 | Số | `1` khi có `latestOrder`, else `-` | - | all |
| 7 | Thành tiền | `formatVND(latestOrder.totalAmount)` | - | all |
| 8 | Tiền đặt cọc | `formatVND(latestOrder.depositPaid)` | - | all |
| 9 | Nguồn khách | `lead.source?.name` | - | all |
| 10 | Nhãn KH | `<LabelBadge>` | - | all |
| 11 | **Phân cho** | `lead.assignedUser?.name` | - | **MANAGER+ only, pool tables** |
| 12 | **Tương tác** | activity count / last activity | - | **MANAGER+ only, pool tables** |
| 13 | Thao tác | dropdown | ✓ right-0 | all |

## Sticky implementation
- Wrapper: `<div className="overflow-x-auto">`
- Sticky cell pattern: `sticky left-0 bg-white z-10 shadow-[2px_0_4px_rgba(0,0,0,0.05)]` (cột cuối nhóm sticky có shadow ngăn cách)
- Header `<th>` cũng sticky: thêm `top-0` nếu cần vertical sticky
- Width chính xác cho từng cột phải tính offset left:
  - Checkbox: 40px
  - STT: 60px → cộng dồn 40+60=100px
  - Tên + ⓘ: 200px → 100+200=300px
  - SĐT + icons + carrier: 240px → fixed width quan trọng

## Role-based logic (chỉ áp pool tables)
```tsx
const { user } = useAuth();
const isManagerPlus = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';
// Render cột "Phân cho" + "Tương tác" chỉ khi isManagerPlus && poolMode khác undefined
```

## Cột bỏ hẳn (KHÔNG còn ở table mới)
- `Trạng thái` (chuyển vào quick preview popup)
- `Ghi chú` (chuyển vào quick preview)
- `Ngày tạo` (chuyển vào quick preview)
- `Tương tác lần cuối` (thay bằng icon clock SĐT)

## Implementation Steps
1. Cập nhật `LeadRecord` type ở `@/types/entities` để có `latestOrder?: { totalAmount: string; depositPaid: string }`
2. Sửa `lead-table.tsx`:
   - Đổi header
   - Cập nhật `<tbody>` map qua leads
   - Mỗi row render đúng cell mới
3. Sửa `lead-pool-table-with-bulk-assign.tsx` tương tự
4. Helper `formatVND(value: string | null)` → đã có chưa? Check `@crm/utils`
5. STT = `(page - 1) * pageSize + index + 1`

## Related Code Files
- `apps/web/src/types/entities.ts` - LeadRecord type
- `apps/web/src/components/leads/lead-table.tsx`
- `apps/web/src/components/leads/lead-pool-table-with-bulk-assign.tsx`
- `apps/web/src/lib/format.ts` (nếu có formatVND)

## Todo
- [ ] Cập nhật LeadRecord type
- [ ] Rebuild header lead-table.tsx
- [ ] Rebuild body lead-table.tsx
- [ ] Rebuild header lead-pool-table-with-bulk-assign.tsx
- [ ] Rebuild body lead-pool-table-with-bulk-assign.tsx
- [ ] Kiểm tra STT với pagination
- [ ] Typecheck

## Success Criteria
- 5 trang lead hiển thị đúng cột mới
- Cột money hiển thị `-` khi lead chưa có order
- Bulk select vẫn work
- Click ⓘ + 3 icon SĐT work end-to-end

## Risk
- `LeadRecord` được import nhiều nơi - đổi type có thể breaking. Mitigation: làm optional field
- Pool table cũ có "Phân cho" + "Tương tác" - cần xác nhận với user lại nếu cần info đó

## Open questions
- Cột "Trạng thái" lead (POOL/ASSIGNED/IN_PROGRESS/CONVERTED/LOST/FLOATING) có giữ ở pool table không? User screenshot không có nhưng pool view có thể cần
