'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import {
  XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Area, AreaChart,
  Legend,
} from 'recharts';
/** Dashboard stats shape returned by /dashboard/stats — typed explicitly to avoid index-signature unknown. */
interface DashboardStatsData {
  newLeads?: number | null;
  inProgress?: number | null;
  converted?: number | null;
  revenue: number;
  newCustomers?: number | null;
  totalOrders?: number | null;
  pendingPayments?: number | null;
  overdueTask?: number | null;
}

// ── Chart data shapes ─────────────────────────────────────────────────────
interface FunnelItem { status: string; count: number }
interface RevenueDayItem { day: string; revenue: number }
interface AgingItem { bucket: string; count: number }
interface PerformerItem { userId: string; name: string; converted: number; revenue: number }
interface SourceItem { source: string; total: number; converted: number; rate: number }
interface ConvTrendItem { day: string; newLeads: number; converted: number }
interface DeptItem { deptId: string; name: string; leads: number; converted: number; revenue: number }
interface TeamItem { teamId: string; name: string; dept: string; members: number; leads: number; converted: number; revenue: number }

// ── Time range presets ────────────────────────────────────────────────────
type RangeKey = 'today' | 'week' | 'month' | 'quarter' | 'year';

const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Hôm nay', week: 'Tuần này', month: 'Tháng này', quarter: 'Quý này', year: 'Năm nay',
};

function getDateRange(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const fmt = (dt: Date) => dt.toISOString().split('T')[0];
  const to = fmt(now);
  switch (key) {
    case 'today': return { from: to, to };
    case 'week': { const start = new Date(y, m, d - now.getDay() + 1); return { from: fmt(start), to }; }
    case 'month': return { from: fmt(new Date(y, m, 1)), to };
    case 'quarter': { const qm = Math.floor(m / 3) * 3; return { from: fmt(new Date(y, qm, 1)), to }; }
    case 'year': return { from: fmt(new Date(y, 0, 1)), to };
  }
}

// ── Design tokens from design-guidelines.md ───────────────────────────────
const COLORS = {
  primary: '#0ea5e9', primaryLight: '#e0e7ff',
  success: '#10b981', successLight: '#d1fae5',
  warning: '#f59e0b', warningLight: '#fef3c7',
  danger: '#ef4444', dangerLight: '#fee2e2',
  purple: '#8b5cf6', purpleLight: '#ede9fe',
  indigo: '#6366f1', indigoLight: '#e0e7ff',
  teal: '#14b8a6', tealLight: '#ccfbf1',
  orange: '#f97316',
  violet: '#06b6d4',
};

const FUNNEL_COLORS: Record<string, string> = {
  POOL: COLORS.primary, ZOOM: COLORS.orange, ASSIGNED: COLORS.teal, IN_PROGRESS: COLORS.warning,
  CONVERTED: COLORS.success, LOST: COLORS.danger, FLOATING: COLORS.purple,
};
const FUNNEL_LABELS: Record<string, string> = {
  POOL: 'Kho', ZOOM: 'Zoom', ASSIGNED: 'Đã gán', IN_PROGRESS: 'Đang xử lý',
  CONVERTED: 'Chuyển đổi', LOST: 'Mất', FLOATING: 'Thả nổi',
};

// ── Format helpers ────────────────────────────────────────────────────────
function fmtVND(v: number) { return new Intl.NumberFormat('vi-VN').format(v) + ' ₫'; }
function fmtNum(v: number | null | undefined) { return v != null ? new Intl.NumberFormat('vi-VN').format(v) : '--'; }
function fmtShort(v: number) { return v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v); }

// ── Custom Tooltip ────────────────────────────────────────────────────────
interface ChartTooltipPayloadItem { name: string; value: number; color: string }
function ChartTooltip({ active, payload, label, valueFormatter }: {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string;
  valueFormatter?: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white/95 backdrop-blur-sm px-3 py-2 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.12)]">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="text-sm font-semibold" style={{ color: p.color }}>
          {p.name}: {valueFormatter ? valueFormatter(p.value) : fmtNum(p.value)}
        </p>
      ))}
    </div>
  );
}

