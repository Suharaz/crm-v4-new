'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { api } from '@/lib/api-client';
import { formatDate, formatVND } from '@/lib/utils';
import { CheckCircle, XCircle, Loader2, Link2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  pendingPayments: any[];
  unmatchedTx: any[];
  verifiedPayments: any[];
}

/** 2-column reconciliation: pending payments vs unmatched bank transactions + verified history. */
export function PaymentReconciliationClient({ pendingPayments: initPending, unmatchedTx: initTx, verifiedPayments }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(initPending);
  const [unmatched, setUnmatched] = useState(initTx);
  const [processing, setProcessing] = useState<string | null>(null);
  const [matchingTx, setMatchingTx] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState('');

  async function verify(id: string) {
    setProcessing(id);
    try {
      await api.post(`/payments/${id}/verify`);
      setPending(prev => prev.filter(p => String(p.id) !== id));
      toast.success('Đã xác nhận');
      router.refresh();
    } catch (err: any) { toast.error(err.message || 'Lỗi'); }
    setProcessing(null);
  }

  async function reject(id: string) {
    setProcessing(id);
    try {
      await api.post(`/payments/${id}/reject`);
      setPending(prev => prev.filter(p => String(p.id) !== id));
      toast.success('Đã từ chối');
      router.refresh();
    } catch (err: any) { toast.error(err.message || 'Lỗi'); }
    setProcessing(null);
  }

  async function matchTx(txId: string) {
    if (!selectedPayment) { toast.error('Chọn thanh toán cần match'); return; }
    setProcessing(txId);
    try {
      await api.post(`/bank-transactions/${txId}/match`, { paymentId: selectedPayment });
      setUnmatched(prev => prev.filter(t => String(t.id) !== txId));
      setPending(prev => prev.filter(p => String(p.id) !== selectedPayment));
      setMatchingTx(null);
      setSelectedPayment('');
      toast.success('Đã match + xác nhận');
      router.refresh();
    } catch (err: any) { toast.error(err.message || 'Lỗi'); }
    setProcessing(null);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Đối soát thanh toán</h1>
      <p className="text-sm text-gray-500 mb-4">Duyệt CK do sale nhập · Match giao dịch ngân hàng · Lịch sử đã xác minh</p>

      <Tabs defaultValue="reconcile">
        <TabsList>
          <TabsTrigger value="reconcile">Chờ xử lý ({pending.length + unmatched.length})</TabsTrigger>
          <TabsTrigger value="verified">Đã xác minh ({verifiedPayments.length})</TabsTrigger>
        </TabsList>

        {/* ── Tab: Chờ xử lý — 2 cột ── */}
        <TabsContent value="reconcile">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mt-2">
            {/* Left: Pending payments (user nhập) */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400" />Sale nhập ({pending.length})
              </h3>
              {pending.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">Không có CK chờ duyệt</div>
              ) : (
                <div className="space-y-2">
                  {pending.map((p: any) => (
                    <div key={p.id} className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <span className="text-lg font-bold text-gray-900">{formatVND(Number(p.amount))}</span>
                          {p.paymentType?.name && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs text-sky-700">{p.paymentType.name}</span>}
                          <div className="mt-1 text-xs text-gray-500">
                            Đơn #{p.orderId} · {formatDate(p.createdAt)}
                            {p.transferContent && <> · <span className="text-gray-700">{p.transferContent}</span></>}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0 ml-2">
                          {processing === String(p.id) ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                            <>
                              <Button size="sm" variant="ghost" className="h-8 text-red-600" onClick={() => reject(String(p.id))}><XCircle className="h-4 w-4" /></Button>
                              <Button size="sm" className="h-8 bg-emerald-600 hover:bg-emerald-700" onClick={() => verify(String(p.id))}><CheckCircle className="h-4 w-4" /></Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Unmatched bank transactions (từ API) */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-400" />Ngân hàng chưa match ({unmatched.length})
              </h3>
              {unmatched.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">Tất cả giao dịch đã match</div>
              ) : (
                <div className="space-y-2">
                  {unmatched.map((tx: any) => (
                    <div key={tx.id} className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <span className="text-lg font-bold text-gray-900">{formatVND(Number(tx.amount))}</span>
                          <div className="mt-1 text-xs text-gray-500">
                            {formatDate(tx.transactionTime)}
                            {tx.senderName && <> · {tx.senderName}</>}
                          </div>
                          <div className="text-xs text-gray-700 mt-0.5">{tx.content}</div>
                        </div>
                        <Button size="sm" variant="outline" className="h-8 shrink-0 ml-2" onClick={() => { setMatchingTx(matchingTx === String(tx.id) ? null : String(tx.id)); setSelectedPayment(''); }}>
                          <Link2 className="h-3.5 w-3.5 mr-1" />Match
                        </Button>
                      </div>
                      {matchingTx === String(tx.id) && (
                        <div className="mt-2 flex items-end gap-2 border-t border-gray-100 pt-2">
                          <div className="flex-1">
                            <Select value={selectedPayment} onValueChange={setSelectedPayment}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Chọn CK chờ duyệt..." /></SelectTrigger>
                              <SelectContent>
                                {pending.map((p: any) => (
                                  <SelectItem key={p.id} value={String(p.id)}>
                                    #{p.id} — {formatVND(Number(p.amount))} {p.transferContent || ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button size="sm" className="h-8" disabled={!selectedPayment || processing === String(tx.id)} onClick={() => matchTx(String(tx.id))}>
                            <ArrowRight className="h-3.5 w-3.5 mr-1" />{processing === String(tx.id) ? '...' : 'Ghép'}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Tab: Đã xác minh ── */}
        <TabsContent value="verified">
          {verifiedPayments.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400 mt-2">Chưa có giao dịch đã xác minh</div>
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
                      <td className="px-4 py-3 text-xs text-gray-400">
                        {formatDate(p.verifiedAt)} {p.verifier?.name && `· ${p.verifier.name}`}
                      </td>
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
