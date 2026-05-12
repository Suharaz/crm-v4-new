# Employees Dashboard Redesign - Plan Overview

**Date:** 2026-05-11
**Slug:** employees-dashboard-redesign
**Owner:** Suhara
**Target page:** `/dashboard/employees` (https://crm.taki.vn/dashboard/employees)

## Mục tiêu

Redesign trang nhân viên từ **scorecard grid 2-col** sang **table 3 tab** với bar-in-cell visualization:

1. **BÁO CÁO TỔNG** - 10 cột metric (lead, đơn, doanh số, gọi, tỉ lệ chốt)
2. **BÁO CÁO CUỘC GỌI** - 3 cột (nghe máy/gọi ra, thời gian gọi ra, TB)
3. **BÁN HÀNG** - **Dynamic columns** mỗi label = 1 cột, top 7 theo count toàn DB + cột "Khác" + cột "KH chưa tiếp cận". Click ô mở side-panel list KH

## Quyết định scope đã chốt

| Hạng mục | Quyết định |
|---|---|
| "Lead chưa tác nghiệp" (tab Tổng) | Lead chưa có activity (note/call/order) - JOIN bảng `activities` |
| "KH chưa tiếp cận" (tab Bán hàng) | Lead chưa có call ra duration > 0 - JOIN bảng `call_logs` |
| **Labels** | **FULLY DYNAMIC** - admin tạo qua Settings UI. KHÔNG seed cứng label nào. Code KHÔNG hard-code list label. |
| Tab "Bán hàng" | Dynamic columns: top 7 label theo count thực tế trong DB + cột "Khác" + cột "KH chưa tiếp cận" |
| Drill-down | Click ô cell mở side-panel list KH, giữ range với tab đang xem |
| User scope | Giữ rule cũ: `role=USER` + `status=ACTIVE` |
| Top 7 query filter soft-delete | Filter `customers.deleted_at IS NULL` AND `labels.deleted_at IS NULL` - chỉ đếm data hiện hành |

## Phases

| # | Phase | Effort | Status | Dependencies |
|---|---|---|---|---|
| 01 | [Backend - Mở rộng employee-scores API](./phase-01-backend-extend-employee-scores-api.md) | 4h | Complete | - |
| 02 | [Backend - Call/Sales-breakdown endpoints](./phase-02-backend-call-operations-endpoints-labels-seed.md) | 4h | Complete | 01 |
| 03 | [Frontend - Shared BarCellTable component](./phase-03-frontend-shared-bar-cell-table-component.md) | 3h | Complete | - (parallel với 01-02) |
| 04 | [Frontend - Page redesign 3 tabs + Sales dynamic columns + drill-down](./phase-04-frontend-page-redesign-4-tabs-sales-chips.md) | 6h | Complete | 01, 02, 03 |
| 05 | [Tests + verification](./phase-05-tests-and-verification.md) | 2h | Complete | 04 |

**Total estimate:** ~19h (giảm 7h sau khi bỏ tab Vận hành)

## Key technical insights

- **Backend gộp 1 endpoint mở rộng + 2 endpoint mới** thay vì sửa to 1 endpoint: dễ cache, tách concern.
- **BarCellTable là shared component** - sẽ tái dùng cho 3 tab báo cáo (4 tab thứ tư dùng lại bảng tổng + filter).
- **Bar width** tính relative theo `max(column)` không tuyệt đối - thanh dài nhất luôn = 100%.
- **Sticky header + first column** để horizontal scroll trên mobile.
- **Tabs URL-state**: `?tab=summary|calls|operations|sales&filter=hot|closed|...` cho shareable view.

## Files chính sẽ sửa/tạo

### Backend
- `apps/api/src/modules/dashboard/dashboard.service.ts` (extend `getEmployeeScores`)
- `apps/api/src/modules/dashboard/dashboard.controller.ts` (3 endpoint mới)
- `apps/api/src/modules/dashboard/dto/employee-call-report.dto.ts` (new)
- `apps/api/src/modules/dashboard/dto/employee-operations-report.dto.ts` (new)
- `packages/database/prisma/seed.ts` (thêm 2-3 label)
- `packages/database/prisma/migrations/{stamp}_seed_customer_classification_labels/` (idempotent SQL)

### Frontend
- `apps/web/src/app/(dashboard)/dashboard/employees/page.tsx` (rewrite)
- `apps/web/src/components/dashboard/widgets/bar-cell-table.tsx` (new shared)
- `apps/web/src/components/dashboard/widgets/employee-summary-table.tsx` (new)
- `apps/web/src/components/dashboard/widgets/employee-call-table.tsx` (new)
- `apps/web/src/components/dashboard/widgets/employee-sales-table.tsx` (new - dynamic columns)
- `apps/web/src/components/dashboard/widgets/customer-drill-down-panel.tsx` (new - side panel)
- `apps/web/src/components/dashboard/hooks/use-employee-scores.ts` (extend)
- `apps/web/src/components/dashboard/hooks/use-employee-call-report.ts` (new)
- `apps/web/src/components/dashboard/hooks/use-employee-sales-breakdown.ts` (new - dynamic columns + drill-down data)

### Types
- `packages/types/src/dashboard/employee-reports.ts` (new shared types)

## Success criteria

1. 4 tab hiển thị đúng metric, bar-in-cell trực quan như mẫu ảnh
2. Filter range (week/month/quarter) + dept + sales chip hoạt động
3. Mobile responsive (horizontal scroll, sticky cột tên)
4. API response < 800ms cho 200 user (đã cache)
5. Role guard: chỉ MANAGER/SUPER_ADMIN xem được
6. Không em dash, không AI references
7. Tests pass: API contract + frontend smoke

## Risks

| Risk | Mitigation |
|---|---|
| SQL aggregate chậm khi nhiều user | Index `call_logs(matched_user_id, call_time)`, gộp CTE trong 1 query |
| Bar width tính sai khi max=0 | Guard `max === 0 ? 0 : value / max * 100` |
| BigInt JSON serialize lỗi | Đã có interceptor `BigIntSerializerInterceptor` - test kỹ field mới |
| Label "Data nóng" tag vào customer cũ | Skip - chỉ tag mới từ giờ, không backfill |
| Tab Bán hàng filter làm table re-fetch nhiều | Filter client-side trên data đã load (không re-call API) |

## Out of scope

- Export Excel/CSV của bảng (giữ feature export hiện tại nếu có)
- Drill-down click vào row mở chi tiết user (làm phase sau)
- So sánh nhân viên giữa các kỳ (tuần này vs tuần trước)
- Mobile native view - chỉ responsive web
