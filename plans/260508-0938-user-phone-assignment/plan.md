# Plan: User Phone Assignment & Call Match Refactor

**Created:** 2026-05-08 09:38
**Branch:** master
**Status:** Implementation Complete (2026-05-08)

## Goal

Mỗi user (sale) được super admin phân cho 1 danh sách SĐT. Khi cuộc gọi đến, hệ thống match user qua bảng `user_phones` TRƯỚC, sau đó mới match LEAD/CUSTOMER để gắn timeline.

## Business Rules

- Quan hệ: 1 user → N phones (1 user nhiều số). 1 phone → 1 user (UNIQUE).
- Có lịch sử transfer (audit trail) khi chuyển số giữa các user.
- Quyền phân/chuyển/xóa: chỉ `SUPER_ADMIN`.
- Logic match cuộc gọi mới: `user_phones` → LEAD → CUSTOMER → UNMATCHED.
- Định nghĩa lại UNMATCHED: không match được CẢ user lẫn entity.

## Defaults Applied (có thể đảo ngược)

| Quyết định | Default | Ghi chú |
|---|---|---|
| Migration data cũ | Bắt đầu trống | Super admin nhập tay hoặc bulk CSV |
| User deactivate | Giữ nguyên user_phones | Super admin transfer thủ công khi cần |
| Bulk import | Đưa vào phase 2 | Cần thiết khi phân nhiều số 1 lúc |
| Số phụ customer | Match theo số gọi đến | Không fallback sang số phụ khác |

## Phases

| # | File | Phụ thuộc | Effort | Status | Mô tả |
|---|---|---|---|---|---|
| 01 | [phase-01-database-schema.md](./phase-01-database-schema.md) | - | 1.5h | Done | Prisma schema + raw partial unique index |
| 02 | [phase-02-backend-api.md](./phase-02-backend-api.md) | 01 | 4h | Done | Module user-phones (CRUD + transfer + bulk import) |
| 03 | [phase-03-call-logs-match-logic.md](./phase-03-call-logs-match-logic.md) | 02 | 2h | Done | Refactor `call-logs.service.ts` match flow |
| 04 | [phase-04-frontend-admin-ui.md](./phase-04-frontend-admin-ui.md) | 02 | 4h | Done | Trang `/user-phones` + dialogs |

**Total:** ~11.5h

## Dependencies

```
Phase 01 (schema) → Phase 02 (API) → Phase 03 (call match) + Phase 04 (UI)
                                       (parallel sau khi 02 done)
```

## Success Criteria

- Super admin tạo/chuyển/xóa SĐT phân cho user qua UI
- Cuộc gọi đến số trong `user_phones` → activity gắn vào đúng user (kể cả khi không match được lead/customer)
- Cuộc gọi đến số CÓ trong `user_phones` VÀ thuộc lead → vẫn gắn vào lead timeline + đúng `matched_user_id`
- Lịch sử transfer ghi đầy đủ trong `user_phone_history`
- Test pass: ingest cuộc gọi với 5 case (user-only, lead+user, customer+user, customer phụ, UNMATCHED)
- Doc cập nhật: `data-model.md`, `business-flows.md`, `project-changelog.md`
