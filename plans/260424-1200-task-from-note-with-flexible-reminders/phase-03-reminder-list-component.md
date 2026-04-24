# Phase 03 — Reminder List Component (FE)

**Priority:** P1 | **Status:** ✅ Completed | **Effort:** 3h | **Parallel:** với P1/P2

## Overview
Component dùng chung `<ReminderList />` quản lý danh sách mốc nhắc: auto-compute default từ deadline, add/edit/delete/toggle mốc, max 5.

## Requirements
- Input: `dueDate` (controlled prop)
- Input: `reminders` (controlled prop — array `{ remindAt, label? }[]`)
- Output: `onChange(reminders)` mỗi khi user sửa
- Auto-compute 3 default (1d/1h/30min) khi `dueDate` thay đổi VÀ `reminders` rỗng
- Filter mốc past khi auto-compute
- UI: mỗi row có label + datetime + icon edit/delete
- Button "+ Thêm mốc nhắc" (disabled khi đã 5 mốc)
- Warn user nếu mốc > dueDate (không cho save)

## File mới
`apps/web/src/components/shared/reminder-list.tsx`

## Interface
```tsx
export interface ReminderItem {
  remindAt: string;     // ISO
  label?: string;
}

interface ReminderListProps {
  dueDate: string | null;           // ISO
  reminders: ReminderItem[];
  onChange: (reminders: ReminderItem[]) => void;
  maxReminders?: number;            // default 5
  disabled?: boolean;
}
```

## UI Layout (pseudo)
```tsx
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <label>Nhắc nhở (tối đa {max})</label>
    {reminders.length < max && (
      <Button size="sm" variant="ghost" onClick={handleAdd}>
        <Plus size={14} /> Thêm mốc
      </Button>
    )}
  </div>

  {reminders.length === 0 && (
    <p className="text-xs text-amber-600">
      ⚠️ Công việc sẽ không có nhắc nhở nào
    </p>
  )}

  {reminders.map((r, i) => (
    <ReminderRow
      key={i}
      reminder={r}
      dueDate={dueDate}
      onEdit={(newR) => handleEdit(i, newR)}
      onDelete={() => handleDelete(i)}
    />
  ))}
</div>
```

### ReminderRow (sub-component trong cùng file)
```tsx
function ReminderRow({ reminder, dueDate, onEdit, onDelete }) {
  const isPast = new Date(reminder.remindAt) < new Date();
  const afterDue = dueDate && new Date(reminder.remindAt) >= new Date(dueDate);

  return (
    <div className={cn(
      "flex items-center gap-2 p-2 rounded-lg border",
      isPast && "opacity-60 bg-slate-50",
      afterDue && "border-red-300 bg-red-50"
    )}>
      <Clock size={14} className="text-slate-400" />

      <input
        type="datetime-local"
        value={toInputValue(reminder.remindAt)}
        onChange={e => onEdit({ ...reminder, remindAt: fromInputValue(e.target.value) })}
        className="text-sm border-0 bg-transparent"
      />

      <input
        type="text"
        placeholder="Ghi chú mốc (tuỳ chọn)"
        value={reminder.label ?? ''}
        onChange={e => onEdit({ ...reminder, label: e.target.value })}
        maxLength={50}
        className="flex-1 text-xs text-slate-600 border-0 bg-transparent"
      />

      {isPast && <span className="text-xs text-amber-600">⚠ đã qua</span>}
      {afterDue && <span className="text-xs text-red-600">⚠ sau hạn</span>}

      <Button size="sm" variant="ghost" onClick={onDelete}>
        <Trash2 size={14} />
      </Button>
    </div>
  );
}
```

## Logic

### Auto-compute khi dueDate đổi (parent sẽ dispatch)
```ts
// Expose static helper cho parent dùng
export function computeDefaultReminders(dueDate: Date, now = new Date()): ReminderItem[] {
  const candidates = [
    { offset: 86400_000, label: '1 ngày trước' },
    { offset: 3600_000,  label: '1 giờ trước' },
    { offset: 1800_000,  label: '30 phút trước' },
  ];
  return candidates
    .map(c => ({ remindAt: new Date(dueDate.getTime() - c.offset).toISOString(), label: c.label }))
    .filter(r => new Date(r.remindAt) > now);
}
```

### Parent dùng:
```tsx
// Trong NoteDialog:
function handleDueDateChange(newDue: string) {
  setDueDate(newDue);
  // Hỏi user nếu đã có custom reminders
  if (reminders.length > 0 && userCustomized) {
    if (confirm('Bạn đã tùy chỉnh nhắc nhở. Cập nhật lại theo hạn mới?')) {
      setReminders(computeDefaultReminders(new Date(newDue)));
    }
  } else {
    setReminders(computeDefaultReminders(new Date(newDue)));
  }
}
```

### Validation trước khi submit
```ts
const invalidReminders = reminders.filter(r => {
  const ra = new Date(r.remindAt);
  return ra >= new Date(dueDate);
});
if (invalidReminders.length) {
  toast.error('Có mốc nhắc sau hạn công việc');
  return;
}
```

## Implementation Steps
1. Tạo `reminder-list.tsx` với `ReminderList` + `ReminderRow`
2. Export helper `computeDefaultReminders`
3. Handle datetime-local <-> ISO conversion (watch timezone)
4. Styling theo design system (sky blue accents, rounded-lg)
5. Storybook hoặc preview trong dev
6. Test manual: add/edit/delete, max 5, past state, after-due state

## Todo
- [x] Create `reminder-list.tsx`
- [x] Export `computeDefaultReminders` helper
- [x] Timezone helpers `toInputValue` / `fromInputValue`
- [x] Style according to design guidelines
- [x] Manual test các edge case
- [x] A11y: label cho inputs, keyboard nav

## Success Criteria
- Component render đúng 3 default khi có dueDate
- Past reminder hiện mờ + badge "đã qua"
- After-due reminder border đỏ + badge "sau hạn"
- Button "+ Thêm mốc" disabled khi đã 5
- Empty state hiện warn "sẽ không có nhắc nhở"
- Timezone Asia/Saigon: input hiển thị local time, ISO output đúng UTC

## Risks
- `datetime-local` không hỗ trợ Safari iOS tốt — test trên mobile
- Timezone bug: user chọn "14:00" nghĩ là 14h Saigon, hệ thống hiểu 14h UTC

## Security
- Input sanitize cho `label` (XSS prevention qua React escaping mặc định, nhưng max 50 chars)
