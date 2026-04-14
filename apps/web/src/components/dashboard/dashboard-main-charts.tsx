'use client';

import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Area, AreaChart,
} from 'recharts';
import { ChartCard } from './widgets/chart-card';
import { ChartTooltip } from './widgets/chart-tooltip';
import {
  type FunnelItem, type RevenueDayItem,
  COLORS, FUNNEL_COLORS, FUNNEL_LABELS, fmtVND, fmtNum, fmtShort,
} from './constants';

interface DashboardMainChartsProps {
  revenue: RevenueDayItem[];
  funnel: FunnelItem[];
  loading: boolean;
}

export function DashboardMainCharts({ revenue, funnel, loading }: DashboardMainChartsProps) {
  const activeFunnel = funnel.filter(f => f.count > 0);
  const totalFunnel = activeFunnel.reduce((s, f) => s + f.count, 0);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Revenue Area Chart */}
      <ChartCard title="Doanh thu theo ngày">
        {revenue.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            {loading ? 'Đang tải...' : 'Chưa có dữ liệu trong kỳ'}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={revenue}>
              <defs>
                <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={fmtShort} />
              <Tooltip content={<ChartTooltip valueFormatter={fmtVND} />} />
              <Area
                type="monotone" dataKey="revenue" stroke={COLORS.primary} strokeWidth={2.5}
                fill="url(#revenueGrad)" name="Doanh thu" dot={false}
                activeDot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Lead Funnel Donut */}
      <ChartCard title="Phân bổ leads theo trạng thái">
        {activeFunnel.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">
            {loading ? 'Đang tải...' : 'Chưa có dữ liệu'}
          </p>
        ) : (
          <div className="flex items-center gap-6">
            <div className="relative shrink-0">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={activeFunnel} dataKey="count" nameKey="status"
                    cx="50%" cy="50%" outerRadius={72} innerRadius={45}
                    paddingAngle={2} strokeWidth={0}
                  >
                    {activeFunnel.map(f => (
                      <Cell key={f.status} fill={FUNNEL_COLORS[f.status] || '#9ca3af'} />
                    ))}
                  </Pie>
                  <Tooltip content={
                    <ChartTooltip valueFormatter={(v: number) =>
                      `${fmtNum(v)} (${totalFunnel ? Math.round(v / totalFunnel * 100) : 0}%)`
                    } />
                  } />
                </PieChart>
              </ResponsiveContainer>
              {/* Center total */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-slate-900">{fmtNum(totalFunnel)}</span>
                <span className="text-[10px] text-slate-400">Tổng leads</span>
              </div>
            </div>
            {/* Legend */}
            <div className="flex-1 space-y-2">
              {activeFunnel.map(f => {
                const pct = totalFunnel ? Math.round(f.count / totalFunnel * 100) : 0;
                return (
                  <div key={f.status} className="flex items-center gap-2.5 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: FUNNEL_COLORS[f.status] }} />
                    <span className="flex-1 text-slate-600">{FUNNEL_LABELS[f.status] || f.status}</span>
                    <span className="font-semibold text-slate-900 tabular-nums">{fmtNum(f.count)}</span>
                    <span className="text-xs text-slate-400 w-8 text-right tabular-nums">{pct}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
