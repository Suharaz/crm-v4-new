'use client';

import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Area, AreaChart,
} from 'recharts';
import { ChartCard } from '../widgets/chart-card';
import { ChartTooltip } from '../widgets/chart-tooltip';
import { COLORS, fmtVND, fmtShort } from '../constants';
import type { RevenueTabData } from '../hooks/use-tab-data';

interface TabRevenueProps {
  data: RevenueTabData | null;
  loading: boolean;
  isAdmin: boolean;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-[300px] animate-pulse rounded-xl bg-slate-100" />
      <div className="h-[200px] animate-pulse rounded-xl bg-slate-100" />
    </div>
  );
}

export function TabRevenue({ data, loading, isAdmin }: TabRevenueProps) {
  if (loading || !data) return <LoadingSkeleton />;

  const maxDeptRev = isAdmin && data.depts.length > 0
    ? Math.max(...data.depts.map(x => x.revenue), 1)
    : 1;

  return (
    <div className="space-y-4">
      {/* Full-size Revenue Trend */}
      <ChartCard title="Chi tiết doanh thu theo ngày">
        {data.revenueTrend.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-400">Chưa có dữ liệu doanh thu trong kỳ</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.revenueTrend}>
              <defs>
                <linearGradient id="revDetailGrad" x1="0" y1="0" x2="0" y2="1">
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
                fill="url(#revDetailGrad)" name="Doanh thu" dot={false}
                activeDot={{ r: 5, strokeWidth: 2, fill: '#fff' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Admin: Department Revenue Comparison */}
      {isAdmin && data.depts.length > 0 && (
        <ChartCard title="Doanh số theo phòng ban">
          <div className="space-y-3">
            {data.depts.map(d => {
              const barW = Math.max(d.revenue / maxDeptRev * 100, 4);
              return (
                <div key={d.deptId} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-700">{d.name}</span>
                    <div className="flex gap-3 text-xs text-slate-500">
                      <span>{d.leads} leads</span>
                      <span className="text-emerald-600">{d.converted} convert</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${barW}%`, background: `linear-gradient(to right, ${COLORS.primary}, ${COLORS.teal})` }}
                      />
                    </div>
                    <span className="text-sm font-bold text-teal-600 tabular-nums w-28 text-right">{fmtVND(d.revenue)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </ChartCard>
      )}
    </div>
  );
}
