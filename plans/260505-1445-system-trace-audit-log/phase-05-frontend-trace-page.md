# Phase 05 - Frontend `/trace` Page (Super Admin)

**Priority:** P1 | **Status:** Pending | **Est:** 4h | **Depends:** Phase 02 + 03

## Overview
Tạo trang `/trace` chỉ super_admin truy cập, gồm 3 tab: All (gộp + sort theo time), Audit Log (user actions), Cron Runs (cron history). Có filter chi tiết theo từng tab.

## Requirements
- Route: `/trace` (trong nhóm `(dashboard)`)
- Guard: redirect non-super_admin về `/dashboard` với toast lỗi
- 3 tabs: All / Audit Log / Cron Runs
- Filter chi tiết, URL-based state (shareable)
- Pagination cursor-based
- Date format DD/MM/YYYY HH:mm
- Vietnamese UI text
- Detail modal/sheet khi click row → xem metadata raw JSON
- Refresh button (không real-time)

## Architecture

### Route structure
```
apps/web/src/app/(dashboard)/trace/
├── page.tsx                         # Server Component shell + role check
├── layout.tsx                       # Header + sub-nav (optional)
└── _components/
    ├── trace-tabs.tsx               # Client tabs
    ├── trace-filters.tsx            # Shared filter sheet
    ├── audit-log-table.tsx          # Audit log table
    ├── audit-log-row-detail.tsx     # Sheet detail
    ├── cron-run-table.tsx
    ├── cron-run-row-detail.tsx
    ├── all-events-feed.tsx          # Mixed feed
    └── action-badge.tsx             # Color-coded action badges
```

### URL state (shareable filters)
```
/trace?tab=audit&userId=12&action=LEAD_TRANSFER&from=2026-05-01&to=2026-05-05&statusCode=4xx
```
- Parse via `useSearchParams`
- Update via `router.replace` (không scroll lên đầu)

### API calls
- `GET /api/v1/audit-logs?...` (Phase 02)
- `GET /api/v1/audit-logs/:id`
- `GET /api/v1/cron-runs?...` (Phase 03)
- `GET /api/v1/cron-runs/:id`

### Tab "All" - gộp như nào?
- Frontend gọi 2 API parallel với cùng time-range
- Merge + sort desc theo `createdAt` / `startedAt` ở client
- Limit 50 mỗi nguồn → max 100 rows hiển thị
- Mỗi item có badge phân loại: `[AUDIT]` xanh / `[CRON]` cam / `[ACTIVITY]` tím

### Filter chi tiết (theo tab)

**Audit Log:**
- User (autocomplete users API)
- Department (dropdown departments API)
- Action (dropdown - fetch distinct từ API)
- Entity Type (LEAD / CUSTOMER / ORDER / PAYMENT / USER / TASK)
- Entity ID (number input)
- Method (POST/PUT/PATCH/DELETE checkbox group)
- Status code (preset: All / 2xx / 3xx / 4xx / 5xx)
- IP address (text)
- From / To (date-range picker)

**Cron Runs:**
- Job name (dropdown - fetch distinct)
- Status (RUNNING / SUCCESS / FAILED checkbox)
- From / To
- Min duration (input seconds - optional)

**All:** chỉ time-range + free-text search (sau)

## Related Code Files

### Read first
- `apps/web/src/app/(dashboard)/layout.tsx` - dashboard layout pattern
- `apps/web/src/app/(dashboard)/users/page.tsx` - page với role check pattern
- `apps/web/src/app/(dashboard)/leads/page.tsx` - table + filter pattern
- `apps/web/src/lib/api-client.ts` - API client (token refresh)
- `apps/web/src/components/leads/lead-list-table.tsx` (or similar) - table component reference
- `apps/web/src/components/ui/sheet.tsx` - shadcn sheet for detail modal

### Modify
- `apps/web/src/components/layout/sidebar.tsx` (or nav file) - thêm link `/trace` (chỉ hiển thị cho super_admin)

### Create
- `apps/web/src/app/(dashboard)/trace/page.tsx`
- `apps/web/src/app/(dashboard)/trace/_components/trace-tabs.tsx`
- `apps/web/src/app/(dashboard)/trace/_components/trace-filters.tsx`
- `apps/web/src/app/(dashboard)/trace/_components/audit-log-table.tsx`
- `apps/web/src/app/(dashboard)/trace/_components/audit-log-row-detail.tsx`
- `apps/web/src/app/(dashboard)/trace/_components/cron-run-table.tsx`
- `apps/web/src/app/(dashboard)/trace/_components/cron-run-row-detail.tsx`
- `apps/web/src/app/(dashboard)/trace/_components/all-events-feed.tsx`
- `apps/web/src/app/(dashboard)/trace/_components/action-badge.tsx`
- `apps/web/src/lib/api/trace.ts` - typed API wrappers

