'use client';

import { KpiCard } from './widgets/kpi-card';
import { type DashboardStatsData, COLORS, fmtVND, fmtNum } from './constants';

interface DashboardKpiSectionProps {
  stats: DashboardStatsData | null;
  prevStats: DashboardStatsData | null;
  loading: boolean;
}

export function DashboardKpiSection({ stats, prevStats, loading }: DashboardKpiSectionProps) {
  if (loading) {
    return (
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="min-w-[70vw] shrink-0 snap-center sm:min-w-0 sm:shrink h-[100px] animate-pulse rounded-xl bg-slate-100" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: 'Leads mới', value: fmtNum(stats?.newLeads), subtitle: 'Trong kỳ',
      accentColor: COLORS.primary, bgColor: COLORS.primaryLight,
      currentValue: stats?.newLeads, previousValue: prevStats?.newLeads,
    },
    {
      title: 'Chuyển đổi', value: fmtNum(stats?.converted), subtitle: 'Trong kỳ',
      accentColor: COLORS.success, bgColor: COLORS.successLight,
      currentValue: stats?.converted, previousValue: prevStats?.converted,
    },
    {
      title: 'Doanh thu', value: stats ? fmtVND(stats.revenue) : '--', subtitle: 'Đã xác nhận',
      accentColor: COLORS.purple, bgColor: COLORS.purpleLight,
      currentValue: stats?.revenue, previousValue: prevStats?.revenue,
    },
    {
      title: 'Quá hạn', value: fmtNum(stats?.overdueTask), subtitle: 'Cần xử lý ngay',
      accentColor: stats?.overdueTask ? COLORS.danger : '#94a3b8', bgColor: COLORS.dangerLight,
      currentValue: stats?.overdueTask, previousValue: prevStats?.overdueTask,
    },
  ];

  return (
    <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible sm:pb-0 scrollbar-none">
      {cards.map(card => (
        <div key={card.title} className="min-w-[70vw] shrink-0 snap-center sm:min-w-0 sm:shrink">
          <KpiCard {...card} />
        </div>
      ))}
    </div>
  );
}