// ── KPI Card with icon accent ─────────────────────────────────────────────
function KpiCard({ title, value, subtitle, accentColor, bgColor }: {
  title: string; value: string; subtitle: string; accentColor: string; bgColor: string;
}) {
  return (
    <div className="card-hover relative overflow-hidden rounded-xl border border-slate-100 bg-white p-4 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]">
      <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-10" style={{ backgroundColor: accentColor }} />
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
      <p className="mt-1.5 text-2xl font-bold" style={{ color: accentColor }}>{value}</p>
      <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>
      <div className="absolute bottom-0 left-0 h-0.5 w-full" style={{ background: `linear-gradient(to right, ${accentColor}, ${bgColor})` }} />
    </div>
  );
}

// ── Chart Card wrapper ────────────────────────────────────────────────────
function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-5 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]">
      <h3 className="mb-4 text-sm font-semibold text-slate-700">{title}</h3>
      {children}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────
export function DashboardClientWithCharts() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER';

  const [range, setRange] = useState<RangeKey>('month');
  const [stats, setStats] = useState<DashboardStatsData | null>(null);
  const [funnel, setFunnel] = useState<FunnelItem[]>([]);
  const [revenue, setRevenue] = useState<RevenueDayItem[]>([]);
  const [performers, setPerformers] = useState<PerformerItem[]>([]);
  const [sourceData, setSourceData] = useState<SourceItem[]>([]);
  const [convTrend, setConvTrend] = useState<ConvTrendItem[]>([]);
  const [aging, setAging] = useState<AgingItem[]>([]);
  const [depts, setDepts] = useState<DeptItem[]>([]);
  const [teams, setTeams] = useState<TeamItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange(range);
    const fmtDay = (d: string) => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    try {
      const basePromises = [
        api.get<{ data: DashboardStatsData }>(`/dashboard/stats?from=${from}&to=${to}`),
        api.get<{ data: FunnelItem[] }>('/dashboard/lead-funnel'),
        api.get<{ data: (RevenueDayItem & { day: string })[] }>(`/dashboard/revenue-trend?from=${from}&to=${to}`),
        api.get<{ data: AgingItem[] }>('/dashboard/lead-aging'),
      ] as const;
      const adminPromises = isAdmin ? [
        api.get<{ data: PerformerItem[] }>(`/dashboard/top-performers?from=${from}&to=${to}`),
        api.get<{ data: SourceItem[] }>(`/dashboard/leads-by-source?from=${from}&to=${to}`),
        api.get<{ data: (ConvTrendItem & { day: string })[] }>(`/dashboard/conversion-trend?from=${from}&to=${to}`),
        api.get<{ data: DeptItem[] }>(`/dashboard/dept-performance?from=${from}&to=${to}`),
        api.get<{ data: TeamItem[] }>(`/dashboard/team-performance?from=${from}&to=${to}`),
      ] as const : [];
      const results = await Promise.all([...basePromises, ...adminPromises]);
      setStats(results[0].data);
      setFunnel(results[1].data);
      setRevenue(results[2].data.map((r) => ({ ...r, day: fmtDay(r.day) })));
      setAging(results[3].data || []);
      if (isAdmin && results[4]) setPerformers((results[4] as { data: PerformerItem[] }).data || []);
      if (isAdmin && results[5]) setSourceData((results[5] as { data: SourceItem[] }).data || []);
      if (isAdmin && results[6]) setConvTrend((results[6] as { data: (ConvTrendItem & { day: string })[] }).data.map((r) => ({ ...r, day: fmtDay(r.day) })));
      if (isAdmin && results[7]) setDepts((results[7] as { data: DeptItem[] }).data || []);
      if (isAdmin && results[8]) setTeams((results[8] as { data: TeamItem[] }).data || []);
    } catch { /* empty */ }
    setLoading(false);
  }, [range, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const activeFunnel = funnel.filter(f => f.count > 0);
  const totalFunnel = activeFunnel.reduce((s, f) => s + f.count, 0);

  return (
    <div className="space-y-6">
      {/* Header + Time Range */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Trang chủ</h1>
          <p className="text-sm text-slate-500">{isAdmin ? 'Tổng quan hệ thống VeloCRM' : 'Thống kê cá nhân'}</p>
        </div>
        <div className="flex rounded-xl border border-slate-200 bg-white p-1 shadow-[0_2px_10px_-2px_rgba(14,165,233,0.08)]">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map(key => (
            <button key={key} onClick={() => setRange(key)}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                range === key ? 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >{RANGE_LABELS[key]}</button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard title="Leads mới" value={fmtNum(stats?.newLeads)} subtitle="Trong kỳ" accentColor={COLORS.primary} bgColor={COLORS.primaryLight} />
        <KpiCard title="Đang xử lý" value={fmtNum(stats?.inProgress)} subtitle="Hiện tại" accentColor={COLORS.warning} bgColor={COLORS.warningLight} />
        <KpiCard title="Chuyển đổi" value={fmtNum(stats?.converted)} subtitle="Trong kỳ" accentColor={COLORS.success} bgColor={COLORS.successLight} />
        <KpiCard title="Doanh thu" value={stats ? fmtVND(stats.revenue) : '--'} subtitle="Đã xác nhận" accentColor={COLORS.purple} bgColor={COLORS.purpleLight} />
        <KpiCard title="Khách mới" value={fmtNum(stats?.newCustomers)} subtitle="Trong kỳ" accentColor={COLORS.indigo} bgColor={COLORS.indigoLight} />
        <KpiCard title="Đơn hàng" value={fmtNum(stats?.totalOrders)} subtitle="Trong kỳ" accentColor={COLORS.teal} bgColor={COLORS.tealLight} />
        <KpiCard title="Thanh toán chờ" value={fmtNum(stats?.pendingPayments)} subtitle="Chờ xác nhận"
          accentColor={stats?.pendingPayments ? COLORS.orange : '#94a3b8'} bgColor={COLORS.warningLight} />
        <KpiCard title="Quá hạn" value={fmtNum(stats?.overdueTask)} subtitle="Cần xử lý ngay"
          accentColor={stats?.overdueTask ? COLORS.danger : '#94a3b8'} bgColor={COLORS.dangerLight} />
      </div>

      {/* Charts Row 1: Revenue + Lead Funnel */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Revenue Area Chart */}
        <ChartCard title="Doanh thu theo ngày">
          {revenue.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">{loading ? 'Đang tải...' : 'Chưa có dữ liệu trong kỳ'}</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
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
                <Area type="monotone" dataKey="revenue" stroke={COLORS.primary} strokeWidth={2.5}
                  fill="url(#revenueGrad)" name="Doanh thu" dot={false} activeDot={{ r: 5, strokeWidth: 2, fill: '#fff' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        {/* Lead Funnel Donut */}
        <ChartCard title="Phân bổ leads theo trạng thái">
          {activeFunnel.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-400">{loading ? 'Đang tải...' : 'Chưa có dữ liệu'}</p>
          ) : (
            <div className="flex items-center gap-6">
              <div className="relative">
                <ResponsiveContainer width={180} height={180}>
                  <PieChart>
                    <Pie data={activeFunnel} dataKey="count" nameKey="status" cx="50%" cy="50%"
                      outerRadius={80} innerRadius={50} paddingAngle={2} strokeWidth={0}>
                      {activeFunnel.map(f => <Cell key={f.status} fill={FUNNEL_COLORS[f.status] || '#9ca3af'} />)}
                    </Pie>
                    <Tooltip content={<ChartTooltip valueFormatter={(v: number) => `${fmtNum(v)} (${totalFunnel ? Math.round(v / totalFunnel * 100) : 0}%)`} />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center total */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-slate-900">{fmtNum(totalFunnel)}</span>
                  <span className="text-[10px] text-slate-400">Tổng leads</span>
                </div>
              </div>
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

      {/* Lead Aging — all roles, full-width */}
      {aging.length > 0 && (
        <ChartCard title="Lead chưa tương tác — cảnh báo bỏ quên">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
            {aging.map((a) => {
              const isDanger = a.bucket.includes('7+');
              const isWarn = a.bucket.includes('3-7');
              const color = isDanger ? COLORS.danger : isWarn ? COLORS.warning : COLORS.success;
              return (
                <div key={a.bucket} className="text-center">
                  <span className="text-3xl font-bold tabular-nums" style={{ color }}>{a.count}</span>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ backgroundColor: color, width: '100%' }} />
                  </div>
                  <span className="text-xs text-slate-500 mt-1 block">{a.bucket}</span>
                </div>
              );
            })}
          </div>
        </ChartCard>
      )}

      {/* Manager+ Insight Charts */}
      {isAdmin && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Conversion Trend — new leads vs converted per day */}
          {convTrend.length > 0 && (
            <ChartCard title="Xu hướng chuyển đổi — Leads mới vs Convert">
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={convTrend}>
                  <defs>
                    <linearGradient id="newLeadsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.primary} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="convertGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLORS.success} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={COLORS.success} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="newLeads" stroke={COLORS.primary} strokeWidth={2} fill="url(#newLeadsGrad)" name="Leads mới" dot={false} />
                  <Area type="monotone" dataKey="converted" stroke={COLORS.success} strokeWidth={2} fill="url(#convertGrad)" name="Đã convert" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* Leads by Source with conversion rate */}
          {sourceData.length > 0 && (
            <ChartCard title="Chất lượng nguồn lead — Tỷ lệ chuyển đổi">
              <div className="space-y-3">
                {sourceData.map((s) => (
                  <div key={s.source} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{s.source}</span>
                      <span className="text-xs text-slate-500">{s.converted}/{s.total} — <span className="font-bold" style={{ color: s.rate >= 30 ? COLORS.success : s.rate >= 10 ? COLORS.warning : COLORS.danger }}>{s.rate}%</span></span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${s.rate}%`, background: s.rate >= 30 ? COLORS.success : s.rate >= 10 ? COLORS.warning : COLORS.danger }} />
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          )}

          {/* Top Performers */}
          {performers.length > 0 && (
            <ChartCard title="Top nhân viên trong kỳ">
              <div className="space-y-2.5">
                {performers.map((p, i) => {
                  const maxRev = performers[0]?.revenue || 1;
                  const barWidth = Math.max(p.revenue / maxRev * 100, 8);
                  return (
                    <div key={p.userId} className="flex items-center gap-3">
                      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shrink-0 ${
                        i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-slate-300 text-white' : i === 2 ? 'bg-orange-300 text-white' : 'bg-slate-100 text-slate-500'
                      }`}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between mb-1">
                          <span className="text-sm font-medium text-slate-700 truncate">{p.name}</span>
                          <span className="text-xs text-slate-500 ml-2 shrink-0">{p.converted} convert</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${barWidth}%`, background: `linear-gradient(to right, ${COLORS.primary}, ${COLORS.purple})` }} />
                        </div>
                      </div>
                      <span className="text-sm font-bold text-cyan-600 tabular-nums shrink-0 w-24 text-right">{fmtVND(p.revenue)}</span>
                    </div>
                  );
                })}
              </div>
            </ChartCard>
          )}
        </div>
      )}

      {/* Dept + Team Performance — manager only */}
      {isAdmin && (depts.length > 0 || teams.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Department Performance */}
          {depts.length > 0 && (
            <ChartCard title="Doanh số theo phòng ban">
              <div className="space-y-3">
                {depts.map((d) => {
                  const maxRev = Math.max(...depts.map((x) => x.revenue), 1);
                  const barW = Math.max(d.revenue / maxRev * 100, 4);
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
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${barW}%`, background: `linear-gradient(to right, ${COLORS.primary}, ${COLORS.teal})` }} />
                        </div>
                        <span className="text-sm font-bold text-teal-600 tabular-nums w-28 text-right">{fmtVND(d.revenue)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ChartCard>
          )}

          {/* Team Performance */}
          {teams.length > 0 && (
            <ChartCard title="Doanh số theo team">
              <div className="space-y-3">
                {teams.map((t) => {
                  const maxRev = Math.max(...teams.map((x) => x.revenue), 1);
                  const barW = Math.max(t.revenue / maxRev * 100, 4);
                  return (
                    <div key={t.teamId} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium text-slate-700">{t.name}</span>
                          <span className="ml-1.5 text-xs text-slate-400">{t.dept} · {t.members} NV</span>
                        </div>
                        <div className="flex gap-3 text-xs text-slate-500">
                          <span>{t.leads} leads</span>
                          <span className="text-emerald-600">{t.converted} convert</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-3 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${barW}%`, background: `linear-gradient(to right, ${COLORS.indigo}, ${COLORS.purple})` }} />
                        </div>
                        <span className="text-sm font-bold text-sky-600 tabular-nums w-28 text-right">{fmtVND(t.revenue)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ChartCard>
          )}
        </div>
      )}
    </div>
  );
}
