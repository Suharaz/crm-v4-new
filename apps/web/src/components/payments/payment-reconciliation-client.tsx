'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { api } from '@/lib/api-client';
import { formatDate, formatVND } from '@/lib/utils';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  pendingPayments: any[];
  unmatchedTx: any[];
  verifiedPayments: any[];
}

export function PaymentReconciliationClient({ pendingPayments: initPending, unmatchedTx: initTx, verifiedPayments }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(initPending);
  const [unmatched, setUnmatched] = useState(initTx);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const canMatch = selectedLeft && selectedRight;

  /** Match: ghép payment (trái) + bank transaction (phải) → verify */
  async function handleMatch() {
    if (!selectedLeft || !selectedRight) return;
    setProcessing(true);
    try {
      await api.post(`/bank-transactions/${selectedRight}/match`, { paymentId: selectedLeft });
      setPending(prev => prev.filter(p => String(p.id) !== selectedLeft));
      setUnmatched(prev => prev.filter(t => String(t.id) !== selectedRight));
      setSelectedLeft(null);
      setSelectedRight(null);
      toast.success('Đã xác minh thành công');
      router.refresh();
    } catch (err: any) { toast.error(err.message || 'Lỗi xác minh'); }
    setProcessing(false);
  }

  /** Verify payment only (no bank tx to match) */
  async function handleVerifyOnly() {
    if (!selectedLeft) return;
    setProcessing(true);
    try {
      await api.post(`/payments/${selectedLeft}/verify`);
      setPending(prev => prev.filter(p => String(p.id) !== selectedLeft));
      setSelectedLeft(null);
      toast.success('Đã xác nhận');
      router.refresh();
    } catch (err: any) { toast.error(err.message || 'Lỗi'); }
    setProcessing(false);
  }

  /** Reject payment */
  async function handleReject() {
    if (!selectedLeft) return;
    setProcessing(true);
    try {
      await api.post(`/payments/${selectedLeft}/reject`);
      setPending(prev => prev.filter(p => String(p.id) !== selectedLeft));
      setSelectedLeft(null);
      toast.success('Đã từ chối');
      router.refresh();
    } catch (err: any) { toast.error(err.message || 'Lỗi'); }
    setProcessing(false);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Đối soát thanh toán</h1>
      <p className="text-sm text-gray-500 mb-4">Tick 1 bên trái + 1 bên phải → Xác minh ghép cặp</p>

      <Tabs defaultValue="reconcile">
        <TabsList>
          <TabsTrigger value="reconcile">Chờ xử lý ({pending.length + unmatched.length})</TabsTrigger>
          <TabsTrigger value="verified">Đã xác minh ({verifiedPayments.length})</TabsTrigger>
        </TabsList>

        {/* ── Tab: Chờ xử lý ── */}
        <TabsContent value="reconcile">
          {/* Action bar */}
          <div className="flex items-center gap-3 my-3 min-h-[40px]">
            {processing ? (
              <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
            ) : canMatch ? (
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleMatch}>
                <CheckCircle className="h-4 w-4 mr-1" />Xác minh ghép cặp
              </Button>
            ) : selectedLeft && !selectedRight ? (
              <div className="flex gap-2">
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleVerifyOnly}>
                  <CheckCircle className="h-4 w-4 mr-1" />Xác nhận (không cần match)
                </Button>
                <Button variant="outline" className="text-red-600 border-red-200" onClick={handleReject}>
                  <XCircle className="h-4 w-4 mr-1" />Từ chối
                </Button>
              </div>
            ) : (
              <span className="text-sm text-gray-400">Chọn khoản thanh toán để xử lý</span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Left: Pending payments (sale nhập) */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400" />Sale nhập — chờ duyệt ({pending.length})
              </h3>
              {pending.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">Không có</div>
              ) : (
                <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                  {pending.map((p: any) => {
                    const id = String(p.id);
                    const selected = selectedLeft === id;
                    return (
                      <label key={id} className={cn('flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 cursor-pointer transition-all',
                        selected ? 'border-sky-400 bg-sky-50 ring-1 ring-sky-400' : 'border-gray-200 hover:border-gray-300')}>
                        <input type="checkbox" checked={selected} onChange={() => setSelectedLeft(selected ? null : id)}
                          className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold text-gray-900">{formatVND(Number(p.amount))}</span>
                            {p.paymentType?.name && <span className="text-xs text-sky-600">{p.paymentType.name}</span>}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            Đơn #{p.orderId} · {formatDate(p.createdAt)}
                            {p.transferContent && <> · <span className="text-gray-700">{p.transferContent}</span></>}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Unmatched bank transactions */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-400" />Ngân hàng — chưa match ({unmatched.length})
              </h3>
              {unmatched.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">Tất cả đã match</div>
              ) : (
                <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                  {unmatched.map((tx: any) => {
                    const id = String(tx.id);
                    const selected = selectedRight === id;
                    return (
                      <label key={id} className={cn('flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 cursor-pointer transition-all',
                        selected ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400' : 'border-gray-200 hover:border-gray-300')}>
                        <input type="checkbox" checked={selected} onChange={() => setSelectedRight(selected ? null : id)}
                          className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold text-gray-900">{formatVND(Number(tx.amount))}</span>
                            {tx.senderName && <span className="text-xs text-gray-500">{tx.senderName}</span>}
                          </div>
                          <div className="text-xs text-gray-700 mt-0.5">{tx.content}</div>
                          <div className="text-xs text-gray-400">{formatDate(tx.transactionTime)}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Tab: Đã xác minh ── */}
        <TabsContent value="verified">
          {verifiedPayments.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400 mt-2">Chưa có</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white mt-2">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">#</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-500">Số tiền</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Loại</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Nội dung CK</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Nguồn</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-500">Xác nhận</th>
                  </tr>
                </thead>
                <tbody>
                  {verifiedPayments.map((p: any) => (
                    <tr key={p.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-3 text-gray-500">#{p.id}</td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatVND(Number(p.amount))}</td>
                      <td className="px-4 py-3 text-gray-600">{p.paymentType?.name || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{p.transferContent || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.verifiedSource === 'AUTO' ? 'bg-sky-100 text-sky-700' : 'bg-purple-100 text-purple-700'}`}>
                          {p.verifiedSource === 'AUTO' ? 'Auto' : 'Thủ công'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{formatDate(p.verifiedAt)} {p.verifier?.name && `· ${p.verifier.name}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
