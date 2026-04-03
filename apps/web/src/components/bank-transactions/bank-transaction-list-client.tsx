'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api-client';
import { formatDate, formatVND } from '@/lib/utils';
import { Link2, CheckCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Props {
  transactions: any[];
  pendingPayments: any[];
}

export function BankTransactionListClient({ transactions, pendingPayments }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | 'UNMATCHED' | 'MATCHED'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState('');

  const filtered = filter === 'all' ? transactions : transactions.filter(t => t.matchStatus === filter);

  async function handleMatch(txId: string) {
    if (!selectedPayment) { toast.error('Chọn thanh toán cần match'); return; }
    setMatching(true);
    try {
      await api.post(`/bank-transactions/${txId}/match`, { paymentId: selectedPayment });
      toast.success('Đã match giao dịch');
      setExpandedId(null);
      setSelectedPayment('');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi match');
    }
    setMatching(false);
  }

  const unmatchedCount = transactions.filter(t => t.matchStatus === 'UNMATCHED').length;

  return (
    <div>
      {/* Filter + stats */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex rounded-lg border border-gray-200 bg-white p-0.5">
          {(['all', 'UNMATCHED', 'MATCHED'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                filter === f ? 'bg-sky-500 text-white' : 'text-gray-600 hover:bg-gray-100')}>
              {f === 'all' ? 'Tất cả' : f === 'UNMATCHED' ? `Chưa khớp (${unmatchedCount})` : 'Đã khớp'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">Không có giao dịch nào</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Thời gian</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Số tiền</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Nội dung CK</th>
                <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-gray-500">Người gửi</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx: any) => {
                const isExpanded = expandedId === String(tx.id);
                const isUnmatched = tx.matchStatus === 'UNMATCHED';
                return (
                  <TxRow key={tx.id} tx={tx} isExpanded={isExpanded} isUnmatched={isUnmatched}
                    onToggle={() => { setExpandedId(isExpanded ? null : String(tx.id)); setSelectedPayment(''); }}
                    pendingPayments={pendingPayments} selectedPayment={selectedPayment}
                    onSelectPayment={setSelectedPayment} onMatch={() => handleMatch(String(tx.id))} matching={matching} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TxRow({ tx, isExpanded, isUnmatched, onToggle, pendingPayments, selectedPayment, onSelectPayment, onMatch, matching }: {
  tx: any; isExpanded: boolean; isUnmatched: boolean; onToggle: () => void;
  pendingPayments: any[]; selectedPayment: string; onSelectPayment: (v: string) => void;
  onMatch: () => void; matching: boolean;
}) {
  return (
    <>
      <tr className={cn('border-b border-gray-100 hover:bg-gray-50', isUnmatched && 'cursor-pointer', isExpanded && 'bg-sky-50/50')}
        onClick={isUnmatched ? onToggle : undefined}>
        <td className="px-4 py-3 text-gray-600">{formatDate(tx.transactionTime)}</td>
        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatVND(Number(tx.amount))}</td>
        <td className="px-4 py-3 text-gray-700 max-w-xs truncate">{tx.content}</td>
        <td className="hidden md:table-cell px-4 py-3 text-gray-500">{tx.senderName || '—'}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {tx.matchStatus === 'MATCHED' ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700"><CheckCircle className="h-3 w-3" />Đã khớp</span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"><Link2 className="h-3 w-3" />Chưa khớp</span>
            )}
            {isUnmatched && <ChevronDown size={14} className={cn('text-gray-400 transition-transform', isExpanded && 'rotate-180')} />}
          </div>
        </td>
      </tr>
      {isExpanded && isUnmatched && (
        <tr className="bg-sky-50/30">
          <td colSpan={5} className="px-6 py-4">
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Match thủ công — chọn thanh toán PENDING:</p>
              {pendingPayments.length === 0 ? (
                <p className="text-sm text-gray-400">Không có thanh toán PENDING nào</p>
              ) : (
                <div className="flex items-end gap-3">
                  <div className="flex-1 max-w-md">
                    <Select value={selectedPayment} onValueChange={onSelectPayment}>
                      <SelectTrigger><SelectValue placeholder="Chọn thanh toán..." /></SelectTrigger>
                      <SelectContent>
                        {pendingPayments.map((p: any) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            #{p.id} — {formatVND(Number(p.amount))} {p.transferContent ? `— ${p.transferContent}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={onMatch} disabled={matching || !selectedPayment}>
                    {matching ? 'Đang match...' : 'Match'}
                  </Button>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
