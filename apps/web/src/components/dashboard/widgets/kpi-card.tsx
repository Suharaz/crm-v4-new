'use client';

import { fmtNum } from '../constants';

interface KpiCardProps {
  title: string;
  value: string;
  subtitle: string;
  accentColor: string;
  bgColor: string;
  /** Previous period value — if provided, show trend arrow + % change */
  previousValue?: number | null;
  /** Current raw number — needed for trend calculation */
  currentValue?: number | null;
}

/** Calculate % change and direction */
function getTrend(current?: number | null, previous?: number | null) {
  if (current == null || previous == null || previous === 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return { pct, direction: pct >= 0 ? 'up' : 'down' } as const;
}

export function KpiCard({
  title, value, subtitle, accentColor, bgColor,
  previousValue, currentValue,
}: KpiCardProps) {
  const trend = getTrend(currentValue, previousValue);

  return (
    <div className="card-hover relative overflow-hidden rounded-xl border border-slate-100 bg-white p-4 shadow-[0_4px_20px_-2px_rgba(14,165,233,0.08)]">
      {/* Accent circle background */}
      <div className="absolute -right-3 -top-3 h-16 w-16 rounded-full opacity-10" style={{ backgroundColor: accentColor }} />

      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
        {/* Trend badge */}
        {trend && (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
            trend.direction === 'up'
              ? 'bg-emerald-50 text-emerald-600'
              : 'bg-red-50 text-red-500'
          }`}>
            {trend.direction === 'up' ? '↑' : '↓'}
            {Math.abs(trend.pct)}%
          </span>
        )}
      </div>

      <p className="mt-1.5 text-2xl font-bold" style={{ color: accentColor }}>{value}</p>

      <div className="flex items-center justify-between mt-0.5">
        <p className="text-[11px] text-slate-400">{subtitle}</p>
        {trend && previousValue != null && (
          <p className="text-[10px] text-slate-400">
            trước: {fmtNum(previousValue)}
          </p>
        )}
      </div>

      {/* Bottom gradient bar */}
      <div className="absolute bottom-0 left-0 h-0.5 w-full" style={{ background: `linear-gradient(to right, ${accentColor}, ${bgColor})` }} />
    </div>
  );
}
