import { serverFetch } from '@/lib/auth';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate, formatVND } from '@/lib/utils';
import { notFound } from 'next/navigation';

/** Order detail: info + payments. */
export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let order: any;

  try {
    const result = await serverFetch<{ data: any }>(`/orders/${id}`);
    order = result.data;
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Đơn hàng #{order.id}</h1>
          <p className="text-gray-500">{order.customer?.name} — {order.customer?.phone}</p>
        </div>
        <StatusBadge status={order.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 font-semibold text-gray-900">Chi tiết</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-gray-500">Sản phẩm</dt><dd className="text-gray-700">{order.product?.name || '—'}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Giá</dt><dd className="text-gray-700">{formatVND(Number(order.amount))}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">VAT ({order.vatRate}%)</dt><dd className="text-gray-700">{formatVND(Number(order.vatAmount))}</dd></div>
            <div className="flex justify-between border-t border-gray-100 pt-2"><dt className="font-medium text-gray-700">Tổng</dt><dd className="font-bold text-gray-900">{formatVND(Number(order.totalAmount))}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Người tạo</dt><dd className="text-gray-700">{order.creator?.name}</dd></div>
            <div className="flex justify-between"><dt className="text-gray-500">Ngày tạo</dt><dd className="text-gray-700">{formatDate(order.createdAt)}</dd></div>
          </dl>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 font-semibold text-gray-900">Thanh toán ({order.payments?.length || 0})</h3>
          {!order.payments?.length ? (
            <p className="text-sm text-gray-400">Chưa có thanh toán</p>
          ) : (
            <div className="space-y-3">
              {order.payments.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={p.status} />
                      <span className="text-sm font-medium">{formatVND(Number(p.amount))}</span>
                    </div>
                    <span className="text-xs text-gray-400">{p.paymentType?.name || '—'}</span>
                  </div>
                  <span className="text-xs text-gray-400">{formatDate(p.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
