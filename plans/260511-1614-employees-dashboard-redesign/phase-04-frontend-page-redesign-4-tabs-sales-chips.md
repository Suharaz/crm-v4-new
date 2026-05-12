# Phase 04 - Frontend: Page redesign 3 tabs + Sales dynamic columns + drill-down

## Context Links

- Plan overview: [plan.md](./plan.md)
- Phase trước: [phase-01](./phase-01-backend-extend-employee-scores-api.md), [phase-02](./phase-02-backend-call-operations-endpoints-labels-seed.md), [phase-03](./phase-03-frontend-shared-bar-cell-table-component.md)
- Trang hiện tại: `apps/web/src/app/(dashboard)/dashboard/employees/page.tsx`

## Overview

- **Priority:** P0
- **Status:** Complete
- **Effort:** 6h
- **Mô tả:** Rewrite trang `/dashboard/employees` thành **3-tab** layout dùng `BarCellTable` từ Phase 03 và **3 endpoint** từ Phase 01-02 (bao gồm tab Bán hàng dynamic columns + side-panel drill-down).

## Key Insights

- **Tabs URL-state**: `?tab=summary|calls|operations|sales` để shareable + back button hoạt động
- **Tab Bán hàng** = bảng với **dynamic columns** mỗi label = 1 cột, top 7 từ API trả + cột "Khác" + "KH chưa tiếp cận". Fetch riêng từ endpoint `/sales-breakdown`
- **Drill-down side-panel** mở khi click cell → fetch `/sales-breakdown/customers?userId=&labelId=` paginated list
- Range filter (week/month/quarter) + Dept filter giữ chung cho cả 4 tab
- Loading state per tab độc lập (mỗi hook fetch riêng)
- **Lazy fetch**: chỉ fetch data của tab đang active để tiết kiệm bandwidth

## Requirements

### Functional

#### Layout
```
┌────────────────────────────────────────────────────┐
│ Header: title + dept select + range pills          │
├────────────────────────────────────────────────────┤
│ Summary KPI cards (3): total/good/needHelp         │
├────────────────────────────────────────────────────┤
│ Tab bar: [Báo cáo tổng] [Cuộc gọi] [Bán hàng]      │
├────────────────────────────────────────────────────┤
│ BarCellTable rendering current tab data            │
│   (Sales tab: dynamic columns from API topLabels)  │
└────────────────────────────────────────────────────┘
     ↓ (when cell clicked in Sales tab)
┌────────────────────────────────┐
│ Side-panel: Customer drill-down │
│   - Top: filter info + close   │
│   - Body: scrollable list      │
│   - Footer: pagination         │
└────────────────────────────────┘
```

#### Tab 1: Báo cáo tổng (10 cột)

| Col | Label | Formula | Color | Format |
|---|---|---|---|---|
| 1 | Số lead | - | sky | number |
| 2 | Số lead chưa tác nghiệp | - | sky | number |
| 3 | Số đơn | - | amber | number |
| 4 | Số sản phẩm | - | teal | number |
| 5 | Tổng doanh số | - | emerald | currency |
| 6 | Doanh số/Lead | =5/1 | blue | currency |
| 7 | Giá trị đơn TB | =5/3 | emerald | currency |
| 8 | Tỉ lệ chốt đơn | =3/1 | amber | percent |
| 9 | Số cuộc gọi | - | violet | number |
| 10 | Số phút gọi | - | violet | duration |

Cột 9-10 join data từ endpoint call (tab calls) - cần merge ở hook.

#### Tab 2: Báo cáo cuộc gọi (3 cột)

| Col | Label | Color | Format |
|---|---|---|---|
| 1 | Cuộc gọi nghe máy/Cuộc gọi gọi ra | teal/rose | `${answered}/${outgoing}` raw display, bar theo answered |
| 2 | Thời gian gọi ra | rose | duration (mm:ss hoặc h) |
| 3 | Thời gian gọi TB | rose | duration |

Cột 1 cần custom render - 2 số ngăn cách `/` cùng cell. Mở rộng `BarCellColumn` với `renderCell?: (row) => ReactNode` optional.

#### Tab 3: Bán hàng (dynamic columns)

Columns (động theo response API `/employee-reports/sales-breakdown`):

| Col | Label | Source | Color | Format |
|---|---|---|---|---|
| 1..7 | Top 7 label name từ `topLabels[i].name` | `row.labelCounts[topLabels[i].id]` | dùng `topLabels[i].color` làm bar color | number |
| 8 | Khác | `row.otherCount` | slate | number |
| 9 | KH chưa tiếp cận | `row.untouchedCount` | rose | number |

