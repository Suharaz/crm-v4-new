---
phase: 11
title: "Frontend Analytics Dashboard"
status: pending
priority: P1
effort: 10h
depends_on: [8, 9, 10]
---

# Phase 11: Frontend Analytics Dashboard

## Context Links

- Analytics requirements: `plans/reports/brainstorm-260325-1224-internal-crm-system-design.md` (line 291-301)
- Charts: Recharts (synthesis line 23)
- Materialized views: synthesis (line 237)

## Overview

Build analytics dashboard with KPI cards, conversion funnel, sales performance ranking, source effectiveness, revenue tracking. Backend aggregation endpoints + frontend chart components using Recharts. CSV export for all reports.

## Requirements

### Functional
- KPI cards: total leads, conversion rate, revenue, active leads, average deal time, **leads thả nổi** (FLOATING count + trend)
- **FLOATING leads:** tính riêng metric, KHÔNG tính vào funnel conversion rate (đã exit funnel). Tính vào "Recycled leads" nếu claim lại → ASSIGNED
- Conversion funnel: pool → assigned → in_progress → converted/lost (visualized)
- Sales ranking: table of sales reps sorted by conversion rate / revenue / leads handled
- Source effectiveness: bar chart showing leads + conversion rate per source
- Revenue tracking: line chart over time (daily/weekly/monthly), by product/department
- Period filter: date range picker (preset: today, 7d, 30d, 90d, custom)
- Department filter: view by department or all (super_admin)
- Export: download current dashboard data as CSV

### Non-Functional
- Dashboard loads in <3s for 30-day aggregation
- Streaming SSR with Suspense for each dashboard section
- Cache dashboard data (revalidate every 5 minutes)
- Server-side aggregation via dedicated analytics endpoints
- All chart components loaded via next/dynamic with ssr: false to reduce initial bundle
- Each dashboard section streams independently via parallel async Server Components

## Architecture

### Backend Analytics Endpoints
```
apps/api/src/modules/analytics/
├── analytics.module.ts
├── analytics.controller.ts
├── analytics.service.ts
└── dto/
    ├── analytics-query.dto.ts     # dateFrom, dateTo, departmentId
    └── dashboard-response.dto.ts
```

**Endpoints:**
- `GET /analytics/kpi` — summary KPI cards
- `GET /analytics/funnel` — conversion funnel data
- `GET /analytics/ranking` — sales performance ranking
- `GET /analytics/sources` — source effectiveness
- `GET /analytics/revenue` — revenue over time
- `GET /analytics/export` — CSV export of dashboard data

### Frontend Structure
```
apps/web/src/app/(dashboard)/
├── page.tsx                        # Dashboard home (Server Component)

apps/web/src/components/dashboard/
├── kpi-cards.tsx                   # KPI card grid
├── conversion-funnel.tsx           # Funnel chart (Recharts)
├── sales-ranking-table.tsx         # Performance table
├── source-chart.tsx                # Bar chart by source
├── revenue-chart.tsx               # Line chart over time
├── period-filter.tsx               # Date range picker
├── department-filter.tsx           # Department select
└── export-button.tsx               # CSV export trigger
```

### Streaming Architecture
Each dashboard widget is an independent async Server Component:
- KpiCards, ConversionFunnel, SalesRankingTable, SourceChart, RevenueChart
- Each fetches its own data independently → parallel streaming
- Each wrapped in own Suspense boundary in page.tsx
- Client-only parts (charts) use dynamic import inside Server Component

page.tsx pattern:
```tsx
  <DateRangeFilter />                              {/* Client Component */}
  <Suspense fallback={<KpiSkeleton />}>
    <KpiCards dateRange={range} />                 {/* async Server Component */}
  </Suspense>
  <Suspense fallback={<FunnelSkeleton />}>
    <ConversionFunnel dateRange={range} />         {/* async Server Component */}
  </Suspense>
  <Suspense fallback={<RankingSkeleton />}>
    <SalesRankingTable dateRange={range} />        {/* async Server Component */}
  </Suspense>
  <div className="grid grid-cols-2 gap-4">
    <Suspense fallback={<ChartSkeleton />}>
      <SourceChart dateRange={range} />            {/* async Server Component */}
    </Suspense>
    <Suspense fallback={<ChartSkeleton />}>
      <RevenueChart dateRange={range} />           {/* async Server Component */}
    </Suspense>
  </div>
```

### KPI Aggregation Queries (NestJS service)
```sql
-- Conversion rate
SELECT COUNT(*) FILTER (WHERE status = 'CONVERTED') * 100.0 / NULLIF(COUNT(*), 0)
FROM leads WHERE created_at BETWEEN $1 AND $2;

-- Revenue
SELECT SUM(p.amount) FROM payments p
JOIN orders o ON p.order_id = o.id
WHERE p.status = 'VERIFIED' AND p.verified_at BETWEEN $1 AND $2;

-- Funnel
SELECT status, COUNT(*) FROM leads
WHERE created_at BETWEEN $1 AND $2 GROUP BY status;
```

## Related Code Files

