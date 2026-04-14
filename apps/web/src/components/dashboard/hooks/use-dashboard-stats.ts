'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api-client';
import {
  type RangeKey, type DashboardStatsData, type FunnelItem, type RevenueDayItem, type AgingItem,
  getDateRange, getPreviousPeriodRange, fmtDay,
} from '../constants';

interface MainSectionData {
  stats: DashboardStatsData | null;
  prevStats: DashboardStatsData | null;
  funnel: FunnelItem[];
  revenue: RevenueDayItem[];
  aging: AgingItem[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetches main dashboard section data: KPI stats (current + previous), funnel, revenue, aging.
 * Designed for the "always visible" main section — not tab-specific data.
 */
export function useDashboardStats(range: RangeKey): MainSectionData {
  const [stats, setStats] = useState<DashboardStatsData | null>(null);
  const [prevStats, setPrevStats] = useState<DashboardStatsData | null>(null);
  const [funnel, setFunnel] = useState<FunnelItem[]>([]);
  const [revenue, setRevenue] = useState<RevenueDayItem[]>([]);
  const [aging, setAging] = useState<AgingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { from, to } = getDateRange(range);
    const prev = getPreviousPeriodRange(range);

    try {
      const [statsRes, prevStatsRes, funnelRes, revenueRes, agingRes] = await Promise.all([
        api.get<{ data: DashboardStatsData }>(`/dashboard/stats?from=${from}&to=${to}`),
        api.get<{ data: DashboardStatsData }>(`/dashboard/stats?from=${prev.from}&to=${prev.to}`),
        api.get<{ data: FunnelItem[] }>('/dashboard/lead-funnel'),
        api.get<{ data: (RevenueDayItem & { day: string })[] }>(`/dashboard/revenue-trend?from=${from}&to=${to}`),
        api.get<{ data: AgingItem[] }>('/dashboard/lead-aging'),
      ]);

      setStats(statsRes.data);
      setPrevStats(prevStatsRes.data);
      setFunnel(funnelRes.data);
      setRevenue(revenueRes.data.map((r) => ({ ...r, day: fmtDay(r.day) })));
      setAging(agingRes.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu dashboard');
    }
    setLoading(false);
  }, [range]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { stats, prevStats, funnel, revenue, aging, loading, error };
}
