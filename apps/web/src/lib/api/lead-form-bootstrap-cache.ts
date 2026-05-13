import { api } from '@/lib/api-client';
import type { NamedEntity } from '@/types/entities';

/**
 * Module-level cache cho 2 list reference data của LeadForm (sources + products).
 * - Fetch 1 lần per browser session (data đổi rất hiếm, có thể invalidate thủ công khi cần).
 * - Promise được cache để các caller song song chỉ trigger 1 request, không thunder.
 * - TTL: vô hạn trong tab (refresh page sẽ reset). Đủ cho UX edit drawer.
 */

let sourcesPromise: Promise<NamedEntity[]> | null = null;
let productsPromise: Promise<NamedEntity[]> | null = null;

function normalize(list: { id: string | number; name: string }[]): NamedEntity[] {
  return list.map((x) => ({ id: String(x.id), name: x.name }));
}

export function getLeadSources(): Promise<NamedEntity[]> {
  if (!sourcesPromise) {
    sourcesPromise = api
      .get<{ data: NamedEntity[] }>('/lead-sources')
      .then((res) => normalize(res.data || []))
      .catch((e) => {
        sourcesPromise = null; // reset để lần sau retry được
        throw e;
      });
  }
  return sourcesPromise;
}

export function getProducts(): Promise<NamedEntity[]> {
  if (!productsPromise) {
    productsPromise = api
      .get<{ data: NamedEntity[] }>('/products')
      .then((res) => normalize(res.data || []))
      .catch((e) => {
        productsPromise = null;
        throw e;
      });
  }
  return productsPromise;
}

/** Reset cache - gọi sau khi user CRUD source/product trong Settings. */
export function invalidateLeadFormBootstrap() {
  sourcesPromise = null;
  productsPromise = null;
}
