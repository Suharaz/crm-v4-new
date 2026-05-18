'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api-client';
import { readProductCache, writeProductCache, type ProductCached } from '@/lib/product-cache';

interface UseProductsResult {
  products: ProductCached[];
  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Fetch products với cache 24h trong localStorage.
 * - Mount lần đầu: check cache -> hit thì dùng (không gọi API). Miss thì fetch + write cache.
 * - `refetch()` để force fetch ghi đè cache (refresh button).
 * - `enabled`: chỉ fetch khi true (vd: combobox đang mở) để tránh fetch sớm khi mount popup chưa cần.
 *
 * Pattern y hệt useLeadSources - tách hook riêng để cache key + endpoint khác nhau.
 */
export function useProducts(enabled = true): UseProductsResult {
  const [products, setProducts] = useState<ProductCached[]>([]);
  const [loading, setLoading] = useState(false);
  // Ref tránh re-fetch nhiều lần khi `enabled` toggle hoặc parent re-render
  const loadedRef = useRef(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Array<{ id: string | number; name: string }> }>('/products');
      const list: ProductCached[] = (res.data || []).map((p) => ({
        id: String(p.id),
        name: p.name,
      }));
      setProducts(list);
      writeProductCache(list);
      loadedRef.current = true;
    } catch (err) {
      // Giữ state cũ; signal cho dev khi API down (user thấy list rỗng nếu chưa cache)
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (loadedRef.current) return;
    const cached = readProductCache();
    if (cached) {
      setProducts(cached);
      loadedRef.current = true;
      return;
    }
    void refetch();
  }, [enabled, refetch]);

  return { products, loading, refetch };
}