### Types
- `packages/types/src/trace.ts` - DTOs khớp backend
  - `AuditLogResponse`, `CronRunResponse`, query DTOs

## Implementation Steps

### Step 1 - Types in @crm/types
```ts
// packages/types/src/trace.ts
export interface AuditLogResponse {
  id: string;
  userId: string | null;
  user: { id: string; name: string; departmentName: string | null } | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  method: string | null;
  path: string | null;
  statusCode: number | null;
  metadata: unknown;
  createdAt: string;
}

export interface CronRunResponse {
  id: string;
  jobName: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'RUNNING' | 'SUCCESS' | 'FAILED';
  affected: number;
  errorMsg: string | null;
  metadata: unknown;
  durationMs: number | null;
}
```

### Step 2 - Page shell với role check (Server Component)
```tsx
// app/(dashboard)/trace/page.tsx
export default async function TracePage() {
  const session = await getSession(); // server-side
  if (session?.user?.role !== 'SUPER_ADMIN') redirect('/dashboard');
  return <TraceTabs />;
}
```

### Step 3 - Trace tabs (Client)
- shadcn Tabs với 3 options
- Tab state sync với URL `?tab=`
- Mount table component theo tab

### Step 4 - Filter sheet
- shadcn Sheet hoặc inline filter bar
- Form state: zod + react-hook-form
- Apply → update searchParams qua router
- Clear button → reset

### Step 5 - Tables
- Use `@tanstack/react-table` (kiểm tra đã có chưa, nếu chưa thì dùng plain table)
- Audit log columns: Time | User | Action | Method/Path | Status | IP | Detail btn
- Cron run columns: Job | Started | Duration | Status | Affected | Error | Detail btn
- Color coding:
  - Audit method: POST=blue, PUT/PATCH=amber, DELETE=red
  - Status code: 2xx=green, 4xx=amber, 5xx=red
  - Cron status: SUCCESS=green, FAILED=red, RUNNING=blue (pulse)

### Step 6 - Detail sheet
- Click row → open right-side sheet
- Hiển thị tất cả field + metadata pretty-printed JSON (use `<pre>` với syntax highlight cơ bản)
- Copy ID button

### Step 7 - Pagination
- "Load more" button thay vì page numbers (cursor-based)
- Disable khi không có nextCursor

### Step 8 - Sidebar link
- Thêm icon + label "Trace" trong sidebar
- Chỉ render khi `user.role === 'SUPER_ADMIN'`
- Active state khi pathname === `/trace`

### Step 9 - Manual test
1. Login as super_admin → vào `/trace` → 3 tab hiển thị
2. Login as manager/user → truy cập `/trace` → redirect về `/dashboard`
3. Apply filter user + time-range → kết quả đúng
4. Click row → sheet detail mở với metadata
5. Refresh button → re-fetch
6. Copy URL với filter → mở tab mới → filter giữ nguyên

## Todo List
- [ ] Đọc 6 files ở "Read first"
- [ ] Tạo types trong `@crm/types`
- [ ] Tạo `lib/api/trace.ts` với 4 functions
- [ ] Tạo page shell với role check
- [ ] Tạo TraceTabs component
- [ ] Tạo TraceFilters component (form + URL sync)
- [ ] Tạo AuditLogTable + RowDetail
- [ ] Tạo CronRunTable + RowDetail
- [ ] Tạo AllEventsFeed (merge logic)
- [ ] Tạo ActionBadge với color mapping
- [ ] Update sidebar nav (super_admin only)
- [ ] `pnpm build --filter=web` không lỗi
- [ ] Test 6 scenarios manual

## Success Criteria
- Super admin vào `/trace` thấy 3 tabs hoạt động
- Non-super-admin bị redirect
- Filter hoạt động đúng theo URL
- Detail sheet hiển thị metadata đẹp
- Copy URL → share filter context
- Mobile responsive (table → card view ở < md breakpoint)

## Risk Assessment
- **R1:** Bảng nhiều cột → tràn mobile → mitigation: hide column non-essential ở mobile, dùng card view
- **R2:** Metadata JSON lớn → render chậm → mitigation: collapse default, expand on click
- **R3:** Filter UI phức tạp → user confused → mitigation: filter chip preview + clear all button

## Security Considerations
- Role check **2 nơi**: server-side redirect (page.tsx) + sidebar conditional render
- Backend đã có guard (Phase 02 + 03), frontend chỉ là UX
- Không lưu sensitive data vào localStorage / sessionStorage

## Next Steps
- Phase 06: tests + retention cron
- Future: thêm "saved views" feature (bookmark filter combos)
