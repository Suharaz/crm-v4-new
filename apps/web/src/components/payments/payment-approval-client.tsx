'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { formatDate, formatVND } from '@/lib/utils';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { PaymentRecord } from '@/types/entities';

interface Props {
  payments: PaymentRecord[];
}

/** Manager payment approval list — verify or reject pending payments in bulk. */
export function PaymentApprovalClient({ payments: initial }: Props) {
  const router = useRouter();
  const [payments, setPayments] = useState(initial);
  const [processing, setProcessing] = useState<string | null>(null);

  async function verify(id: string) {
    setProcessing(id);
    try {
      await api.post(`/payments/${id}/verify`);
      setPayments(prev => prev.filter(p => String(p.id) !== id));
      toast.success('Đã xác nhận');
      router.refresh();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Lỗi'); }
    setProcessing(null);
  }

  async function reject(id: string) {
    setProcessing(id);
    try {
      await api.post(`/payments/${id}/reject`);
      setPayments(prev => prev.filter(p => String(p.id) !== id));
      toast.success('Đã từ chối');
      router.refresh();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Lỗi'); }
    setProcessing(null);
  }

  if (payments.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">Không có thanh toán chờ duyệt</div>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">{payments.length} khoản chờ duyệt</p>
      {payments.map((p) => {
        const isProcessing = processing === String(p.id);
        return (
          <div key={p.id} className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white px-5 py-4">
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="font-semibold text-lg text-gray-900">{formatVND(Number(p.amount))}</span>
                <span className="text-xs text-gray-400">#{p.id}</span>
                {p.paymentType?.name && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">{p.paymentType.name}</span>}
              </div>
              <div className="mt-1 text-sm text-gray-500 space-x-3">
                <span>Đơn #{p.orderId}</span>
                {p.transferContent && <span>· Nội dung CK: <span className="font-medium text-gray-700">{p.transferContent}</span></span>}
              </div>
              <div className="mt-0.5 text-xs text-gray-400">
                Tạo {formatDate(p.createdAt)}
                {p.matchedTransaction && (
                  <span className="ml-2 text-emerald-600">Auto-match: {formatVND(Number(p.matchedTransaction.amount))} — {p.matchedTransaction.content}</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 shrink-0">
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              ) : (
                <>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => reject(String(p.id))}>
                    <XCircle className="h-4 w-4 mr-1" />Từ chối
                  </Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => verify(String(p.id))}>
                    <CheckCircle className="h-4 w-4 mr-1" />Xác nhận
                  </Button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
