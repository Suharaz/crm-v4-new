# Phase 05 - Frontend UI Components

## Context Links

- Plan: [plan.md](plan.md) | Phase 04 (types): [phase-04-frontend-types-and-data.md](phase-04-frontend-types-and-data.md)

## Overview

- **Priority:** High (user-facing)
- **Status:** Pending
- Đổi mọi UI Lead label từ multi-select/multi-badge sang single-select dropdown + 1 badge.
- Customer UI giữ nguyên.

## Related Code Files

**Modify (Lead UI):**
- `apps/web/src/components/leads/lead-actions.tsx` - replace multi-select picker với `<Select>`
- `apps/web/src/components/leads/lead-table.tsx` - render 1 badge thay vì map
- `apps/web/src/components/leads/lead-list-with-view-toggle.tsx`
- `apps/web/src/components/leads/lead-inline-expand-detail.tsx`
- `apps/web/src/components/leads/lead-pool-table-with-bulk-assign.tsx`
- `apps/web/src/components/leads/lead-list-advanced-filter-bar.tsx` - filter vẫn multi (lọc "thuộc các nhãn"), không đổi
- `apps/web/src/components/leads/lead-kanban-view-by-label.tsx` - group by `lead.labelId`, mỗi lead đúng 1 cột
- `apps/web/src/components/shared/entity-quick-preview-dialog.tsx` - Lead branch render `label` thay `labels[]`
- `apps/web/src/app/(dashboard)/leads/[id]/page.tsx` - detail page

**Modify (CSV Import UI):**
- `apps/web/src/components/import/import-template-dialog.tsx` - note "Nếu nhiều nhãn, chỉ nhãn đầu được áp dụng"

**Modify (Settings - không đổi logic, chỉ kiểm tra):**
- `apps/web/src/components/settings/label-settings.tsx` - verify usage stats hiển thị đúng cho cả lead + customer

**Don't touch (Customer):**
- `apps/web/src/components/customers/*` - multi-label giữ nguyên
- `apps/web/src/app/(dashboard)/customers/[id]/page.tsx`

## Architecture

```
Lead Detail UI:
┌───────────────────────────────┐
│ Nhãn:  [Chọn nhãn ▼]          │   <- shadcn Select, single
│        [VIP] [×]               │   <- 1 badge nếu đã chọn
└───────────────────────────────┘

Customer Detail UI (UNCHANGED):
┌───────────────────────────────┐
│ Nhãn: [+ Thêm nhãn]            │
│  [VIP] [×]  [Khách cũ] [×]    │   <- nhiều badge
└───────────────────────────────┘
```

## Implementation Steps

### 1. `lead-actions.tsx` - Single Select picker

```tsx
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

<Select
  value={lead.labelId ?? ""}
  onValueChange={async (val) => {
    const newId = val === "" ? null : val;
    await setLeadLabel(lead.id, newId);
    onRefresh();
  }}
>
  <SelectTrigger>
    <SelectValue placeholder="Chưa có nhãn" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="">- Bỏ nhãn -</SelectItem>
    {availableLabels.map(l => (
      <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
    ))}
  </SelectContent>
</Select>
```

### 2. Table cell - 1 badge

```tsx
// BEFORE: lead.labels.map(l => <Badge>{l.name}</Badge>)
// AFTER:
{lead.label ? (
  <Badge style={{ backgroundColor: lead.label.color }}>{lead.label.name}</Badge>
) : (
  <span className="text-muted-foreground text-sm">-</span>
)}
```

### 3. Kanban view by label

`lead-kanban-view-by-label.tsx`: group `leads` by `labelId`, mỗi lead chỉ vào 1 cột (không cần dedup nữa). Cột "Chưa có nhãn" cho `labelId === null`.

### 4. Filter bar

Filter vẫn multi-select (UX): user chọn nhiều nhãn → filter "lead có labelId IN (...)". API query vẫn nhận `labelIds[]` để filter, chỉ logic gắn-cho-lead là single.

### 5. CSV Import dialog

Thêm helper text dưới preview:
> "Cột `labels` chỉ áp dụng nhãn đầu tiên cho mỗi lead. Các nhãn còn lại sẽ bị bỏ qua (xem warning trong job log)."

## Todo List

- [ ] `lead-actions.tsx` - Select single picker
- [ ] `lead-table.tsx` - 1 badge cell
- [ ] `lead-list-with-view-toggle.tsx`
- [ ] `lead-inline-expand-detail.tsx`
- [ ] `lead-pool-table-with-bulk-assign.tsx`
- [ ] `lead-kanban-view-by-label.tsx` - group logic
- [ ] `entity-quick-preview-dialog.tsx` Lead branch
- [ ] `[id]/page.tsx` Lead detail
- [ ] `import-template-dialog.tsx` - helper text
- [ ] `pnpm --filter @crm/web build` pass
- [ ] Manual test: list, detail, kanban, filter, import

## Success Criteria

- Mở `/leads/123` → chọn nhãn từ dropdown → reload thấy 1 badge
- Đổi nhãn → badge thay đổi (không thấy 2 badge)
- Bỏ nhãn (chọn "- Bỏ nhãn -") → không còn badge
- Kanban: 1 lead chỉ ở 1 cột
- Customer page: vẫn gắn nhiều nhãn được, không regression

## Risk Assessment

- **Risk:** Cache TanStack Query cũ giữ shape `lead.labels[]` → component crash. **Mitigation:** Invalidate cache + soft hard-refresh sau deploy. Note trong release.
- **Risk:** Settings label usage count hiển thị sai sau migrate (count by `lead_labels` không còn). **Mitigation:** Update query backend đếm `lead.label_id = X`.

## Security Considerations

- Click "Bỏ nhãn" yêu cầu cùng permission như "Đổi nhãn" - guard ở backend (Phase 03)

## Next Steps

→ Phase 06: seed + docs.
