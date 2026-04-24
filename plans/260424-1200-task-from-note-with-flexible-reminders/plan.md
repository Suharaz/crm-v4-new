# Plan: Note Dialog Đồng Bộ + Task Với Flexible Reminders

**Created:** 2026-04-24 12:00 (Asia/Saigon)
**Branch:** master
**Status:** ✅ All phases completed (2026-04-24)

---

## 🎯 Mục tiêu

1. Checkbox "Tạo công việc từ ghi chú này" hiển thị ở **TẤT CẢ** chỗ có nút ghi chú (hiện chỉ 1/3 chỗ có)
2. Trong dialog ghi chú, user set được **deadline** cho task (bắt buộc nếu tick tạo task)
3. **Mặc định 3 mốc nhắc** (1 ngày / 1 giờ / 30 phút trước deadline) — auto lọc mốc quá khứ
4. User có thể **custom:** sửa thời gian từng mốc, xoá mốc, thêm mốc mới (max 5 mốc)
5. Notification hiện ra ở **chuông bell** (đã có sẵn UI), click → điều hướng đến lead/customer

---

## 🗂️ Quyết định thiết kế đã chốt

| # | Quyết định | Lý do |
|---|---|---|
| 1 | **Bảng riêng `task_reminders`** (1-N) | User cần thêm/xoá mốc linh hoạt |
| 2 | **Max 5 mốc/task** | Tránh spam notification |
| 3 | **Deadline BẮT BUỘC** nếu tick tạo task | Không có deadline → không có gì để nhắc |
| 4 | **assignedTo = user hiện tại (creator)** | Người tạo thì task thuộc về họ |
| 5 | **Drop `remindAt` cũ** sau migrate | Chưa có prod data, sạch sẽ |
| 6 | **Đổi deadline sau khi custom** → HỎI user | Tôn trọng custom, tránh overwrite ngầm |
| 7 | **Click notification** → link đến entity (lead/customer/task) | UX tốt, `referenceId` đã có trong schema |

---

## 📅 Phases

| Phase | File | Effort | Dependency | Status |
|---|---|---|---|---|
| 01 | [phase-01-database-schema.md](./phase-01-database-schema.md) | 2h | — | ✅ Done |
| 02 | [phase-02-backend-service.md](./phase-02-backend-service.md) | 3h | P1 | ✅ Done |
| 03 | [phase-03-reminder-list-component.md](./phase-03-reminder-list-component.md) | 3h | — (parallel P1/P2) | ✅ Done |
| 04 | [phase-04-shared-note-dialog.md](./phase-04-shared-note-dialog.md) | 3h | P3 | ✅ Done |
| 05 | [phase-05-integration-and-e2e.md](./phase-05-integration-and-e2e.md) | 2h | P2+P4 | ✅ Done |

**Tổng:** ~13h

---

## 🔗 Dependencies Graph

```
P1 (schema) ──► P2 (backend service + cron)
                              │
P3 (reminder-list FE) ──► P4 (note-dialog shared) ──► P5 (integrate 3 chỗ + E2E)
                                                           ▲
P2 ─────────────────────────────────────────────────────┘
```

Có thể **parallel:** P1-P2 (backend) và P3 (FE reminder-list) chạy đồng thời.

---

## 📂 Files sẽ thay đổi

**Backend:**
- ➕ `packages/database/prisma/schema.prisma` — thêm model `TaskReminder`, drop `remindAt/remindedAt`
- ➕ `packages/database/prisma/migrations/*_task_reminders/migration.sql`
- 📝 `apps/api/src/modules/tasks/tasks.service.ts` — CRUD reminders + cron refactor
- 📝 `apps/api/src/modules/tasks/tasks.controller.ts` (nếu expose endpoint riêng)
- 📝 `apps/api/src/modules/tasks/dto/create-task.dto.ts`

**Shared types:**
- 📝 `packages/types/src/tasks.ts` — thêm `TaskReminderDto`

**Frontend:**
- ➕ `apps/web/src/components/shared/reminder-list.tsx` — component quản lý list mốc nhắc
- ➕ `apps/web/src/components/shared/note-dialog.tsx` — dialog gộp 3 chỗ
- 📝 `apps/web/src/components/leads/lead-actions.tsx` — replace inline dialog
- 📝 `apps/web/src/components/leads/lead-inline-expand-detail.tsx` — replace bar note
- 📝 `apps/web/src/components/shared/entity-quick-preview-dialog.tsx` — replace inline note
- 📝 `apps/web/src/components/layout/notification-bell.tsx` — thêm icon + click navigation
- 📝 `apps/web/src/lib/notification-navigation.ts` (NEW) — map referenceType → URL

**Tests:**
- ➕ `apps/api/src/modules/tasks/tasks.service.spec.ts`
- ➕ `tests/e2e/notes/create-note-with-task-reminders.spec.ts`

---

## ⚠️ Pitfalls Đã Dự Trù (xem chi tiết trong từng phase)

1. Deadline quá gần → filter mốc past khi tạo
2. Timezone Asia/Saigon vs UTC
3. User đổi deadline → hỏi có reset reminders không
4. User xoá hết mốc → warn nhưng cho phép
5. Task creation fail silent → thay bằng toast rõ ràng

---

## ✅ Success Criteria

- [x] 3 chỗ có nút ghi chú đều có checkbox "Tạo công việc"
- [x] Dialog có DateTime picker cho deadline
- [x] Auto tính 3 mốc default khi chọn deadline
- [x] User có thể add/edit/delete mốc (max 5)
- [x] Mốc quá khứ hiện mờ + warn "đã qua"
- [x] Cron gửi notification đúng từng mốc, không double-send
- [x] Đổi deadline → dialog xác nhận update reminders
- [x] Notification bell hiện badge đỏ, icon ⏰ cho TASK_REMIND
- [x] Click notification → điều hướng đến lead/customer/task chi tiết
- [x] E2E test pass: tạo note → tạo task → nhận notif → click navigate
- [x] Migration an toàn, không mất data

---

## ❓ Unresolved Questions

Không còn. Đã chốt hết với user ngày 2026-04-24.
