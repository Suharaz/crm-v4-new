import { serverFetch } from '@/lib/auth';
import { PaymentApprovalClient } from '@/components/payments/payment-approval-client';

/** Payment approval page — manager reviews and verifies/rejects pending payments. */
export default async function PaymentsPage() {
  let payments: any[] = [];
  try {
    const res = await serverFetch<{ data: any[] }>('/payments/pending?limit=50');
    payments = res.data || [];
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Duyệt thanh toán</h1>
      <p className="text-sm text-gray-500 mb-4">Xác nhận hoặc từ chối các khoản thanh toán chờ duyệt</p>
      <PaymentApprovalClient payments={payments} />
    </div>
  );
}
