import { serverFetch } from '@/lib/auth';
import { PaymentReconciliationClient } from '@/components/payments/payment-reconciliation-client';
import type { PaymentRecord, BankTransactionRecord } from '@/types/entities';

/** Payment reconciliation: 2-column pending + verified history. */
export default async function PaymentsPage() {
  let pendingPayments: PaymentRecord[] = [];
  let unmatchedTx: BankTransactionRecord[] = [];
  let verifiedPayments: PaymentRecord[] = [];

  try {
    const [pendingRes, txRes, verifiedRes] = await Promise.all([
      serverFetch<{ data: PaymentRecord[] }>('/payments/pending?limit=50'),
      serverFetch<{ data: BankTransactionRecord[] }>('/bank-transactions?matchStatus=UNMATCHED&limit=50').catch(() => ({ data: [] })),
      serverFetch<{ data: PaymentRecord[] }>('/payments?status=VERIFIED&limit=30').catch(() => ({ data: [] })),
    ]);
    pendingPayments = pendingRes.data || [];
    unmatchedTx = txRes.data || [];
    verifiedPayments = verifiedRes.data || [];
  } catch { /* empty */ }

  return <PaymentReconciliationClient pendingPayments={pendingPayments} unmatchedTx={unmatchedTx} verifiedPayments={verifiedPayments} />;
}
