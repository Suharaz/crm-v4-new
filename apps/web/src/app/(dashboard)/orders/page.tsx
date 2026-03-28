import { serverFetch } from '@/lib/auth';
import { StatusBadge } from '@/components/shared/status-badge';
import { PaginationControls } from '@/components/shared/pagination-controls';
import { formatDate, formatVND } from '@/lib/utils';
import Link from 'next/link';
import { CsvExportButton } from '@/components/shared/csv-export-button';

/** Orders list page. */
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

      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        {data.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Không có đơn hàng nào</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Mã</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Khách hàng</th>
                <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-gray-500">Sản phẩm</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Tổng tiền</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Trạng thái</th>
                <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-gray-500">Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {data.map((o: any) => (
                <tr key={o.id} className="border-b border-gray-100 hover:bg-gray-50 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/orders/${o.id}`} className="font-medium text-sky-600 hover:underline">#{o.id}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{o.customer?.name}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-600">{o.product?.name || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{formatVND(Number(o.totalAmount))}</td>
                  <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                  <td className="hidden lg:table-cell px-4 py-3 text-gray-400">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <PaginationControls nextCursor={nextCursor} />
    </div>
  );
}
