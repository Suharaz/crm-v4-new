import { serverFetch } from '@/lib/auth';
import { PaymentReconciliationClient } from '@/components/payments/payment-reconciliation-client';

/** Payment reconciliation: 2-column pending + verified history. */
export default async function PaymentsPage() {
  let pendingPayments: any[] = [];
  let unmatchedTx: any[] = [];
  let verifiedPayments: any[] = [];

  try {
    const [pendingRes, txRes, verifiedRes] = await Promise.all([
      serverFetch<{ data: any[] }>('/payments/pending?limit=50'),
      serverFetch<{ data: any[] }>('/bank-transactions?matchStatus=UNMATCHED&limit=50').catch(() => ({ data: [] })),
      serverFetch<{ data: any[] }>('/payments?status=VERIFIED&limit=30').catch(() => ({ data: [] })),
    ]);
    pendingPayments = pendingRes.data || [];
    unmatchedTx = txRes.data || [];
    verifiedPayments = verifiedRes.data || [];
  } catch { /* empty */ }

  return <PaymentReconciliationClient pendingPayments={pendingPayments} unmatchedTx={unmatchedTx} verifiedPayments={verifiedPayments} />;
}
