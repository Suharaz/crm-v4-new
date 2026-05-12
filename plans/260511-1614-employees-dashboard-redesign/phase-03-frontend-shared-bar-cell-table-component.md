# Phase 03 - Frontend: Shared BarCellTable component

## Context Links

- Plan overview: [plan.md](./plan.md)
- Mẫu visual: `F:\Vibe Coding\crm-v4\img_v3_0211c_793a8814-927c-4b4a-b207-a5457973b7hu.jpg`, `img_v3_0211c_6fd39e48-2321-4fff-a95a-f08d0a36e6hu.jpg`
- Design system: `docs/design-guidelines.md`

## Overview

- **Priority:** P0
- **Status:** Complete
- **Effort:** 3h
- **Mô tả:** Build component `BarCellTable` tái sử dụng cho cả 3 tab báo cáo (Tổng, Cuộc gọi, Vận hành). Mỗi cell trong cột giá trị có thanh bar màu chiều dài tỉ lệ với max của cột.

## Key Insights

- **1 component generic** dùng được cho mọi tab - không tạo 3 component riêng (DRY)
- Bar width = `(value / maxInColumn) * 100%` - guard `max === 0` thì width = 0
- Mỗi cột có **màu chủ đạo** riêng (sky/teal/amber/emerald/violet) - config qua prop
- Hỗ trợ format value: `number`, `currency`, `percent`, `duration` (giây sang phút:giây)
- **Sticky** cột STT + Tên nhân viên khi horizontal scroll mobile
- **Sticky** header khi scroll dọc

## Requirements

### Functional

- Component nhận `columns` config + `rows` data
- `columns` schema:
  ```ts
  interface BarCellColumn<T> {
    key: keyof T | string;
    label: string;
    formula?: string;          // hiển thị "(1)", "(6 = 5/1)" cạnh label
    barColor?: 'sky'|'teal'|'amber'|'emerald'|'rose'|'violet'|'blue'|'cyan'|'slate';
    format?: 'number'|'currency'|'percent'|'duration';
    align?: 'left'|'right'|'center';
    sticky?: boolean;           // cho cột tên nhân viên
    sortable?: boolean;
    accessor?: (row: T) => number | string;  // computed fields
    onCellClick?: (row: T) => void;          // click cell → callback (tab Bán hàng drill-down)
    renderCell?: (row: T) => ReactNode;      // custom render (tab Calls: "answered/outgoing")
  }
  ```
- `rows` là array generic `T[]`
- Header row + **subheader row "Tổng"** hiển thị sum (mỗi cột) - như mẫu ảnh
- Empty state khi rows.length === 0
- Skeleton loading khi prop `loading`
- Click cột header để sort (toggle asc/desc, default desc)
- Tooltip hover bar: show raw value + tỉ lệ %

### Non-functional

- Render 200 row + 10 cột < 100ms
- No layout shift khi data load (skeleton có cùng size)
- Mobile: horizontal scroll smooth, sticky cột không nhảy
- A11y: `<th scope="col">`, `aria-sort`, contrast text/bar đủ AA

## Architecture

```
<BarCellTable<T>
  columns={[...]}
  rows={data}
  loading={loading}
  defaultSort={{ key: 'leadsAssigned', direction: 'desc' }}
  emptyMessage="Không có dữ liệu"
  onRowClick={(row) => ...}
/>
```

**Internal structure:**
```
<table>
  <thead> (sticky top-0)
    <tr> column headers
    <tr> totals row (background slate-50)
  </thead>
  <tbody>
    <tr> data rows (zebra alternating)
      <td> sticky STT
      <td> sticky name
      <td> BarCell (bar + value)
      ...
  </tbody>
</table>
```

**BarCell sub-component** (internal):
```tsx
function BarCell({ value, max, color, format }) {
  const percent = max === 0 ? 0 : Math.min(100, (value / max) * 100);
  const bg = COLOR_MAP[color].bg;   // bg-sky-400/30
  const text = COLOR_MAP[color].text; // text-sky-900
  return (
    <div className="relative h-7 rounded">
      <div className={`absolute inset-y-0 left-0 ${bg} rounded transition-all`} style={{width: `${percent}%`}} />
      <span className={`relative px-2 text-xs font-semibold ${text}`}>
        {formatValue(value, format)}
      </span>
    </div>
  );
}
```

## Related Code Files

### Read for context (MUST read before coding)
- `apps/web/src/components/dashboard/widgets/employee-scorecard.tsx` (component pattern hiện hành để giữ style consistent)
- `apps/web/src/components/dashboard/constants.ts` (xem `fmtNum`, `fmtVnd`, color tokens)
- `apps/web/src/app/globals.css` hoặc tailwind config (verify color palette `sky-*`, `teal-*`)
- 1-2 file table có sẵn trong `apps/web/src/components/leads/` hoặc `apps/web/src/components/customers/` để xem table style pattern (sticky header, hover row)

