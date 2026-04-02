import { serverFetch } from '@/lib/auth';
import { PaginationControls } from '@/components/shared/pagination-controls';
import { CsvExportButton } from '@/components/shared/csv-export-button';
import { OrderListWithInlineExpand } from '@/components/orders/order-list-with-inline-expand';

/** Orders list page — inline expand detail, role-filtered on backend. */
export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const query = new URLSearchParams(params).toString();

  let data: any[] = [];
  let nextCursor: string | undefined;
  try {
    const result = await serverFetch<{ data: any[]; nextCursor?: string }>(`/orders?${query}`);
    data = result.data;
    nextCursor = result.nextCursor;
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
        <OrderListWithInlineExpand orders={data} />
      </div>
      <PaginationControls nextCursor={nextCursor} />
    </div>
  );
}
