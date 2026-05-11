'use client';

import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

interface LabelCount {
  labelId: string;
  name: string;
  color: string;
  count: number;
}

interface LabelCountsResponse {
  total: number;
  noLabelCount: number;
  counts: LabelCount[];
}

type Scope = 'my' | 'pool-new' | 'pool-zoom' | 'floating';

// Map scope → backend route (1 endpoint per page family, with role guard server-side)
const SCOPE_TO_PATH: Record<Scope, string> = {
  'my': '/leads/label-counts/my',
  'pool-new': '/leads/label-counts/pool/new',
  'pool-zoom': '/leads/label-counts/pool/zoom',
  'floating': '/leads/label-counts/floating',
};

interface Props {
  scope: Scope;
}

/**
 * Quick-filter chips by lead label, shown above the lead table.
 * - Fetches counts via /leads/label-counts?scope=...&[same filters as list]
 * - Click a chip → set ?labelId=X in URL (stack with other filters)
 * - "Tất cả" chip clears labelId
 * - Active chip highlighted with ring + opacity
 */
export function LeadLabelQuickFilters({ scope }: Props) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [data, setData] = useState<LabelCountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active label from URL
  const activeLabelId = searchParams.get('labelId');

  // Build query string of all params except labelId - used to fetch counts
  // that respect other active filters (source, date, etc).
  const queryWithoutLabel = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('labelId');
    return params.toString();
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const path = SCOPE_TO_PATH[scope];
    const qs = queryWithoutLabel ? `?${queryWithoutLabel}` : '';
    api
      .get<{ data: LabelCountsResponse }>(`${path}${qs}`)
      .then((res) => setData(res.data))
      .catch((err) => {
        setData(null);
        setError(err?.message || 'Không tải được nhãn');
      })
      .finally(() => setLoading(false));
  }, [scope, queryWithoutLabel]);

  function applyFilter(labelId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (labelId) params.set('labelId', labelId);
    else params.delete('labelId');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  if (loading && !data) {
    return <div className="flex gap-2 mb-3 animate-pulse">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="h-7 w-24 rounded-full bg-slate-100" />
      ))}
    </div>;
  }

  // Visible diagnostic: tells user/dev why chips don't show (instead of silent return null)
  if (error) {
    return <div className="mb-3 text-xs text-red-500">Lỗi tải nhãn: {error}</div>;
  }

  if (!data || data.counts.length === 0) {
    return <div className="mb-3 text-xs text-slate-400">Chưa có nhãn nào (vào Cài đặt &gt; Nhãn để thêm)</div>;
  }

  const isAllActive = !activeLabelId;

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {/* "Tất cả" - clears labelId */}
      <button
        type="button"
        onClick={() => applyFilter(null)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all',
          'bg-slate-700 text-white',
          isAllActive ? 'ring-2 ring-offset-1 ring-slate-400' : 'opacity-70 hover:opacity-100'
        )}
      >
        <span>Tất cả</span>
        <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] tabular-nums">{data.total}</span>
      </button>

      {/* Per-label chips */}
      {data.counts.map((l) => {
        const isActive = activeLabelId === l.labelId;
        return (
          <button
            key={l.labelId}
            type="button"
            onClick={() => applyFilter(l.labelId)}
            style={{ backgroundColor: l.color }}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-white transition-all',
              isActive ? 'ring-2 ring-offset-1 ring-slate-400' : 'opacity-70 hover:opacity-100'
            )}
          >
            <span>{l.name}</span>
            <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] tabular-nums">{l.count}</span>
          </button>
        );
      })}

      {/* Loading hint when refetching after filter change */}
      {loading && <span className="text-xs text-slate-400 ml-1">đang cập nhật...</span>}
    </div>
  );
}
