# Phase 02 - Backend: Call & Sales-breakdown endpoints

## Context Links

- Plan overview: [plan.md](./plan.md)
- Phase trước: [phase-01](./phase-01-backend-extend-employee-scores-api.md)
- Schema call: `packages/database/prisma/schema.prisma:705-727` (model `CallLog`)
- Seed labels: `packages/database/prisma/seed.ts:209-220`

## Overview

- **Priority:** P0
- **Status:** Complete
- **Effort:** 4h
- **Mô tả:** Tạo **2 endpoint** phục vụ tab **CUỘC GỌI** và **BÁN HÀNG** (dynamic columns) + 1 endpoint drill-down. **KHÔNG seed label nào** - label fully dynamic admin tạo qua UI Settings.

## Key Insights

- `CallLog.matchedUserId` đã có sẵn để aggregate per user. `callType` enum: `OUTGOING | INCOMING | MISSED`. `duration` = giây.
- "Cuộc gọi nghe máy" = `callType IN ('OUTGOING', 'INCOMING') AND duration > 0`
- "Cuộc gọi gọi ra" = `callType = 'OUTGOING'`
- **Labels fully dynamic** - KHÔNG seed migration. Mọi label đều do admin tạo qua UI Settings.
- **Top 7 sales-breakdown filter `deleted_at IS NULL`** trên cả `customers` và `labels` để phản ánh data hiện hành (không đếm customer/label đã soft-delete)

## Requirements

### Functional

#### Endpoint 1: `GET /dashboard/employee-reports/calls`

Query: `from, to, deptId?`

Response per user:
```ts
{
  userId: string,
  name: string,
  deptName: string,
  callsAnswered: number,     // OUTGOING+INCOMING, duration > 0
  callsOutgoing: number,     // OUTGOING total
  outgoingTotalSeconds: number,  // SUM(duration) WHERE OUTGOING
  outgoingAvgSeconds: number,    // AVG(duration) WHERE OUTGOING AND duration > 0
}
```

#### Endpoint 2: `GET /dashboard/employee-reports/sales-breakdown`

Query: `from, to, deptId?`

**Logic 2 bước:**
1. Sub-query 1: Lấy top 7 label theo count toàn DB (không filter time, filter soft-delete):
   ```sql
   SELECT l.id, l.name, l.color, l.text_color
   FROM labels l
   JOIN customer_labels cl ON cl.label_id = l.id
   JOIN customers c ON c.id = cl.customer_id
   WHERE l.is_active = true
     AND l.deleted_at IS NULL     -- exclude soft-deleted labels
     AND c.deleted_at IS NULL     -- exclude soft-deleted customers
   GROUP BY l.id, l.name, l.color, l.text_color
   ORDER BY COUNT(cl.customer_id) DESC
   LIMIT 7
   ```
2. Sub-query 2: Per user count customers theo top 7 label + "Khác" + "KH chưa tiếp cận":
   ```sql
   WITH top_labels AS (...above...),
   user_label_counts AS (
     SELECT
       c.assigned_user_id,
       cl.label_id,
       COUNT(DISTINCT c.id) AS cnt
     FROM customers c
     JOIN customer_labels cl ON cl.customer_id = c.id
     WHERE c.deleted_at IS NULL AND c.created_at BETWEEN $from AND $to
     GROUP BY c.assigned_user_id, cl.label_id
   ),
   untouched AS (
     SELECT
       l.assigned_user_id,
       COUNT(*) AS cnt
     FROM leads l
     WHERE l.deleted_at IS NULL
       AND l.last_assigned_at BETWEEN $from AND $to
       AND NOT EXISTS (
         SELECT 1 FROM call_logs cl
         WHERE cl.matched_entity_type='LEAD' AND cl.matched_entity_id = l.id
           AND cl.call_type='OUTGOING' AND cl.duration > 0
       )
     GROUP BY l.assigned_user_id
   )
   SELECT ... JOIN users + pivot label_id thành cột;
   ```

Response shape:
```ts
{
  topLabels: [
    { id: '1', name: 'VIP', color: '#8b5cf6', textColor: '#fff' },
    { id: '2', name: 'Hot Lead', color: '#ef4444', textColor: '#fff' },
    ... 7 labels total
  ],
  rows: [
    {
      userId: string,
      name: string,
      deptName: string,
      labelCounts: { [labelId: string]: number },  // map cho 7 top labels
      otherCount: number,           // tổng count các label ngoài top 7
      untouchedCount: number,       // KH chưa tiếp cận (lead no outgoing call)
    }
  ]
}
```

**Frontend dùng `topLabels` để render dynamic column headers + `rows[].labelCounts[labelId]` cho từng cell.**

#### Endpoint 3: `GET /dashboard/employee-reports/sales-breakdown/customers`

