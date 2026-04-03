import { serverFetch } from '@/lib/auth';
import { BankTransactionListClient } from '@/components/bank-transactions/bank-transaction-list-client';

/** Bank transactions page — view unmatched, match manually. */
export default async function BankTransactionsPage() {
  let transactions: any[] = [];
  let pendingPayments: any[] = [];

  try {
    const [txRes, payRes] = await Promise.all([
      serverFetch<{ data: any[] }>('/bank-transactions?limit=50'),
      serverFetch<{ data: any[] }>('/payments?status=PENDING').catch(() => ({ data: [] })),
    ]);
    transactions = txRes.data || [];
    pendingPayments = payRes.data || [];
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Giao dịch ngân hàng</h1>
      <p className="text-sm text-gray-500 mb-4">Đối soát giao dịch — match thủ công các khoản chưa khớp</p>
      <BankTransactionListClient transactions={transactions} pendingPayments={pendingPayments} />
    </div>
  );
}
