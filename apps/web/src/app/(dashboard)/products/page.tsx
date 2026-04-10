import { serverFetch } from '@/lib/auth';
import { ProductListClient } from '@/components/products/product-list-client';
import type { ProductRecord, NamedEntity } from '@/types/entities';

/** Products page with dialog-based CRUD. */
export default async function ProductsPage() {
  let products: ProductRecord[] = [];
  let categories: NamedEntity[] = [];

  try {
    [products, categories] = await Promise.all([
      serverFetch<{ data: ProductRecord[] }>('/products?includeInactive=true').then(r => r.data),
      serverFetch<{ data: NamedEntity[] }>('/product-categories').then(r => r.data).catch(() => []),
    ]);
  } catch { /* empty */ }

  return <ProductListClient products={products} categories={categories} />;
}