**Render logic:**
```tsx
function buildSalesColumns(topLabels: TopLabel[]): BarCellColumn<SalesRow>[] {
  return [
    ...topLabels.map((l, idx) => ({
      key: `label_${l.id}`,
      label: l.name,
      barColor: hexToColorKey(l.color), // map hex → color key của COLOR_MAP
      format: 'number',
      align: 'right',
      sortable: true,
      accessor: (row) => row.labelCounts[l.id] ?? 0,
      onCellClick: (row) => openDrillDown(row.userId, { labelId: l.id }),
    })),
    { key: 'otherCount', label: 'Khác', barColor: 'slate', format: 'number',
      accessor: (row) => row.otherCount,
      onCellClick: (row) => openDrillDown(row.userId, { other: true }) },
    { key: 'untouchedCount', label: 'KH chưa tiếp cận', barColor: 'rose', format: 'number',
      accessor: (row) => row.untouchedCount,
      onCellClick: (row) => openDrillDown(row.userId, { untouched: true }) },
  ];
}
```

**Side-panel drill-down:**
- State: `{ open, userId, mode: { labelId?, untouched?, other? } }`
- Fetch `useCustomerDrillDown(userId, mode, from, to)` paginated
- **Range scope**: side-panel **giữ chung range với tab** đang xem (week/month/quarter). Khi user đổi range ngoài table mà panel đang mở → panel re-fetch theo range mới.
- Body: list customer card với name + phone + labels + lastActivityAt + ordersCount + revenue
- Footer: "Tải thêm" button hoặc auto load on scroll
- Header panel hiển thị label range hiện tại (vd "Tháng này") để user biết scope data

### Non-functional

- Tab switch < 100ms (data đã cache)
- URL update đồng bộ tab + filter
- Mobile: tab bar scroll ngang, chip bar scroll ngang
- Range/Dept change → re-fetch tất cả tab đã visit (invalidate cache trong hook)

## Architecture

```
EmployeesPage
 ├─ useSearchParams() → { tab }
 ├─ Range + Dept state
 ├─ Drill-down state: { open, userId, mode }
 ├─ Tab-scoped hooks (lazy enabled):
 │   ├─ useEmployeeScores(range, deptId, enabled=tab==='summary')
 │   ├─ useEmployeeCallReport(range, deptId, enabled=tab==='calls')
 │   └─ useEmployeeSalesBreakdown(range, deptId, enabled=tab==='sales')
 ├─ Drill-down hook: useCustomerDrillDown(userId, mode, range)
 ├─ TabBar
 │   └─ Tab routing via router.replace + query
 ├─ Tab content (conditional render)
 │   ├─ EmployeeSummaryTable     (uses BarCellTable + summary data)
 │   ├─ EmployeeCallTable        (uses BarCellTable + call data)
 │   └─ EmployeeSalesTable       (uses BarCellTable + dynamic columns from topLabels)
 └─ CustomerDrillDownPanel       (side-panel, controlled by drill-down state)
```

## Related Code Files

### Modify
- `apps/web/src/app/(dashboard)/dashboard/employees/page.tsx` - rewrite từ đầu
- `apps/web/src/components/dashboard/hooks/use-employee-scores.ts` - extend type (đã làm ở Phase 01) + thêm raw fields

### Read for context (MUST read before coding)
- `apps/web/src/app/(dashboard)/dashboard/employees/page.tsx` (file cũ - giữ KPI cards top)
- `apps/web/src/components/dashboard/widgets/bar-cell-table.tsx` (Phase 03 output)
- `apps/web/src/components/dashboard/widgets/employee-scorecard.tsx` (xem header style + range pills)
- `apps/web/src/lib/api-client.ts` (verify api.get signature cho 3 endpoint)
- `apps/web/src/components/ui/tabs.tsx` (nếu shadcn tabs có sẵn)

### Create
- `apps/web/src/components/dashboard/widgets/employee-summary-table.tsx` (~80 line)
- `apps/web/src/components/dashboard/widgets/employee-call-table.tsx` (~60 line)
- `apps/web/src/components/dashboard/widgets/employee-sales-table.tsx` (~100 line - dynamic columns)
- `apps/web/src/components/dashboard/widgets/customer-drill-down-panel.tsx` (~120 line - side panel + paginated list)
- `apps/web/src/components/dashboard/hooks/use-employee-call-report.ts` (~40 line)
- `apps/web/src/components/dashboard/hooks/use-employee-sales-breakdown.ts` (~50 line)
- `apps/web/src/components/dashboard/hooks/use-customer-drill-down.ts` (~60 line - paginated fetch)
- `apps/web/src/components/dashboard/utils/hex-to-color-key.ts` (~30 line - map hex `#ef4444` → `'rose'` cho COLOR_MAP)

