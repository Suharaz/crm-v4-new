'use client';

import { useState } from 'react';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate, formatVND } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OrderListWithInlineExpandProps {
  orders: any[];
}

/** Orders table with inline expandable detail row showing payments + notes. */
export function OrderListWithInlineExpand({ orders }: OrderListWithInlineExpandProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggle(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

  if (orders.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">Không có đơn hàng nào</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="w-8 px-2" />
            <th className="px-4 py-3 text-left font-medium text-gray-500">Mã</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Khách hàng</th>
            <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-gray-500">Sản phẩm</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">Tổng tiền</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Trạng thái</th>
            <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-gray-500">Ngày tạo</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o: any) => {
            const isExpanded = expandedId === String(o.id);
            return (
              <OrderRow key={o.id} order={o} isExpanded={isExpanded} onToggle={() => toggle(String(o.id))} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OrderRow({ order: o, isExpanded, onToggle }: { order: any; isExpanded: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        className={cn('border-b border-gray-100 hover:bg-gray-50 cursor-pointer', isExpanded && 'bg-sky-50/50')}
        onClick={onToggle}
      >
        <td className="px-2 text-center">
          <ChevronDown size={14} className={cn('text-gray-400 transition-transform', isExpanded && 'rotate-180')} />
        </td>
        <td className="px-4 py-3 font-medium text-sky-600">#{o.id}</td>
        <td className="px-4 py-3 text-gray-600">{o.customer?.name}</td>
        <td className="hidden md:table-cell px-4 py-3 text-gray-600">{o.product?.name || '—'}</td>
        <td className="px-4 py-3 text-right font-medium text-gray-900">{formatVND(Number(o.totalAmount))}</td>
        <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
        <td className="hidden lg:table-cell px-4 py-3 text-gray-400">{formatDate(o.createdAt)}</td>
      </tr>
      {isExpanded && (
        <tr className="bg-gray-50/50">
          <td colSpan={7} className="px-6 py-4">
            <OrderExpandedDetail order={o} />
          </td>
        </tr>
      )}
    </>
  );
}

function OrderExpandedDetail({ order: o }: { order: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      {/* Left: order info */}
      <div className="space-y-2">
        <h4 className="font-semibold text-gray-700">Chi tiết đơn hàng</h4>
        <div className="grid grid-cols-2 gap-1 text-gray-600">
          <span>Khách hàng:</span><span className="font-medium">{o.customer?.name} — {o.customer?.phone}</span>
          <span>Sản phẩm:</span><span>{o.product?.name || '—'}</span>
          <span>Giá:</span><span>{formatVND(Number(o.amount))}</span>
          {Number(o.vatRate) > 0 && <><span>VAT ({o.vatRate}%):</span><span>{formatVND(Number(o.vatAmount))}</span></>}
          <span>Tổng:</span><span className="font-bold text-sky-600">{formatVND(Number(o.totalAmount))}</span>
          <span>Người tạo:</span><span>{o.creator?.name || '—'}</span>
          {o.notes && <><span>Ghi chú:</span><span>{o.notes}</span></>}
        </div>
      </div>

      {/* Right: payments */}
      <div className="space-y-2">
        <h4 className="font-semibold text-gray-700">Thanh toán ({o.payments?.length || 0})</h4>
        {(!o.payments || o.payments.length === 0) ? (
          <p className="text-gray-400">Chưa có thanh toán</p>
        ) : (
          <div className="space-y-2">
            {o.payments.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2">
                <div>
                  <span className="font-medium">{p.paymentType?.name}</span>
                  {p.transferContent && <span className="ml-2 text-xs text-gray-400">{p.transferContent}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{formatVND(Number(p.amount))}</span>
                  <StatusBadge status={p.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
