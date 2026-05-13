/**
 * Generic localStorage cache với TTL + promise dedup.
 *
 * - Cache hit + chưa hết hạn -> trả ngay từ localStorage
 * - Cache miss / hết hạn -> gọi fetcher, lưu lại
 * - Promise dedup: 2 caller song song trong cùng tab chỉ trigger 1 fetcher
 *   (tránh thundering herd ngay sau khi cache hết hạn)
 *
 * Lưu ý: localStorage chỉ chứa data JSON-serializable. Không chứa Promise.
 */

interface CacheEnvelope<T> {
  value: T;
  expiresAt: number; // epoch ms
}

const inflightFetchers = new Map<string, Promise<unknown>>();

function readFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as CacheEnvelope<T>;
    if (Date.now() > envelope.expiresAt) {
      localStorage.removeItem(key);
      return null;
    }
    return envelope.value;
  } catch {
    return null;
  }
}

function writeToStorage<T>(key: string, value: T, ttlMs: number) {
  try {
    const envelope: CacheEnvelope<T> = { value, expiresAt: Date.now() + ttlMs };
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // QuotaExceeded hoặc storage không khả dụng - bỏ qua, không break flow
  }
}

/**
 * Đọc value từ cache; nếu miss/expired thì gọi fetcher + lưu lại.
 *
 * @param key      - localStorage key (nên có prefix kiểu `crm_cache_*`)
 * @param fetcher  - function async lấy data từ server
 * @param ttlMs    - thời gian sống (mặc định 24h)
 */
export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = 24 * 60 * 60 * 1000,
): Promise<T> {
  const cached = readFromStorage<T>(key);
  if (cached !== null) return cached;

  // Dedup nếu nhiều caller gọi cùng key trong cùng tick
  const inflight = inflightFetchers.get(key);
  if (inflight) return inflight as Promise<T>;

  const promise = fetcher()
    .then((value) => {
      writeToStorage(key, value, ttlMs);
      return value;
    })
    .finally(() => {
      inflightFetchers.delete(key);
    });

  inflightFetchers.set(key, promise);
  return promise;
}

/** Force invalidate 1 key - gọi sau khi user CRUD entity tương ứng. */
export function invalidateCached(key: string) {
  try { localStorage.removeItem(key); } catch { /* */ }
  inflightFetchers.delete(key);
}