## Implementation Steps

1. **Đọc** files context list bắt buộc
2. **Tạo 2 hook mới** (`use-employee-call-report.ts`, `use-employee-operations-report.ts`) - clone pattern `useEmployeeScores`
3. **Tạo 3 table component** (summary/call/operations):
   - Mỗi component nhận `data, loading` từ hook
   - Define columns config với formula label + color
   - Pass vào `<BarCellTable />`
   - Riêng `employee-call-table` cần `renderCell` custom cho cột 1 (answered/outgoing format)
4. **Tạo `sales-filter-chips.tsx`**:
   - 8 chip horizontal scroll
   - Active chip có sky gradient bg
   - Click chip → update URL `?filter=hot|closed|...`
5. **Tạo `sales-view.tsx`**:
   - Đọc `filter` từ URL
   - Apply filter logic trên data từ `useEmployeeScores`
   - Render `EmployeeSummaryTable` với data filtered
6. **Rewrite `page.tsx`**:
   - Giữ header + KPI cards
   - Thêm Tab bar (4 tab) - dùng shadcn Tabs hoặc tự build với button + URL state
   - Conditional render 4 tab content
   - **Lazy fetch**: chỉ enable hook khi tab active (dùng prop `enabled` truyền vào hook)
7. **URL sync**: dùng `useRouter` + `useSearchParams` để sync tab/filter ra URL không full reload
8. **Test toàn bộ**: switch tab, change range, change dept, change filter

## Todo List

- [ ] Đọc `bar-cell-table.tsx` (Phase 03 output) để hiểu API component
- [ ] Đọc page.tsx cũ + employee-scorecard.tsx
- [ ] Tạo `hex-to-color-key.ts` util
- [ ] Tạo 3 hook mới: call-report, sales-breakdown, customer-drill-down
- [ ] Tạo `employee-summary-table.tsx` với 10 column config
- [ ] Tạo `employee-call-table.tsx` với 3 column + custom render
- [ ] Tạo `employee-sales-table.tsx` với dynamic columns builder
- [ ] Tạo `customer-drill-down-panel.tsx` với side panel + paginated list
- [ ] Rewrite `page.tsx` với 3 tab + drill-down state
- [ ] URL sync (tab)
- [ ] Lazy fetch per tab
- [ ] Build: `pnpm build` cả API + Web
- [ ] Test manual: switch tab/range/dept/click cell drill-down
- [ ] Verify mobile responsive (side panel full-screen mobile)

## Success Criteria

- 3 tab render đúng visual như mẫu ảnh
- Tab Bán hàng cột động đúng theo `topLabels` từ API
- URL state hoạt động (refresh giữ tab)
- Tab switch < 100ms (data đã load)
- Range/Dept change re-fetch đúng
- Click cell trong tab Bán hàng mở side-panel đúng filter
- Side-panel pagination "Tải thêm" hoạt động
- Mobile: tab bar scroll ngang, table sticky cột, side-panel full-screen
- KPI cards top giữ nguyên hiển thị tổng quan
- Role guard giữ nguyên (USER thường thấy "không có quyền")
- No console warning

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Hook fetch 3 endpoint song song khi mount → 3x load | Lazy enabled prop, chỉ fetch khi tab active |
| URL state conflict khi user click back/forward | Dùng `replace` thay `push` để không spam history |
| `BarCellColumn` chưa support `onCellClick` | Phase 03 mở rộng prop optional - chỉ Sales tab dùng |
| Tab Calls cột "answered/outgoing" overflow trên mobile | Custom render với min-width + truncate |
| Re-fetch khi switch tab ngay sau khi đổi range gây flicker | Hook cache key bao gồm range, abort previous request |
| `hexToColorKey` không match COLOR_MAP cho hex tùy ý | Fallback `'sky'` khi không match - log warning dev |
| Side-panel mở khi route đổi (navigate away) → memory leak | Close panel khi `tab` đổi (useEffect cleanup) |
| Top label đổi giữa các range → cột dyna đổi gây disorient | Hiển thị label name trong header rõ ràng, không hiện ID |

## Security Considerations

- N/A (frontend chỉ consume API - guard đã ở backend)
- Không expose userId của user khác ngoài data API trả về
- URL state không bao gồm thông tin nhạy cảm

## Next Steps

- Phase 05 tests
- Future: drill-down click row mở chi tiết user
- Future: export Excel/CSV bảng đang xem
