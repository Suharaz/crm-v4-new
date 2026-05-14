/**
 * Cache `/lead-sources` response trong localStorage 24h.
 * Sources thường <100 entries (vài KB) - dưới quota 5MB nhiều lần.
 * Clear khi logout (auth-provider.tsx) để user kế tiếp trên thiết bị shared không thấy stale data.
 *
 * try/catch tất cả localStorage access - incognito strict mode (Firefox) có thể throw.
 */

const KEY = 'lead-sources-cache';
const TTL_MS = 24 * 60 * 60 * 1000;
const VERSION = 1;

export interface LeadSourceCached {
  id: string;
  name: string;
}

interface CacheShape {
  version: number;
  ts: number;
  data: LeadSourceCached[];
}

export function readSourceCache(): LeadSourceCached[] | null {
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

export function writeSourceCache(data: LeadSourceCached[]): void {
  try {
    const payload: CacheShape = { version: VERSION, ts: Date.now(), data };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // quota exceeded / disabled - ignore (next mount sẽ fetch lại từ API)
  }
}

export function clearSourceCache(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
