'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid } from 'recharts';

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

// ── Chart colors ──────────────────────────────────────────────────────────
const FUNNEL_COLORS: Record<string, string> = {
  POOL: '#0ea5e9', ZOOM: '#f97316', ASSIGNED: '#3b82f6', IN_PROGRESS: '#eab308',
  CONVERTED: '#22c55e', LOST: '#ef4444', FLOATING: '#8b5cf6',
};
const FUNNEL_LABELS: Record<string, string> = {
  POOL: 'Kho', ZOOM: 'Zoom', ASSIGNED: 'Đã gán', IN_PROGRESS: 'Đang xử lý',
  CONVERTED: 'Chuyển đổi', LOST: 'Mất', FLOATING: 'Thả nổi',
};

// ── Format helpers ────────────────────────────────────────────────────────
function fmtVND(v: number) { return new Intl.NumberFormat('vi-VN').format(v) + ' ₫'; }
function fmtNum(v: number | null | undefined) { return v != null ? new Intl.NumberFormat('vi-VN').format(v) : '--'; }

// ── KPI Card ──────────────────────────────────────────────────────────────
function KpiCard({ title, value, subtitle, color }: { title: string; value: string; subtitle: string; color: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-400">{subtitle}</p>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────
export function DashboardClientWithCharts() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER';

  const [range, setRange] = useState<RangeKey>('month');
  const [stats, setStats] = useState<any>(null);
  const [funnel, setFunnel] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { from, to } = getDateRange(range);
    try {
      const [statsRes, funnelRes, revenueRes] = await Promise.all([
        api.get<{ data: any }>(`/dashboard/stats?from=${from}&to=${to}`),
        api.get<{ data: any[] }>('/dashboard/lead-funnel'),
        api.get<{ data: any[] }>(`/dashboard/revenue-trend?from=${from}&to=${to}`),
      ]);
      setStats(statsRes.data);
      setFunnel(funnelRes.data);
      setRevenue(revenueRes.data.map((r: any) => ({
        ...r,
        day: new Date(r.day).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }),
      })));
    } catch { /* empty */ }
    setLoading(false);
  }, [range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      {/* Header + Time Range */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trang chủ</h1>
          <p className="text-sm text-gray-500">
            {isAdmin ? 'Tổng quan hệ thống CRM' : 'Thống kê cá nhân'}
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map(key => (
            <button
              key={key}
              onClick={() => setRange(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                range === key ? 'bg-sky-500 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {RANGE_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard title="Leads mới" value={fmtNum(stats?.newLeads)} subtitle="Đang trong kho" color="text-sky-600" />
        <KpiCard title="Đang xử lý" value={fmtNum(stats?.inProgress)} subtitle="Leads tiến hành" color="text-amber-600" />
        <KpiCard title="Chuyển đổi" value={fmtNum(stats?.converted)} subtitle="Trong kỳ" color="text-emerald-600" />
        <KpiCard title="Doanh thu" value={stats ? fmtVND(stats.monthlyRevenue) : '--'} subtitle="Đã xác nhận" color="text-purple-600" />
        <KpiCard title="Khách hàng" value={fmtNum(stats?.totalCustomers)} subtitle="Đang hoạt động" color="text-indigo-600" />
        <KpiCard title="Đơn hàng" value={fmtNum(stats?.totalOrders)} subtitle="Trong kỳ" color="text-teal-600" />
        <KpiCard
          title="Thanh toán chờ" value={fmtNum(stats?.pendingPayments)} subtitle="Chờ xác nhận"
          color={stats?.pendingPayments ? 'text-orange-600' : 'text-gray-900'}
        />
        <KpiCard
          title="Quá hạn" value={fmtNum(stats?.overdueTask)} subtitle="Cần xử lý ngay"
          color={stats?.overdueTask ? 'text-red-600' : 'text-gray-900'}
        />
      </div>

      {/* Charts Row */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Revenue Trend */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">Doanh thu theo ngày</h3>
          {revenue.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">{loading ? 'Đang tải...' : 'Chưa có dữ liệu'}</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={revenue}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1e6 ? `${v / 1e6}M` : fmtNum(v)} />
                <Tooltip formatter={(v) => fmtVND(Number(v))} labelFormatter={l => `Ngày ${l}`} />
                <Bar dataKey="revenue" fill="#0ea5e9" radius={[4, 4, 0, 0]} name="Doanh thu" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Lead Funnel */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">Phân bổ leads theo trạng thái</h3>
          {funnel.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">{loading ? 'Đang tải...' : 'Chưa có dữ liệu'}</p>
          ) : (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={220}>
                <PieChart>
                  <Pie data={funnel.filter(f => f.count > 0)} dataKey="count" nameKey="status" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                    {funnel.filter(f => f.count > 0).map(f => (
                      <Cell key={f.status} fill={FUNNEL_COLORS[f.status] || '#9ca3af'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, name) => [fmtNum(Number(v)), FUNNEL_LABELS[String(name)] || String(name)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {funnel.filter(f => f.count > 0).map(f => (
                  <div key={f.status} className="flex items-center gap-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: FUNNEL_COLORS[f.status] }} />
                    <span className="flex-1 text-gray-600">{FUNNEL_LABELS[f.status] || f.status}</span>
                    <span className="font-medium">{fmtNum(f.count)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
