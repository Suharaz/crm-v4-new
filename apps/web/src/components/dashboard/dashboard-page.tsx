'use client';

import { Suspense, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { type RangeKey } from './constants';
import { useDashboardStats } from './hooks/use-dashboard-stats';
import { DashboardHeader } from './dashboard-header';
import { DashboardKpiSection } from './dashboard-kpi-section';
import { DashboardMainCharts } from './dashboard-main-charts';
import { DashboardTabs } from './dashboard-tabs';

/**
 * Main dashboard orchestrator — composes header, KPIs, charts, and tabs.
 * Replaces the old monolithic DashboardClientWithCharts (452 lines → ~40 lines).
 */
export function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER';

  const [range, setRange] = useState<RangeKey>('month');
  const { stats, prevStats, funnel, revenue, loading, error } = useDashboardStats(range);

  return (
    <div className="space-y-6">
      <DashboardHeader isAdmin={isAdmin} range={range} onRangeChange={setRange} />

      <DashboardKpiSection stats={stats} prevStats={prevStats} loading={loading} />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </div>
      )}

      <DashboardMainCharts revenue={revenue} funnel={funnel} loading={loading} />

      <Suspense fallback={<div className="h-[300px] animate-pulse rounded-xl bg-slate-100" />}>
        <DashboardTabs range={range} isAdmin={isAdmin} />
      </Suspense>
    </div>
  );
}
