# Phase 03 - Frontend: thêm trường note vào popup tạo lead

## Context Links

- Plan: [plan.md](plan.md)
- Phase 1: [phase-01](phase-01-backend-notes-and-create-with-note.md) - blocker (cần DTO `note` đã thêm backend)
- Create lead dialog: `apps/web/src/components/leads/create-lead-dialog.tsx`
- Permission: chỉ MANAGER + SUPER_ADMIN truy cập (confirmed)

## Overview

- **Priority:** P1
- **Status:** Completed
- **Description:** Thêm `<Textarea>` cho field "Note ban đầu" trong popup tạo lead. Optional, max 2000 ký tự, gửi cùng request POST /leads.

## Key Insights

- Form đã dùng react-hook-form + Zod (kiểm tra trong code thực tế)
- Field optional -> không validation nếu để trống
- Trim trước khi gửi, không gửi key `note` nếu rỗng sau trim (tiết kiệm payload + tránh tạo activity rỗng)

## Requirements

### Functional

- F1: Popup tạo lead có thêm trường "Ghi chú ban đầu" sau field "Sản phẩm" (hoặc cuối form)
- F2: `<Textarea>` 3 rows mặc định, autoresize tới max 6 rows
- F3: Placeholder gợi ý: "VD: Khách hẹn gọi lại 3h chiều..."
- F4: Validation: optional, max 2000 ký tự (báo lỗi nếu vượt)
- F5: Khi submit, trim note; nếu rỗng sau trim -> không truyền key `note` (hoặc gửi `undefined`)
- F6: Sau khi tạo thành công + có note -> note được lưu (verify qua API GET /leads/:id/activities hoặc list `recentNotes`)

### Non-functional

- NF1: Hiển thị character counter (e.g. "120/2000") khi user typing, đổi màu đỏ khi vượt 2000
- NF2: Disable submit button khi đang loading (giữ behavior hiện tại)
- NF3: Không em dash trong placeholder + label

## Architecture

### Form schema delta (Zod)

```ts
// existing schema
const createLeadSchema = z.object({
  phone: z.string().regex(/^\+?\d{8,14}$/, 'Số điện thoại không hợp lệ'),
  name: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  sourceId: z.string().optional(),
  productId: z.string().optional(),
  note: z.string().max(2000, 'Note tối đa 2000 ký tự').optional(),  // NEW
});
```

### Submit handler delta

```ts
const onSubmit = async (data: FormData) => {
  const payload = {
    ...data,
    note: data.note?.trim() || undefined,  // strip if empty
  };
  await api.post('/leads', payload);
};
```

## Related Code Files

### Read
- `apps/web/src/components/leads/create-lead-dialog.tsx` (toàn file)
- `apps/web/src/components/ui/textarea.tsx` (shadcn)
- `apps/web/src/components/ui/form.tsx` (shadcn form wrapper)

### Modify
- `apps/web/src/components/leads/create-lead-dialog.tsx`:
  - Schema: thêm `note: z.string().max(2000).optional()`
  - Form: thêm `<FormField name="note">` với `<Textarea>`
  - Submit: trim + strip rỗng

### Create
- None

### Delete
- None

## Implementation Steps

1. **Read** `create-lead-dialog.tsx` đầy đủ
2. Cập nhật Zod schema thêm field `note` optional max 2000
3. Thêm vào defaultValues `{ note: '' }`
4. Thêm `<FormField>` sau productId:
   ```tsx
   <FormField
     control={form.control}
     name="note"
     render={({ field }) => (
       <FormItem>
         <FormLabel>Ghi chú ban đầu</FormLabel>
         <FormControl>
           <Textarea
             {...field}
             placeholder="VD: Khách hẹn gọi lại 3h chiều..."
             rows={3}
             maxLength={2000}
             className="resize-y max-h-40"
           />
         </FormControl>
         <div className="text-xs text-gray-500 text-right">
           {field.value?.length ?? 0}/2000
         </div>
         <FormMessage />
       </FormItem>
     )}
   />
   ```
5. Cập nhật submit handler:
   ```ts
   const note = values.note?.trim();
   await api.post('/leads', { ...values, note: note || undefined });
   ```
6. Reset form sau submit thành công bao gồm note = ''
7. Chạy `pnpm build` trong `apps/web`
8. Manual test:
   - Tạo lead không note -> POST không có key `note` (hoặc undefined), DB không có activity
   - Tạo lead với note " " (whitespace) -> trim thành rỗng, DB không có activity
   - Tạo lead với note 50 ký tự -> DB có 1 activity content đúng
   - Gõ 2001 ký tự -> báo lỗi, không submit
   - Counter "120/2000" cập nhật realtime

## Todo List

- [x] Read context files
- [x] Update Zod schema + defaultValues
- [x] Thêm FormField Textarea note
- [x] Update submit handler (trim, strip rỗng)
- [x] Counter ký tự realtime
- [x] `pnpm build` không TS error
- [x] Manual test 5 case
- [x] `code-reviewer` review

## Success Criteria

- Popup tạo lead có textarea Note optional
- Note rỗng/whitespace không tạo activity
- Note có content tạo lead + activity atomic (verify qua phase 1 backend)
- Char counter hiển thị đúng
- Form reset sau submit thành công

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Quên reset note khi đóng popup -> note cũ vẫn còn | Low | `form.reset({ ..., note: '' })` trong onClose |
| User paste 10K ký tự, browser lag | Low | `maxLength={2000}` HTML attribute chặn paste vượt |
| Field validation conflict với existing schema | Low | Test thử case tạo lead không note (đảm bảo không break) |

## Security Considerations

- Note content gửi qua HTTPS, không log raw vào console
- Backend đã validate max 2000 (phase 1) -> double-check defense in depth
- Không gửi note key nếu rỗng -> giảm noise trong backend log

## Skills to Activate

- `react-expert` - react-hook-form patterns
- `frontend-development` - shadcn Form + Textarea

## Next Steps

- Tiếp phase 4 nếu chưa làm
- Commit + push: `feat(leads): add note field to create lead dialog`