**Drill-down endpoint** khi user click cell trong tab Bán hàng.

Query: `userId, labelId?, untouched=true?, from, to`

Trả paginated list customer:
```ts
{
  data: [
    {
      id: string,
      name: string,
      phone: string,
      labels: { id, name, color }[],
      lastActivityAt: string | null,
      ordersCount: number,
      totalRevenue: number,
    }
  ],
  cursor: string | null,
  total: number
}
```

3 mode filter:
- `labelId=X` → KH thuộc label X của userId
- `untouched=true` → Lead userId chưa có outgoing call duration > 0
- `other=true` (cả `labelId` empty và `untouched` false) → KH thuộc label ngoài top 7

#### Labels seed

**KHÔNG seed migration label nào.** Lý do:
- Label fully dynamic - admin tự tạo qua Settings UI khi cần
- Tránh "ô nhiễm" DB prod với label test
- Code không phụ thuộc label cụ thể nào (trừ match by name `TVDN` cho metric tab Vận hành - graceful fallback 0 nếu chưa có)

**Đối với metric "KH chốt TVDN":**
- Nếu DB chưa có label `TVDN` → cột hiển thị toàn 0 (không lỗi)
- Khi nào cần track: admin vào `/dashboard/settings/labels` tạo label name = `TVDN` → cột tự có data
- KHÔNG cần config table riêng, KHÔNG cần admin pick label dropdown

### Non-functional

- Cả 3 endpoint dùng cache TTL.DASHBOARD
- Query < 800ms cho 200 user (sales-breakdown < 1s do pivot)
- Drill-down endpoint < 300ms (paginated 50/page)
- Index hỗ trợ:
  - `call_logs(matched_user_id, call_time, call_type)`
  - `call_logs(matched_entity_type, matched_entity_id)` (cho untouched query)
  - `customer_labels(label_id)` partial (top labels query)

## Architecture

```
DashboardController
 ├─ GET /employee-scores                              (Phase 01, đã extend)
 ├─ GET /employee-reports/calls                       (NEW)
 ├─ GET /employee-reports/sales-breakdown             (NEW - dynamic cols)
 └─ GET /employee-reports/sales-breakdown/customers   (NEW - drill-down)

DashboardService
 ├─ getEmployeeScores()                  (Phase 01)
 ├─ getEmployeeCallReport()              (NEW - raw SQL)
 ├─ getEmployeeSalesBreakdown()          (NEW - CTE top 7 + pivot count + untouched)
 └─ getEmployeeSalesBreakdownCustomers() (NEW - paginated list)
```

## Related Code Files

### Modify
- `apps/api/src/modules/dashboard/dashboard.service.ts` - thêm 3 method
- `apps/api/src/modules/dashboard/dashboard.controller.ts` - thêm 3 endpoint với role guard

### Không touch
- `packages/database/prisma/seed.ts` - giữ nguyên, KHÔNG thêm label
- KHÔNG tạo migration seed labels

### Read for context (MUST read before coding)
- `apps/api/src/modules/dashboard/dashboard.service.ts:109-210` (xem getTopPerformers + getLeadAging - pattern raw SQL)
- `apps/api/src/modules/call-logs/call-logs.service.ts` (hiểu matching flow để aggregate chuẩn)
- `packages/database/prisma/schema.prisma` search `model CallLog`, `model Activity`, `model Customer`, `model Label`, `model CustomerLabel`
- `packages/database/prisma/seed.ts:200-230` (label seed pattern hiện hành)
- `apps/api/src/modules/dashboard/dashboard.controller.ts` toàn file (xem auth decorator pattern)

### Create
- `apps/api/src/modules/dashboard/dto/employee-call-report.dto.ts` - response DTO
- `apps/api/src/modules/dashboard/dto/employee-sales-breakdown.dto.ts` - response DTO (topLabels + rows)
- `apps/api/src/modules/dashboard/dto/sales-breakdown-customers-query.dto.ts` - drill-down query DTO
- `apps/api/src/modules/dashboard/dto/sales-breakdown-customer-item.dto.ts` - drill-down item DTO
- `packages/database/prisma/migrations/{stamp}_add_call_logs_entity_index/migration.sql` - index `(matched_entity_type, matched_entity_id)` (chỉ cho performance, không seed data)
- `packages/types/src/dashboard/employee-call-report.ts` - shared interface
- `packages/types/src/dashboard/employee-sales-breakdown.ts` - shared interface với `TopLabel`, `SalesBreakdownRow`

## Implementation Steps

1. **Đọc** files context list ở trên - bắt buộc trước khi code
2. **Verify schema**: check `call_logs` có index `(matched_user_id, call_time)` chưa - nếu chưa add ở migration
3. **Tạo migration label**:
   - Generate timestamp: `npx prisma migrate dev --create-only --name seed_customer_classification_labels`
   - Edit SQL: `INSERT INTO labels (name, color, text_color, category, is_active) VALUES (...) ON CONFLICT (name) DO NOTHING;`
   - Apply: `pnpm db:migrate dev`
