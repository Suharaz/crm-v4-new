'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { readSourceCache, writeSourceCache, type LeadSourceCached } from '@/lib/source-cache';

interface UseLeadSourcesResult {
  sources: LeadSourceCached[];
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Fetch lead sources với cache 24h trong localStorage.
 * - Mount lần đầu: check cache -> hit thì dùng (không gọi API). Miss thì fetch + write cache.
 * - `refetch()` để force fetch ghi đè cache (refresh button).
 * - `enabled`: chỉ fetch khi true (vd: combobox đang mở) để tránh fetch sớm khi mount popup chưa cần.
 */
export function useLeadSources(enabled = true): UseLeadSourcesResult {
  const [sources, setSources] = useState<LeadSourceCached[]>([]);
  const [loading, setLoading] = useState(false);
  // Ref tránh re-fetch nhiều lần khi `enabled` toggle hoặc parent re-render
  const loadedRef = useRef(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Array<{ id: string | number; name: string }> }>('/lead-sources');
      const list: LeadSourceCached[] = (res.data || []).map((s) => ({
        id: String(s.id),
        name: s.name,
      }));
      setSources(list);
      writeSourceCache(list);
      loadedRef.current = true;
    } catch (err) {
      // Giữ state cũ; signal cho dev khi API down (user thấy list rỗng nếu chưa cache)
      console.error('Failed to fetch lead-sources:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (loadedRef.current) return;
    const cached = readSourceCache();
    if (cached) {
      setSources(cached);
      loadedRef.current = true;
      return;
    }
    void refetch();
  }, [enabled, refetch]);

  return { sources, loading, refetch };
}
