// ── Dashboard design tokens & format helpers ────────────────────────────

// Color tokens aligned with design-guidelines.md
export const COLORS = {
  primary: '#0ea5e9',
  primaryLight: '#e0e7ff',
  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  danger: '#ef4444',
  dangerLight: '#fee2e2',
  purple: '#8b5cf6',
  purpleLight: '#ede9fe',
  indigo: '#6366f1',
  indigoLight: '#e0e7ff',
  teal: '#14b8a6',
  tealLight: '#ccfbf1',
  orange: '#f97316',
  cyan: '#06b6d4',
} as const;

export const FUNNEL_COLORS: Record<string, string> = {
  POOL: COLORS.primary,
  ZOOM: COLORS.orange,
  ASSIGNED: COLORS.teal,
  IN_PROGRESS: COLORS.warning,
  CONVERTED: COLORS.success,
  LOST: COLORS.danger,
  FLOATING: COLORS.purple,
};

export const FUNNEL_LABELS: Record<string, string> = {
  POOL: 'Kho',
  ZOOM: 'Zoom',
  ASSIGNED: 'Đã gán',
  IN_PROGRESS: 'Đang xử lý',
  CONVERTED: 'Chuyển đổi',
  LOST: 'Mất',
  FLOATING: 'Thả nổi',
};

// ── Time range ──────────────────────────────────────────────────────────
export type RangeKey = 'today' | 'week' | 'month' | 'quarter' | 'year';

export const RANGE_LABELS: Record<RangeKey, string> = {
  today: 'Hôm nay',
  week: 'Tuần này',
  month: 'Tháng này',
  quarter: 'Quý này',
  year: 'Năm nay',
};

/** Monday offset: getDay() returns 0=Sun,1=Mon..6=Sat. We want Monday=start. */
function mondayOffset(dow: number) { return dow === 0 ? -6 : 1 - dow; }

export function getDateRange(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const fmt = (dt: Date) => dt.toISOString().split('T')[0];
  const to = fmt(now);
  switch (key) {
    case 'today': return { from: to, to };
    case 'week': { const start = new Date(y, m, d + mondayOffset(now.getDay())); return { from: fmt(start), to }; }
    case 'month': return { from: fmt(new Date(y, m, 1)), to };
    case 'quarter': { const qm = Math.floor(m / 3) * 3; return { from: fmt(new Date(y, qm, 1)), to }; }
    case 'year': return { from: fmt(new Date(y, 0, 1)), to };
  }
}

/** Get the previous period range (same length, shifted back) for comparison */
export function getPreviousPeriodRange(key: RangeKey): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const fmt = (dt: Date) => dt.toISOString().split('T')[0];
  switch (key) {
    case 'today': {
      const yesterday = new Date(y, m, d - 1);
      return { from: fmt(yesterday), to: fmt(yesterday) };
    }
    case 'week': {
      const off = mondayOffset(now.getDay());
      const start = new Date(y, m, d + off - 7);
      const end = new Date(y, m, d + off - 1);
      return { from: fmt(start), to: fmt(end) };
    }
    case 'month': {
      const prevStart = new Date(y, m - 1, 1);
      const prevEnd = new Date(y, m, 0);
      return { from: fmt(prevStart), to: fmt(prevEnd) };
    }
    case 'quarter': {
      const qm = Math.floor(m / 3) * 3;
      const prevStart = new Date(y, qm - 3, 1);
      const prevEnd = new Date(y, qm, 0);
      return { from: fmt(prevStart), to: fmt(prevEnd) };
    }
    case 'year': {
      return { from: fmt(new Date(y - 1, 0, 1)), to: fmt(new Date(y - 1, 11, 31)) };
    }
  }
}

// ── Format helpers ──────────────────────────────────────────────────────
export function fmtVND(v: number) {
  return new Intl.NumberFormat('vi-VN').format(v) + ' ₫';
}

export function fmtNum(v: number | null | undefined) {
  return v != null ? new Intl.NumberFormat('vi-VN').format(v) : '--';
}

export function fmtShort(v: number) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

export function fmtDay(d: string) {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

// ── Shared data types ───────────────────────────────────────────────────
export interface DashboardStatsData {
  newLeads?: number | null;
  inProgress?: number | null;
  converted?: number | null;
  revenue: number;
  newCustomers?: number | null;
  totalOrders?: number | null;
  pendingPayments?: number | null;
  overdueTask?: number | null;
}

export interface FunnelItem { status: string; count: number }
export interface RevenueDayItem { day: string; revenue: number }
export interface AgingItem { bucket: string; count: number }
export interface PerformerItem { userId: string; name: string; converted: number; revenue: number }
export interface SourceItem { source: string; total: number; converted: number; rate: number }
export interface ConvTrendItem { day: string; newLeads: number; converted: number }
export interface DeptItem { deptId: string; name: string; leads: number; converted: number; revenue: number }
export interface TeamItem { teamId: string; name: string; dept: string; members: number; leads: number; converted: number; revenue: number }
