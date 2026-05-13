import { api } from '@/lib/api-client';
import { getCached, invalidateCached } from '@/lib/storage/local-storage-cache';
import type { NamedEntity } from '@/types/entities';

/**
 * Cache cho 2 list reference data của LeadForm (sources + products).
 * - Persist localStorage, TTL 24h (data đổi rất hiếm - vài tuần / lần)
 * - Cross-tab share + tồn tại qua page refresh
 * - Promise dedup: nhiều caller song song chỉ trigger 1 request
 *
 * Khi user CRUD source/product trong Settings -> gọi invalidateLeadFormBootstrap()
 * để force-refresh data ngay.
 */

const SOURCES_KEY = 'crm_cache_lead_sources_v1';
const PRODUCTS_KEY = 'crm_cache_products_v1';
// 4h = balance giữa request reduction và freshness. User Settings page có nút "Làm mới cache"
// để force-invalidate ngay khi cần. Auto-invalidate cũng chạy sau mỗi CRUD source/product.
const TTL_4H = 4 * 60 * 60 * 1000;

function normalize(list: { id: string | number; name: string }[]): NamedEntity[] {
  return list.map((x) => ({ id: String(x.id), name: x.name }));
}

export function getLeadSources(): Promise<NamedEntity[]> {
  return getCached(
    SOURCES_KEY,
    async () => {
      const res = await api.get<{ data: NamedEntity[] }>('/lead-sources');
      return normalize(res.data || []);
    },
    TTL_4H,
  );
}

export function getProducts(): Promise<NamedEntity[]> {
  return getCached(
    PRODUCTS_KEY,
    async () => {
      const res = await api.get<{ data: NamedEntity[] }>('/products');
      return normalize(res.data || []);
    },
    TTL_4H,
  );
}

/** Reset cache - gọi sau khi user CRUD source/product trong Settings. */
export function invalidateLeadFormBootstrap() {
  invalidateCached(SOURCES_KEY);
  invalidateCached(PRODUCTS_KEY);
}
