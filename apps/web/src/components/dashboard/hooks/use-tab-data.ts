'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/lib/api-client';
import {
  type RangeKey, type PerformerItem, type SourceItem, type ConvTrendItem,
  type DeptItem, type TeamItem, type FunnelItem, type AgingItem, type RevenueDayItem,
  getDateRange, fmtDay,
} from '../constants';

export type TabKey = 'customers' | 'revenue' | 'team';

// ── Tab-specific data shapes ────────────────────────────────────────────
export interface CustomersTabData {
  funnel: FunnelItem[];
  aging: AgingItem[];
  convTrend: ConvTrendItem[];
  sourceData: SourceItem[];
}

export interface RevenueTabData {
  revenueTrend: RevenueDayItem[];
  depts: DeptItem[];
}

export interface TeamTabData {
  performers: PerformerItem[];
  depts: DeptItem[];
  teams: TeamItem[];
}

type TabData = CustomersTabData | RevenueTabData | TeamTabData;

interface UseTabDataResult<T extends TabData> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Lazy-loads data for a specific tab. Only fetches when the tab is active.
 * Caches fetched data so switching back doesn't re-fetch (until range changes).
 */
export function useTabData<T extends TabData>(
  tab: TabKey,
  range: RangeKey,
  isAdmin: boolean,
  isActive: boolean,
): UseTabDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef<string>(''); // track what we last fetched

  const fetchTab = useCallback(async () => {
    const cacheKey = `${tab}:${range}:${isAdmin}`;
    if (fetchedRef.current === cacheKey) return; // already fetched this combination

    setLoading(true);
    setError(null);
    const { from, to } = getDateRange(range);

    try {
      let result: TabData;

      switch (tab) {
        case 'customers': {
          const promises = [
            api.get<{ data: FunnelItem[] }>('/dashboard/lead-funnel'),
            api.get<{ data: AgingItem[] }>('/dashboard/lead-aging'),
            ...(isAdmin ? [
              api.get<{ data: (ConvTrendItem & { day: string })[] }>(`/dashboard/conversion-trend?from=${from}&to=${to}`),
              api.get<{ data: SourceItem[] }>(`/dashboard/leads-by-source?from=${from}&to=${to}`),
            ] : []),
          ];
          const results = await Promise.all(promises);
          result = {
            funnel: (results[0] as { data: FunnelItem[] }).data,
            aging: (results[1] as { data: AgingItem[] }).data || [],
            convTrend: isAdmin ? (results[2] as { data: (ConvTrendItem & { day: string })[] }).data.map(r => ({ ...r, day: fmtDay(r.day) })) : [],
            sourceData: isAdmin ? (results[3] as { data: SourceItem[] }).data : [],
          } satisfies CustomersTabData;
          break;
        }
        case 'revenue': {
          const promises = [
            api.get<{ data: (RevenueDayItem & { day: string })[] }>(`/dashboard/revenue-trend?from=${from}&to=${to}`),
            ...(isAdmin ? [
              api.get<{ data: DeptItem[] }>(`/dashboard/dept-performance?from=${from}&to=${to}`),
            ] : []),
          ];
          const results = await Promise.all(promises);
          result = {
            revenueTrend: (results[0] as { data: (RevenueDayItem & { day: string })[] }).data.map(r => ({ ...r, day: fmtDay(r.day) })),
            depts: isAdmin ? (results[1] as { data: DeptItem[] }).data : [],
          } satisfies RevenueTabData;
          break;
        }
        case 'team': {
          const [perf, dept, team] = await Promise.all([
            api.get<{ data: PerformerItem[] }>(`/dashboard/top-performers?from=${from}&to=${to}`),
            api.get<{ data: DeptItem[] }>(`/dashboard/dept-performance?from=${from}&to=${to}`),
            api.get<{ data: TeamItem[] }>(`/dashboard/team-performance?from=${from}&to=${to}`),
          ]);
          result = {
            performers: perf.data || [],
            depts: dept.data || [],
            teams: team.data || [],
          } satisfies TeamTabData;
          break;
        }
      }

      setData(result as T);
      fetchedRef.current = cacheKey;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải dữ liệu');
    }
    setLoading(false);
  }, [tab, range, isAdmin]);

  // Only fetch when tab becomes active
  useEffect(() => {
    if (isActive) fetchTab();
  }, [isActive, fetchTab]);

  // Reset cache when range changes
  useEffect(() => {
    fetchedRef.current = '';
  }, [range]);

  return { data, loading, error };
}