4. **Update `seed.ts`** thêm 6 label (dev environment fallback) - dùng `upsert` để idempotent
5. **Implement `getEmployeeCallReport()`**:
   - Raw SQL với CTE: `call_aggregates AS (SELECT matched_user_id, COUNT(*) FILTER (WHERE duration > 0) AS answered, COUNT(*) FILTER (WHERE call_type='OUTGOING') AS outgoing, ...)`
   - JOIN users với role=USER, status=ACTIVE
   - Filter `deptId` nếu có
   - Cache key: `dashboard:employee-calls:${from}:${to}:${deptId}`
6. **Implement `getEmployeeOperationsReport()`**:
   - Tương tự nhưng JOIN thêm `customer_labels`, `activities`, `orders + order_items`
   - `interactionsPerCustomer` = `activities count / DISTINCT customer count`
   - Cẩn thận `0/0` chia 0 - dùng `NULLIF(denominator, 0)`
7. **Tạo DTO + shared types**
8. **Update controller**: 2 route mới với `@Roles('MANAGER', 'SUPER_ADMIN')`
9. **Test với curl**:
   ```bash
   curl http://localhost:3010/api/v1/dashboard/employee-reports/calls?from=2026-04-01T00:00:00Z&to=2026-05-01T00:00:00Z \
     -H "Cookie: access_token=..."
   ```
10. **Cache invalidation**: invalidate `DASHBOARD` cache trong call-logs.service khi `match` thành công

## Todo List

- [ ] Đọc `dashboard.service.ts` toàn file
- [ ] Đọc `call-logs.service.ts` để hiểu matching
- [ ] Đọc schema CallLog, Customer, Label, CustomerLabel
- [ ] Tạo migration `add_call_logs_entity_index` (CHỈ index, KHÔNG seed data)
- [ ] Verify index `call_logs(matched_user_id, call_time)`
- [ ] Implement `getEmployeeCallReport` (service + cache + raw SQL)
- [ ] Implement `getEmployeeSalesBreakdown` (CTE top 7 + pivot + untouched)
- [ ] Implement `getEmployeeSalesBreakdownCustomers` (paginated drill-down)
- [ ] Tạo DTOs + shared types
- [ ] Thêm 3 controller route + role guard
- [ ] Cache invalidation hook trong `call-logs.service` + `customer-labels.service`
- [ ] Test 3 endpoint qua curl

## Success Criteria

- `GET /employee-reports/calls` trả đúng 4 number per user
- `GET /employee-reports/sales-breakdown` trả đúng `topLabels[7]` + rows với `labelCounts` map (top 7 dynamic theo data thực tế DB)
- `GET /employee-reports/sales-breakdown/customers` paginated 50/page, filter mode đúng (label/untouched/other)
- Migration `add_call_logs_entity_index` chạy `pnpm db:migrate deploy` không lỗi
- **KHÔNG seed label nào** trong PR này
- Endpoints < 800ms với 200 user, 100k call_logs (sales-breakdown < 1s do pivot)
- Drill-down < 300ms
- Role USER thường không access được (403)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `call_logs` chưa có matched_user_id cho records cũ | Filter `WHERE matched_user_id IS NOT NULL`, không count records unmatched |
| Migration label duplicate khi prod đã tạo manual | `ON CONFLICT (name) DO NOTHING` |
| `interactionsPerCustomer` chia 0 nếu user chưa có customer | `NULLIF(...)` + COALESCE(0) |
| TVDN definition chưa rõ | Tạm dùng label name "TVDN" - khi có spec thì cập nhật |
| Index thiếu làm query 5s+ | EXPLAIN ANALYZE trước, add index trong migration cùng PR |
| Top 7 label thay đổi giữa các kỳ → cell map miss | Endpoint trả `topLabels` cố định 1 lần per request, FE dùng list đó render col |
| Pivot SQL phức tạp khi label > 7 trong DB | Dùng `FILTER (WHERE label_id = $1)` per top label thay vì dynamic SQL |
| Drill-down customer count > 10k | Cursor-based pagination, default limit 50, max 200 |
| Sales-breakdown cache invalid khi user tag label mới | Invalidate cache trong `customer-labels.service` set/unset |

## Security Considerations

- `@Roles('MANAGER', 'SUPER_ADMIN')` cả 2 endpoint
- `deptId` param validate trước khi inject vào Prisma.sql
- Không leak `matchedUserId` của user khác qua nested query error
- Rate limit qua global guard hiện hành

## Next Steps

- Phase 03 build BarCellTable component dùng được cho cả 3 tab
- Phase 04 integrate 3 endpoint vào page
