'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api-client';
import { type RangeKey, RANGE_LABELS, fmtNum } from '@/components/dashboard/constants';
import { useEmployeeScores } from '@/components/dashboard/hooks/use-employee-scores';
import { EmployeeScorecardCard } from '@/components/dashboard/widgets/employee-scorecard';

interface Department { id: string; name: string }

export default function DashboardEmployeesPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER';

  const [range, setRange] = useState<RangeKey>('month');
  const [deptId, setDeptId] = useState<string>();
  const [departments, setDepartments] = useState<Department[]>([]);

  const { employees, loading, error } = useEmployeeScores(range, deptId);

  // Fetch departments for filter
  useEffect(() => {
    api.get<{ data: Department[] }>('/departments')
      .then(res => setDepartments(res.data || []))
      .catch(() => {});
  }, []);

  const kpiCount = employees.length;
  const goodCount = employees.filter(e => e.score >= 70).length;
  const needHelpCount = employees.filter(e => e.score < 40).length;

  if (!isAdmin) {
    return (
      <div className="flex h-[400px] items-center justify-center text-slate-400">
        Bạn không có quyền xem trang này
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Hiệu suất nhân viên</h1>
          <p className="text-sm text-slate-500">Nhìn phát biết ai oke, ai cần hỗ trợ</p>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={deptId || ''}
            onChange={e => setDeptId(e.target.value || undefined)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
          >
            <option value="">Tất cả phòng ban</option>
            {departments.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {/* Desktop time range */}
          <div className="hidden sm:flex rounded-xl border border-slate-200 bg-white p-1 shadow-[0_2px_10px_-2px_rgba(14,165,233,0.08)]">
            {(['week', 'month', 'quarter'] as RangeKey[]).map(key => (
              <button
                key={key}
                onClick={() => setRange(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${
                  range === key
                    ? 'bg-gradient-to-r from-sky-600 to-cyan-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {RANGE_LABELS[key]}
              </button>
            ))}
          </div>
          {/* Mobile select */}
          <select
            value={range}
            onChange={e => setRange(e.target.value as RangeKey)}
            className="sm:hidden rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm"
          >
            {(['week', 'month', 'quarter'] as RangeKey[]).map(key => (
              <option key={key} value={key}>{RANGE_LABELS[key]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-[0_2px_12px_-2px_rgba(14,165,233,0.06)]">
          <div className="text-2xl font-bold text-sky-600">{loading ? '--' : fmtNum(kpiCount)}</div>
          <div className="text-xs text-slate-500 mt-1">Tổng nhân viên</div>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-[0_2px_12px_-2px_rgba(14,165,233,0.06)]">
          <div className="text-2xl font-bold text-emerald-600">{loading ? '--' : fmtNum(goodCount)}</div>
          <div className="text-xs text-slate-500 mt-1">Đạt KPI (score ≥70)</div>
          {!loading && kpiCount > 0 && (
            <div className="text-xs font-semibold text-emerald-600 mt-1">{Math.round(goodCount / kpiCount * 100)}% đội ngũ</div>
          )}
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-[0_2px_12px_-2px_rgba(14,165,233,0.06)]">
          <div className={`text-2xl font-bold ${needHelpCount > 0 ? 'text-red-500' : 'text-slate-400'}`}>
            {loading ? '--' : fmtNum(needHelpCount)}
          </div>
          <div className="text-xs text-slate-500 mt-1">Cần hỗ trợ (score &lt;40)</div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>
      )}

      {/* Employee grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[160px] animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <div className="rounded-xl border border-slate-100 bg-white p-12 text-center text-sm text-slate-400">
          Không có nhân viên nào trong kỳ đã chọn
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {employees.map(emp => (
            <EmployeeScorecardCard key={emp.userId} employee={emp} />
          ))}
        </div>
      )}
    </div>
  );
}