### Create
- `apps/api/src/modules/analytics/` — all analytics backend files
- `apps/web/src/components/dashboard/` — all dashboard components
- Modify `apps/web/src/app/(dashboard)/page.tsx` — dashboard page

### Modify
- `apps/api/src/app.module.ts` — register analytics module

## Implementation Steps

1. **Implement Analytics backend module**
   - `analytics.service.ts`: raw Prisma queries for aggregations (use `$queryRaw` for complex SQL)
   - KPI: count leads, conversion rate, total revenue, avg deal time
   - Funnel: group by status with counts
   - Ranking: group by assigned_user with conversion rate + revenue + lead count, ordered
   - Sources: group by source with lead count + conversion rate
   - Revenue: group by time period (day/week/month) with SUM
   - All queries filtered by dateFrom, dateTo, departmentId (optional)
   - Export: reuse queries, format as CSV

2. **Consider materialized views for performance**
   - If queries >3s: create materialized view `mv_daily_lead_stats`
   - Refresh via cron (BullMQ scheduled job) every 5 minutes
   - Start with raw queries, add materialized views only if needed (YAGNI)

3. **Set up dynamic imports for chart components**
   - All Recharts components MUST use next/dynamic with ssr: false
   - Example pattern:
     // components/dashboard/revenue-chart.tsx
     import dynamic from 'next/dynamic'
     const LineChart = dynamic(
       () => import('recharts').then(m => m.LineChart),
       { ssr: false, loading: () => <ChartSkeleton /> }
     )
   - Or better: dynamic import the entire chart component:
     // In page.tsx
     const RevenueChart = dynamic(() => import('@/components/dashboard/revenue-chart'), {
       loading: () => <ChartSkeleton />,
       ssr: false
     })

4. **Build period filter component**
   - Preset buttons: Today, 7 days, 30 days, 90 days
   - Custom date range picker (shadcn DateRangePicker or react-day-picker)
   - Sync to URL params

5. **Build KPI cards**
   - Grid of 4-5 cards, each showing: label, value, trend indicator (vs previous period)
   - Cards: Total Leads, Conversion Rate (%), Total Revenue, Active Leads, Avg Deal Days
   - Use Suspense boundary per card (stream independently)

6. **Build conversion funnel**
   - Recharts FunnelChart or custom horizontal bar chart
   - Stages: Pool → Assigned → In Progress → Converted (show drop-off %)
   - Color-coded stages

7. **Build sales ranking table**
   - Sortable columns: name, leads handled, conversion rate, revenue, avg response time
   - Highlight top 3 performers
   - Filter by department

8. **Build source effectiveness chart**
   - Recharts BarChart: X=source name, Y=lead count, secondary Y=conversion rate
   - Tooltip with details

9. **Build revenue chart**
   - Recharts LineChart: X=date, Y=revenue
   - Granularity toggle: daily/weekly/monthly
   - Optional: area chart with gradient fill

10. **Build export functionality**
    - Export button calls `/analytics/export` with current filters
    - Returns CSV file download
    - Include all dashboard data in single CSV (multiple sections)
    - **SECURITY:** Apply csv-sanitizer utility from `packages/utils` to ALL exported CSV cell values (prevent formula injection)

11. **Wire dashboard page with streaming SSR**
    - Dashboard page.tsx is a Server Component
    - Each widget component (KpiCards, Funnel, etc.) is an async Server Component
    - Each widget fetches its own data via api.get() — they run in PARALLEL automatically
    - Wrap each widget in Suspense with dedicated skeleton
    - DateRangeFilter and DepartmentFilter are Client Components that update URL params
    - On filter change: URL updates → page re-renders → all widgets re-fetch with new params
    - DO NOT fetch all data in page.tsx and pass down — let each widget fetch independently

## Todo List

- [ ] Create analytics backend module
- [ ] Implement KPI aggregation queries
- [ ] Implement funnel query
- [ ] Implement ranking query
- [ ] Implement source effectiveness query
- [ ] Implement revenue time-series query
- [ ] Implement CSV export endpoint
- [ ] Build period filter component
- [ ] Build department filter
- [ ] Build KPI cards with trend indicators
- [ ] Build conversion funnel chart
- [ ] Build sales ranking table
- [ ] Build source effectiveness bar chart
- [ ] Build revenue line chart
- [ ] Build export button
- [ ] Wire dashboard page with Suspense streaming
- [ ] Test with realistic data volume
- [ ] Optimize slow queries if needed

## Success Criteria

- Dashboard loads <3s with 30-day data
- KPI cards show accurate aggregated numbers
- Funnel shows correct progression with drop-off %
- Ranking reflects actual sales performance
- Source chart shows lead volume + conversion per source
- Revenue chart accurate with correct time granularity
- Filters (period, department) update all sections
- CSV export matches displayed data
- Each section loads independently (Suspense streaming)

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Slow aggregation queries | High | Start simple, add indexes/materialized views if >3s |
| Recharts bundle size (~45KB) | Medium | Dynamic import ALL chart components with ssr:false. Each chart loads only when its Suspense boundary resolves. |
| Data accuracy (conversion calc) | High | Unit test aggregation queries with known test data |
| Time zone issues | Medium | Store UTC, display in user's timezone |
