# Plan: System Trace & Audit Log

**Created:** 2026-05-05 14:45 | **Branch:** master | **Status:** Implemented (build passes)

## Goal
Trang `/trace` (super_admin only) để xem toàn bộ hoạt động hệ thống: user actions (login/CRUD), cron job execution history, entity-level activities. Tất cả persist trong DB, retention 60 ngày, có filter chi tiết.

## Scope (đã chốt với user)
- Audit toàn bộ **mutation** (POST/PUT/PATCH/DELETE) + **login/logout**
- Retention: **60 ngày** (cron xoá row cũ hơn)
- Không cần xuất CSV/Excel
- Không cần real-time (refresh thủ công OK)
- Không cần alert
- Filter chi tiết: user, dept, action, entityType, entityId, IP, time-range

## Out of Scope
- GET request logging (volume quá cao, ít giá trị)
- Real-time websocket
- Alert/notification khi có sự kiện đáng ngờ
- CSV/Excel export
- Diff viewer phức tạp (chỉ hiện metadata raw JSON)

## Architecture
3 nguồn dữ liệu, 1 trang UI tổng hợp:

| Nguồn | Bảng | Volume | Retention |
|---|---|---|---|
| User actions | `audit_logs` (NEW) | Cao | 60 ngày |
| Cron history | `cron_runs` (NEW) | Thấp | 60 ngày |
| Entity timeline | `activities` (existing) | Trung bình | Vĩnh viễn |

## Phases

| # | Phase | File | Est | Depends | Status |
|---|---|---|---|---|---|
| 01 | DB schema + migration | `phase-01-database-schema.md` | 1h | - | ✅ done |
| 02 | AuditLog service + global interceptor | `phase-02-audit-log-service-interceptor.md` | 3h | 01 | ✅ done |
| 03 | CronRun tracking wrapper | `phase-03-cron-run-tracking.md` | 2h | 01 | ✅ done |
| 04 | Instrument 3 cron jobs + recall activity log | `phase-04-instrument-existing-modules.md` | 2h | 02, 03 | ✅ done |
| 05 | Frontend `/trace` page (2 tabs + filters) | `phase-05-frontend-trace-page.md` | 4h | 02, 03 | ✅ done |
| 06 | Retention cron + unit/integration tests | `phase-06-retention-cleanup-tests.md` | 2h | 02-05 | ⚠️ retention done; tests skipped (no jest infra) |

**Total:** ~14h

## Key Dependencies
- Phase 01 blocks all (cần schema trước)
- Phase 02 + 03 có thể parallel sau 01
- Phase 04 cần 02 + 03 xong (gọi service mới)
- Phase 05 cần API ready (02 + 03)
- Phase 06 cuối cùng (cleanup + verification)

## Critical Decisions
1. **Tách 3 bảng** thay vì gom 1 bảng `system_events` → giữ pattern truy vấn cũ, tránh hot table
2. **Fire-and-forget** trong interceptor → không block request chính
3. **Whitelist mutation routes** trong interceptor (skip GET) → giảm noise
4. **Sanitize secrets** (password, token) trong metadata trước khi insert
5. **Truncate metadata** mỗi field max 4KB → tránh bloat
6. **Only super_admin** xem trang `/trace` → guard ở backend + frontend

## Risks
- **R1:** Audit log latency làm chậm request → mitigation: setImmediate / Promise không await
- **R2:** Bảng phình → mitigation: retention 60 ngày + index hợp lý
- **R3:** Quên log secrets → mitigation: sanitize whitelist field names
- **R4:** Cron tracking lỗi → mitigation: try/finally trong wrapper, không throw

## Validation
- Unit test: AuditLogService, CronRunService, sanitizer
- Integration: bắn 1 mutation request → kiểm tra row trong `audit_logs`
- E2E: login as super_admin → vào `/trace` → filter → kết quả đúng
- Manual: check 3 cron jobs sau 5 phút có row trong `cron_runs`
