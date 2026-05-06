# Phase 04 - Shared Note Dialog

**Priority:** P1 | **Status:** ✅ Completed | **Effort:** 3h | **Depends on:** P3

## Overview
Tạo component `<NoteDialog />` dùng chung cho 3 chỗ có nút ghi chú. Tích hợp ReminderList, checkbox tạo task, submit song song 2 API.

## Requirements
- Props: `open`, `onOpenChange`, `entityType`, `entityId`, `onSuccess?`
- UI gọn, phù hợp cả popup nhỏ (inline expand) và dialog to (lead-actions menu)
- Tick "Tạo công việc" → expand section nhập title + dueDate + ReminderList
- Submit song song: POST note + POST task (nếu tick)
- Error handling: toast rõ ràng, không silent fail

## File mới
`apps/web/src/components/shared/note-dialog.tsx`

## Interface
```tsx
interface NoteDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  entityType: 'lead' | 'customer';
  entityId: string | bigint;
  onSuccess?: () => void;  // invalidate timeline query
}
```

## State
```tsx
const { user } = useAuth();

const [noteText, setNoteText] = useState('');
const [createTask, setCreateTask] = useState(false);

// Task fields (chỉ active khi createTask=true)
const [taskTitle, setTaskTitle] = useState('');
const [dueDate, setDueDate] = useState('');          // ISO local
const [reminders, setReminders] = useState<ReminderItem[]>([]);
const [reminderCustomized, setReminderCustomized] = useState(false);

const [submitting, setSubmitting] = useState(false);
```

## UI Layout
```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="max-w-lg">
    <DialogHeader>
      <DialogTitle>Thêm ghi chú</DialogTitle>
    </DialogHeader>

    <div className="space-y-4">
      <Textarea
        value={noteText}
        onChange={e => {
          setNoteText(e.target.value);
          // Auto-fill task title nếu user chưa nhập
          if (createTask && !taskTitle) {
            setTaskTitle(e.target.value.slice(0, 50));
          }
        }}
        placeholder="Nội dung ghi chú..."
        rows={4}
        autoFocus
      />

      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={createTask}
          onCheckedChange={v => setCreateTask(!!v)}
        />
        Tạo công việc từ ghi chú này
      </label>

      {createTask && (
        <div className="space-y-3 rounded-lg border border-sky-100 bg-sky-50/30 p-3">
          <div>
            <label className="text-xs text-slate-600">Tiêu đề</label>
            <Input
              value={taskTitle}
              onChange={e => setTaskTitle(e.target.value)}
              maxLength={200}
              placeholder="Tên công việc"
            />
          </div>

          <div>
            <label className="text-xs text-slate-600">
              Hạn <span className="text-red-500">*</span>
            </label>
            <Input
              type="datetime-local"
              value={toInputValue(dueDate)}
              onChange={e => handleDueChange(fromInputValue(e.target.value))}
              required
              min={toInputValue(new Date().toISOString())}
            />
          </div>

          <ReminderList
            dueDate={dueDate}
            reminders={reminders}
            onChange={(r) => {
              setReminders(r);
              setReminderCustomized(true);
            }}
            maxReminders={5}
          />
        </div>
      )}
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={() => onOpenChange(false)}>Huỷ</Button>
      <Button onClick={handleSubmit} disabled={!canSubmit || submitting}>
        {submitting ? 'Đang xử lý...' : 'Thêm'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

## Logic

### `handleDueChange`
```ts
function handleDueChange(newDueISO: string) {
  setDueDate(newDueISO);

  if (!newDueISO) {
    setReminders([]);
    return;
  }

  // Nếu user đã custom → hỏi có update không
  if (reminderCustomized && reminders.length > 0) {
    const keep = confirm('Bạn đã tuỳ chỉnh nhắc nhở. Cập nhật lại theo hạn mới? (Huỷ để giữ nguyên)');
    if (!keep) return;
  }

  setReminders(computeDefaultReminders(new Date(newDueISO)));
  setReminderCustomized(false);
}
```

### `canSubmit` (derived)
```ts
const canSubmit = useMemo(() => {
  if (!noteText.trim()) return false;
  if (createTask) {
    if (!taskTitle.trim()) return false;
    if (!dueDate) return false;
    // ReminderList đã validate past/after-due ở component
  }
  return true;
}, [noteText, createTask, taskTitle, dueDate]);
```

### `handleSubmit`
```ts
async function handleSubmit() {
  setSubmitting(true);
  try {
    // 1. POST note
    const activityUrl = `/${entityType === 'lead' ? 'leads' : 'customers'}/${entityId}/activities`;
    await api.post(activityUrl, { type: 'NOTE', content: noteText.trim() });

    // 2. POST task nếu tick
    if (createTask && user) {
      await api.post('/tasks', {
        title: taskTitle.trim(),
        description: noteText.trim(),
        entityType: entityType.toUpperCase(),
        entityId: String(entityId),
        assignedTo: String(user.id),
        dueDate: new Date(dueDate).toISOString(),
        reminders: reminders.map(r => ({
          remindAt: new Date(r.remindAt).toISOString(),
          label: r.label,
        })),
      });
      toast.success('Đã thêm ghi chú và tạo công việc');
    } else {
      toast.success('Đã thêm ghi chú');
    }

    // Reset + callback
    resetForm();
    onSuccess?.();
    onOpenChange(false);
  } catch (e: any) {
    toast.error(e?.response?.data?.message ?? 'Có lỗi xảy ra, vui lòng thử lại');
  } finally {
    setSubmitting(false);
  }
}

function resetForm() {
  setNoteText('');
  setCreateTask(false);
  setTaskTitle('');
  setDueDate('');
  setReminders([]);
  setReminderCustomized(false);
}
```

## Timezone Helpers
```ts
// Convert ISO string → value cho <input type="datetime-local"> (local time, no TZ)
function toInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Reverse: local input → ISO (browser tự áp local TZ)
function fromInputValue(v: string): string {
  return v ? new Date(v).toISOString() : '';
}
```

## Implementation Steps
1. Tạo `note-dialog.tsx`
2. Import `ReminderList` + helper `computeDefaultReminders`
3. Implement state + logic
4. Style theo design system
5. Test manual trong 1 page trước khi replace 3 chỗ

## Todo
- [x] Create component skeleton
- [x] State management
- [x] Dialog layout + task section expand
- [x] Timezone helpers
- [x] Submit logic với parallel API
- [x] Error handling + toast
- [x] Reset form on success/cancel

## Success Criteria
- Dialog mở/đóng smooth
- Tick "Tạo công việc" → section task hiện ra (animation nhẹ)
- Uncheck → section ẩn, không reset data đã nhập (UX tốt)
- Submit 2 API thành công → toast + close
- Note API thành công, task fail → toast lỗi rõ ràng (không silent)
- Note API fail → không gọi task API, toast lỗi
- Reset form khi close

## Risks
- Race condition: user submit 2 lần liên tiếp → disabled button khi submitting
- Note thành công nhưng task fail → UX hơi khó xử. Decision: báo lỗi rõ, user có thể tạo task thủ công từ timeline
- Keyboard UX: Enter trong textarea không submit (intentional)

## Security
- API client tự inject JWT
- `entityId` từ prop (trusted from parent component)
- Không render raw HTML, React auto escape
