import { serverFetch } from '@/lib/auth';
import { ProductListClient } from '@/components/products/product-list-client';

/** Products page with dialog-based CRUD. */
export default async function ProductsPage() {
  let products: any[] = [];
  let categories: any[] = [];

  try {
    [products, categories] = await Promise.all([
      serverFetch<{ data: any[] }>('/products').then(r => r.data),
      serverFetch<{ data: any[] }>('/product-categories').then(r => r.data).catch(() => []),
    ]);
  } catch { /* empty */ }

  return <ProductListClient products={products} categories={categories} />;
}
