'use client';

import { useState, useEffect, useRef } from 'react';
import { api } from '@/lib/api-client';
import { type RangeKey, getDateRange } from '../constants';

export interface EmployeeCallReportRow {
  userId: string;
  name: string;
  deptName: string;
  callsAnswered: number;
  callsOutgoing: number;
  outgoingTotalSeconds: number;
  outgoingAvgSeconds: number;
}

export function useEmployeeCallReport(
  range: RangeKey,
  deptId?: string,
  enabled: boolean = true,
) {
  const [rows, setRows] = useState<EmployeeCallReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    const { from, to } = getDateRange(range);
    const deptParam = deptId ? `&deptId=${deptId}` : '';

    api.get<{ data: EmployeeCallReportRow[] }>(
      `/dashboard/employee-reports/calls?from=${from}&to=${to}${deptParam}`,
      { signal: controller.signal },
    )
      .then(res => {
        if (controller.signal.aborted) return;
        setRows(res.data || []);
      })
      .catch(err => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Không thể tải báo cáo cuộc gọi');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [range, deptId, enabled]);

  return { rows, loading, error };
}
