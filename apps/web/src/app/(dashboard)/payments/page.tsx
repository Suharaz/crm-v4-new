import { serverFetch } from '@/lib/auth';
import { PaymentReconciliationClient } from '@/components/payments/payment-reconciliation-client';
import type { PaymentRecord, BankTransactionRecord, NamedEntity } from '@/types/entities';

/** Payment reconciliation: 2-column pending + verified history. */
export default async function PaymentsPage() {
  let pendingPayments: PaymentRecord[] = [];
  let unmatchedTx: BankTransactionRecord[] = [];
  let verifiedPayments: PaymentRecord[] = [];
  let paymentTypes: NamedEntity[] = [];

  try {
    const [pendingRes, txRes, verifiedRes, typesRes] = await Promise.all([
      serverFetch<{ data: PaymentRecord[] }>('/payments/pending?limit=50'),
      serverFetch<{ data: BankTransactionRecord[] }>('/bank-transactions?matchStatus=UNMATCHED&limit=50').catch(() => ({ data: [] })),
      serverFetch<{ data: PaymentRecord[] }>('/payments?status=VERIFIED&limit=50').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/payment-types?limit=100').catch(() => ({ data: [] })),
    ]);
    pendingPayments = pendingRes.data || [];
    unmatchedTx = txRes.data || [];
    verifiedPayments = verifiedRes.data || [];
    paymentTypes = typesRes.data || [];
  } catch { /* empty */ }

  return (
    <PaymentReconciliationClient
      pendingPayments={pendingPayments}
      unmatchedTx={unmatchedTx}
      verifiedPayments={verifiedPayments}
      paymentTypes={paymentTypes}
    />
  );
}
