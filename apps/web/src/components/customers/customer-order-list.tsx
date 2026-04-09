'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate, formatVND } from '@/lib/utils';
import { api } from '@/lib/api-client';

interface Order {
  id: string;
  status: string;
  totalAmount: string;
  createdAt: string;
  product?: { id: string; name: string } | null;
}

interface Payment {
  id: string;
  amount: string;
  status: string;
  transferContent?: string;
  verifiedSource?: string;
  verifiedAt?: string;
  createdAt: string;
  paymentType?: { id: string; name: string } | null;
  bankAccount?: { id: string; name: string } | null;
}

interface Props {
  orders: Order[];
}

const PAYMENT_STATUS_MAP: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Chờ xác nhận', className: 'bg-yellow-100 text-yellow-700' },
  VERIFIED: { label: 'Đã xác nhận', className: 'bg-green-100 text-green-700' },
  REJECTED: { label: 'Từ chối', className: 'bg-red-100 text-red-700' },
};

/** Orders list with expandable payment history per order. */
export function CustomerOrderList({ orders }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payments, setPayments] = useState<Record<string, Payment[]>>({});
  const [loading, setLoading] = useState<string | null>(null);

  async function toggleOrder(orderId: string) {
    if (expandedId === orderId) {
      setExpandedId(null);
      return;
    }

    setExpandedId(orderId);

    // Fetch payments if not cached
    if (!payments[orderId]) {
      setLoading(orderId);
      try {
        const res = await api.get<{ data: { payments: Payment[] } }>(`/orders/${orderId}`);
        setPayments(prev => ({ ...prev, [orderId]: res.data.payments || [] }));
      } catch {
        setPayments(prev => ({ ...prev, [orderId]: [] }));
      } finally {
        setLoading(null);
      }
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-3 font-semibold text-gray-900">Đơn hàng ({orders.length})</h3>
      <div className="space-y-2">
        {orders.map((o) => {
          const isExpanded = expandedId === o.id;
          const orderPayments = payments[o.id];
          const isLoading = loading === o.id;

          return (
            <div key={o.id} className="rounded-lg border border-gray-100 overflow-hidden">
              <button
                onClick={() => toggleOrder(o.id)}
                className="flex w-full items-center justify-between p-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                  )}
                  <StatusBadge status={o.status} />
                  <span className="text-sm font-medium text-gray-700">{formatVND(Number(o.totalAmount))}</span>
                  {o.product && (
                    <span className="text-xs text-gray-500">• {o.product.name}</span>
                  )}
                </div>
                <span className="text-xs text-gray-400 shrink-0">{formatDate(o.createdAt)}</span>
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3">
                  {isLoading ? (
                    <div className="flex items-center justify-center py-3">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      <span className="ml-2 text-xs text-gray-400">Đang tải...</span>
                    </div>
                  ) : orderPayments && orderPayments.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Lịch sử thanh toán</p>
                      {orderPayments.map((p) => {
                        const statusInfo = PAYMENT_STATUS_MAP[p.status] || { label: p.status, className: 'bg-gray-100 text-gray-600' };
                        return (
                          <div key={p.id} className="flex items-center justify-between rounded-md bg-white border border-gray-100 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${statusInfo.className}`}>
                                {statusInfo.label}
                              </span>
                              <span className="text-sm font-medium text-gray-700">{formatVND(Number(p.amount))}</span>
                              {p.paymentType && (
                                <span className="text-xs text-gray-500">• {p.paymentType.name}</span>
                              )}
                            </div>
                            <span className="text-xs text-gray-400">{formatDate(p.createdAt)}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-2">Chưa có thanh toán</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