### Create
- `apps/web/src/components/dashboard/widgets/bar-cell-table.tsx` - main component
- `apps/web/src/components/dashboard/widgets/bar-cell-table.types.ts` - shared types (optional, có thể inline)
- `apps/web/src/components/dashboard/utils/format-value.ts` - helper format (number/currency/percent/duration)

### Modify
- `apps/web/src/components/dashboard/constants.ts` - thêm helper `fmtDuration(sec)` nếu chưa có

## Implementation Steps

1. **Đọc** files context list - bắt buộc trước khi code
2. **Tạo `format-value.ts`**:
   - `fmtNumber(n)` → `1,234`
   - `fmtCurrency(n)` → `1.234.000` (VN locale, no decimals, no đ symbol - đặt symbol qua label cột)
   - `fmtPercent(n)` → `12.34%` (1 decimal)
   - `fmtDuration(sec)` → `2:34` (mm:ss) hoặc `1h 23m` nếu > 1h
3. **Tạo `bar-cell-table.tsx`**:
   - Define generic interface `BarCellColumn<T>`, `BarCellTableProps<T>`
   - Compute max per column trong `useMemo` (sort khi data đổi)
   - Render table với sticky thead + sticky 2 cột đầu
   - Internal `BarCell` component
   - Sort state qua `useState`
   - Tooltip dùng `title` attribute (simple) hoặc shadcn Tooltip nếu đã có
4. **Color map** trong file:
   ```ts
   const COLOR_MAP = {
     sky:     { bg: 'bg-sky-400/30',     text: 'text-sky-900',     bar: 'bg-sky-500' },
     teal:    { bg: 'bg-teal-400/30',    text: 'text-teal-900',    bar: 'bg-teal-500' },
     amber:   { bg: 'bg-amber-400/30',   text: 'text-amber-900',   bar: 'bg-amber-500' },
     emerald: { bg: 'bg-emerald-400/30', text: 'text-emerald-900', bar: 'bg-emerald-500' },
     rose:    { bg: 'bg-rose-400/30',    text: 'text-rose-900',    bar: 'bg-rose-500' },
     violet:  { bg: 'bg-violet-400/30',  text: 'text-violet-900',  bar: 'bg-violet-500' },
     blue:    { bg: 'bg-blue-500/40',    text: 'text-white',       bar: 'bg-blue-600' },
     cyan:    { bg: 'bg-cyan-400/30',    text: 'text-cyan-900',    bar: 'bg-cyan-500' },
     slate:   { bg: 'bg-slate-300/40',   text: 'text-slate-700',   bar: 'bg-slate-400' },
   };
   ```
5. **Totals row**: tính sum cho mỗi numeric column qua `accessor` hoặc direct key
6. **Skeleton loading**: render 8 row `<div className="h-7 bg-slate-100 animate-pulse rounded" />`
7. **Cell click handler**: wrap `BarCell` trong `<button>` nếu column có `onCellClick`, thêm `cursor-pointer hover:ring-2 hover:ring-sky-300` visual feedback
8. **Custom renderCell**: nếu column có `renderCell` → dùng nó thay vì format value mặc định (vẫn render bar dựa trên `accessor`)
9. **Test render** với fake data trong 1 file scratch (`/test-bar-table` route hoặc Storybook nếu có)

## Todo List

- [ ] Đọc `employee-scorecard.tsx` + `constants.ts`
- [ ] Đọc 1-2 table component có sẵn để học style pattern
- [ ] Tạo `format-value.ts` với 4 formatter
- [ ] Tạo `bar-cell-table.tsx` với generic types
- [ ] Implement sticky header + sticky 2 cột đầu
- [ ] Implement BarCell internal với COLOR_MAP
- [ ] Implement totals row (sum per column)
- [ ] Implement sort state
- [ ] Skeleton + empty state
- [ ] Test render bằng fake data
- [ ] Verify mobile responsive (DevTools)

## Success Criteria

- Component render đúng visual giống mẫu ảnh (bar trong cell, totals row, sticky cột tên)
- Generic types - dùng được cho cả 3 tab khác data shape
- 200 row render < 100ms (đo bằng React DevTools Profiler)
- Mobile horizontal scroll smooth, sticky cột không jitter
- Click header sort hoạt động
- Skeleton + empty state đúng
- No console warning, no TypeScript error

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Sticky 2 cột + horizontal scroll bug Safari iOS | Test sớm, dùng `position: sticky; z-index: ...` hierarchy đúng |
| Bar overflow khi value > max (race condition) | `Math.min(100, percent)` |
| Format Number quá lớn vỡ layout | `truncate` + `title` cho tooltip full value |
| Sort instability cho row có cùng value | Secondary sort by `userId` |
| Tailwind purge mất class `bg-sky-400/30` dynamic | Whitelist trong tailwind.config hoặc dùng full class name trong COLOR_MAP literal |

## Security Considerations

- N/A (pure presentational component)
- Escape user-provided strings (name) - React tự handle khi render `{value}`

## Next Steps

- Phase 04 sẽ wire 3 hook data vào component này tạo 3 table cho 3 tab
- Có thể tái dùng cho dashboard chính sau này (Top performers, etc.)
