# Phase 02 — Frontend: rewrite label-settings.tsx

## Bối cảnh

Hiện `label-settings.tsx` là wrapper mỏng quanh `SettingsCrudList`. Cần rewrite thành component riêng để hỗ trợ 2-endpoint flow.

## Files

- `apps/web/src/components/settings/label-settings.tsx` (rewrite, vẫn ~150 dòng)

## API endpoints

- `POST /labels` { name, color, category }
- `PATCH /labels/:id` { name?, color?, category?, isActive? }
- `DELETE /labels/:id` (soft delete)
- `POST /recall-configs/labels` { labelId, days } — SUPER_ADMIN only
- `PATCH /recall-configs/labels/:id` { days?, isActive? }
- `DELETE /recall-configs/labels/:id`

## Props mới

```ts
interface LabelSettingsProps {
  data: LabelEntity[];                // có recallConfig? optional
  recallConfigs: LabelRecallConfigItem[];  // list từ /recall-configs/labels
  canEdit: boolean;                   // manager + admin (sửa label)
  canEditRecall: boolean;             // chỉ admin (sửa recall)
}
```

## State machine submit (Edit case)

```
oldDays (existing config days, undefined nếu không có)
newDays (input từ form, undefined nếu trống)

oldDays === undefined && newDays > 0   → POST /recall-configs/labels
oldDays > 0          && newDays === undefined → DELETE /recall-configs/labels/:configId
oldDays > 0          && newDays > 0    → if (old !== new) PATCH else skip
oldDays === undefined && newDays === undefined → skip
```

Create case: chỉ POST nếu `newDays > 0`.

## UI design

- List item: tên + màu chip + category + (nếu có config) badge `🕒 Recall sau X ngày`
- Dialog có 4 trường:
  - Tên (required, text)
  - Màu (color picker, default `#6b7280`)
  - Danh mục (text, optional)
  - Số ngày auto-recall (number, optional, min=1, max=365, **disabled nếu !canEditRecall**)
- Helper text dưới trường recall: "Để trống nếu không cần auto-recall. Lead có nhãn này quá X ngày sẽ về kho POOL."

## Validation

- name: dùng `settingsNameSchema` đã có
- days: nếu có giá trị → integer [1, 365]

## Error handling

- POST label OK + POST config FAIL → toast warning "Đã tạo nhãn '{name}' nhưng cấu hình recall thất bại"
- DELETE label thất bại do FK (nếu schema chưa cascade) → toast error backend trả về

## Success Criteria

- [ ] Component dưới 200 dòng (theo file size guideline)
- [ ] Pre-fill đúng khi edit
- [ ] Toast success/error rõ ràng
- [ ] Manager không thấy/không sửa được trường recall
