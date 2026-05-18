/**
 * Cache `/products` response trong localStorage 24h.
 * Products thường <500 entries (vài KB - vài chục KB) - vẫn dưới quota 5MB.
 * Clear khi logout (auth-provider.tsx) để user kế tiếp trên thiết bị shared không thấy stale data.
 *
 * Pattern y hệt source-cache.ts (cùng TTL 24h, cùng VERSION shape) - tách file để
 * 1 trong 2 cache invalidate không kéo theo cái còn lại.
 */

const KEY = 'products-cache';
const TTL_MS = 24 * 60 * 60 * 1000;
const VERSION = 1;

export interface ProductCached {
  id: string;
  name: string;
}

interface CacheShape {
  version: number;
  ts: number;
  data: ProductCached[];
}

export function readProductCache(): ProductCached[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheShape;
    if (parsed.version !== VERSION) return null;
    if (Date.now() - parsed.ts > TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeProductCache(data: ProductCached[]): void {
  try {
    const payload: CacheShape = { version: VERSION, ts: Date.now(), data };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // quota exceeded / disabled - ignore (next mount sẽ fetch lại từ API)
  }
}

export function clearProductCache(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
