import { serverFetch } from '@/lib/auth';
import type { OrderRecord, NamedEntity, ApiListResponse } from '@/types/entities';
import { PaginationControls } from '@/components/shared/pagination-controls';
import { CsvExportButton } from '@/components/shared/csv-export-button';
import { OrderListWithInlineExpand } from '@/components/orders/order-list-with-inline-expand';
import { OrderListAdvancedFilterBar } from '@/components/orders/order-list-advanced-filter-bar';

/** Orders list page with advanced filters — inline expand detail, role-filtered on backend. */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const qp = new URLSearchParams(params);
  qp.delete('cursor');
  const query = qp.toString();

  let data: OrderRecord[] = [];
  let meta: ApiListResponse<OrderRecord>['meta'] = {};
  let products: NamedEntity[] = [];
  let users: NamedEntity[] = [];
  let orderFormats: NamedEntity[] = [];
  let productGroups: NamedEntity[] = [];

  try {
    const [result, productsRes, usersRes, formatsRes, groupsRes] = await Promise.all([
      serverFetch<ApiListResponse<OrderRecord>>(`/orders?${query}`),
      serverFetch<{ data: NamedEntity[] }>('/products?includeInactive=false').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/users').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/order-formats').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/product-groups').catch(() => ({ data: [] })),
    ]);
    data = result.data;
    meta = result.meta;
    products = (productsRes.data || []).map((p: NamedEntity) => ({ id: String(p.id), name: p.name }));
    users = (usersRes.data || []).map((u: NamedEntity) => ({ id: String(u.id), name: u.name }));
    orderFormats = (formatsRes.data || []).map((f: NamedEntity) => ({ id: String(f.id), name: f.name }));
    productGroups = (groupsRes.data || []).map((g: NamedEntity) => ({ id: String(g.id), name: g.name }));
  } catch { /* empty */ }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Đơn hàng</h1>
          <p className="text-sm text-gray-500">Quản lý đơn hàng và thanh toán</p>
        </div>
        <CsvExportButton exportPath="/exports/orders" />
      </div>

      <div className="mt-4">
        <OrderListAdvancedFilterBar
          products={products}
          users={users}
          orderFormats={orderFormats}
          productGroups={productGroups}
        />
      </div>

      <div className="mt-4">
        <OrderListWithInlineExpand orders={data} />
      </div>
      <PaginationControls total={meta?.total} page={meta?.page} limit={meta?.limit} totalPages={meta?.totalPages} />
    </div>
  );
}
