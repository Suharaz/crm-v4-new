'use client';

import { type RangeKey, RANGE_LABELS } from './constants';

interface DashboardHeaderProps {
  isAdmin: boolean;
  range: RangeKey;
  onRangeChange: (key: RangeKey) => void;
}

export function DashboardHeader({ isAdmin, range, onRangeChange }: DashboardHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Trang chủ</h1>
        <p className="text-sm text-slate-500">
          {isAdmin ? 'Tổng quan hệ thống VeloCRM' : 'Thống kê cá nhân'}
        </p>
      </div>

      {/* Time range selector — desktop: button row, mobile: handled by parent */}
      <div className="hidden sm:flex rounded-xl border border-slate-200 bg-white p-1 shadow-[0_2px_10px_-2px_rgba(14,165,233,0.08)]">
        {(Object.keys(RANGE_LABELS) as RangeKey[]).map(key => (
          <button
            key={key}
            onClick={() => onRangeChange(key)}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
              range === key
                ? 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            {RANGE_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Mobile: dropdown */}
      <select
        value={range}
        onChange={(e) => onRangeChange(e.target.value as RangeKey)}
        className="sm:hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
      >
        {(Object.keys(RANGE_LABELS) as RangeKey[]).map(key => (
          <option key={key} value={key}>{RANGE_LABELS[key]}</option>
        ))}
      </select>
    </div>
  );
}
