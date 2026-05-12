# Phase 01 - Backend: Mở rộng employee-scores API

## Context Links

- Plan overview: [plan.md](./plan.md)
- Service hiện tại: `apps/api/src/modules/dashboard/dashboard.service.ts:302-370`
- Controller hiện tại: `apps/api/src/modules/dashboard/dashboard.controller.ts:76-86`

## Overview

- **Priority:** P0
- **Status:** Complete
- **Effort:** 4h
- **Mô tả:** Mở rộng endpoint `GET /dashboard/employee-scores` để trả thêm 5 field phục vụ tab **BÁO CÁO TỔNG**: số đơn, số sản phẩm, doanh số/lead, giá trị đơn TB, tỉ lệ chốt, lead chưa tác nghiệp.

## Key Insights

- Endpoint hiện trả 7 raw field: `leadsAssigned, leadsConverted, revenue, overdueTasks, agingLeads7d, tasksTotal, tasksCompleted`
- Thiếu cho tab tổng: **số đơn (orders count)**, **số sản phẩm (order_items count)**, **lead chưa tác nghiệp** (no activity)
- Computed field (`doanhSo/Lead`, `giáTrịĐơn TB`, `tỉLệChốt`) tính ở **frontend** từ raw - không cần API trả
- Phải gộp vào 1 raw SQL với CTE để tránh N+1, lock trong cache

## Requirements

### Functional

- API thêm 3 field raw mới:
  - `ordersCount: number` - số đơn user tạo trong kỳ (`orders WHERE created_by = u.id AND created_at BETWEEN from AND to AND deleted_at IS NULL`)
  - `productsCount: number` - tổng quantity từ `order_items` của các đơn trên
  - `untouchedLeads: number` - lead `assigned_user_id = u.id` chưa có activity nào (`NOT EXISTS (SELECT 1 FROM activities a WHERE a.entity_type='LEAD' AND a.entity_id = l.id AND a.deleted_at IS NULL)`)

### Non-functional

- Query single round-trip, sử dụng CTE/subquery
- Cache TTL.DASHBOARD giữ nguyên
- Response time < 500ms cho 200 user (đo bằng `pino` request log)

## Architecture

```
┌─────────────────────────────────────────────────────┐
│ getEmployeeScores(from, to, deptId?)                │
│  ├─ CTE 1: assigned_count  (assignment_history)     │
│  ├─ CTE 2: order_metrics   (orders + order_items)   │  ← NEW
│  ├─ CTE 3: revenue         (payments VERIFIED)      │
│  ├─ CTE 4: untouched_leads (leads LEFT JOIN acts)   │  ← NEW
│  ├─ CTE 5: task_metrics    (tasks)                  │
│  └─ JOIN tất cả với users WHERE role=USER ACTIVE    │
└─────────────────────────────────────────────────────┘
```

## Related Code Files

### Modify
- `apps/api/src/modules/dashboard/dashboard.service.ts` - extend `getEmployeeScores` method (lines 302-370)
- `apps/api/src/modules/dashboard/dto/employee-score.dto.ts` - thêm 3 field response (nếu file tồn tại, nếu không inline trong service interface)
- `packages/types/src/dashboard/index.ts` hoặc tương tự - thêm shared type `EmployeeScoreRaw` 3 field mới
- `apps/web/src/components/dashboard/hooks/use-employee-scores.ts:7-19` - thêm 3 field vào `EmployeeScoreRaw` interface

### Read for context (MUST read before coding)
- `apps/api/src/modules/dashboard/dashboard.service.ts` (toàn file để hiểu pattern raw SQL + cache)
- `apps/api/src/common/interceptors/bigint-serializer.interceptor.ts` (đảm bảo BigInt mới được serialize)
- `packages/database/prisma/schema.prisma` (search `model Activity`, `model OrderItem` để verify column names)
- `apps/web/src/components/dashboard/hooks/use-employee-scores.ts` (verify shape FE expect)

### Create
- None (extend file hiện có)

## Implementation Steps

1. **Đọc** `dashboard.service.ts` toàn file - hiểu pattern caching + raw SQL hiện hành
2. **Đọc** schema Prisma: `Activity`, `OrderItem`, `Order` để confirm column snake_case
3. **Chạy explain analyze** cho query mới (qua `psql` hoặc Prisma raw) để confirm < 500ms
4. **Update `dashboard.service.ts`**:
   - Thêm 3 CTE: `order_metrics`, `untouched_leads_per_user`
   - JOIN vào main SELECT, thêm 3 column
   - Cast BigInt → Number trong mapping cuối
5. **Update DTO**: thêm `ordersCount`, `productsCount`, `untouchedLeads` (camelCase)
6. **Update shared type** trong `packages/types`
7. **Update hook FE** để thêm 3 field vào `EmployeeScoreRaw` (chỉ extend type, chưa render)
8. **Cache invalidation**: kiểm tra trong `audit-log.service` hoặc `orders.service` xem có `cacheService.invalidate('DASHBOARD')` khi tạo order không - nếu có thì OK, nếu không thì thêm

## Todo List

- [ ] Đọc `dashboard.service.ts:302-370` để hiểu raw SQL hiện có
- [ ] Đọc schema Prisma confirm columns `activities`, `order_items`, `orders.created_by`
- [ ] Test query mới trên DB local: `SELECT ... FROM users LEFT JOIN order_metrics ...`
- [ ] Update service: thêm CTE `order_metrics`, `untouched_leads`
- [ ] Update mapping function: cast BigInt
- [ ] Update DTO + shared type
- [ ] Update FE hook type (`EmployeeScoreRaw`)
- [ ] Build API + Web: `pnpm build`
- [ ] Test endpoint qua curl/Postman với from/to thật

## Success Criteria

- `GET /dashboard/employee-scores?from=...&to=...` trả thêm 3 field
- Tất cả field là number (không phải BigInt sau serialize)
- Untouched count đúng: lead đã có note > 0 thì KHÔNG đếm
- Query đo bằng `EXPLAIN ANALYZE` < 500ms với data 200 user, 10k lead, 50k activity
- Existing fields không bị break (regression test)
- Cache hit lần 2 < 50ms

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `activities` table chưa có index `(entity_type, entity_id)` | Verify schema, add index nếu thiếu trong migration phụ |
| `untouched_leads` query N+1 nếu dùng EXISTS không index | Dùng LEFT JOIN + COUNT FILTER + HAVING thay vì NOT EXISTS |
| Cache stale khi user tạo order/note mới | Invalidate `DASHBOARD` cache trong order/activity service |
| BigInt overflow nếu sản phẩm > 2^31 | Dùng `Number()` sau khi check < `Number.MAX_SAFE_INTEGER` |

## Security Considerations

- Endpoint đã có `@Roles('MANAGER', 'SUPER_ADMIN')` guard - giữ nguyên
- Không expose user ID kẻ khác qua join error
- SQL injection: dùng `Prisma.sql` tagged template, không string concat
- `deptId` filter phải validate UUID/BIGINT trước khi inject

## Next Steps

- Phase 02 dùng pattern raw SQL tương tự để tạo endpoint mới cho call/operations report
- Phase 04 sẽ tính computed field (`doanhSo/Lead`, `tỉLệChốt`) ở FE từ raw data này
