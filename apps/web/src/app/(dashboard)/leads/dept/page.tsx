import { serverFetch } from '@/lib/auth';
import { LeadTable } from '@/components/leads/lead-table';

/** Kho phòng ban: leads POOL thuộc department của user, chờ claim. */
export default async function MyDeptPoolPage() {
  let data: any[] = [];
  try {
    const result = await serverFetch<{ data: any[] }>('/leads/my-dept-pool');
    data = result.data;
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Kho phòng ban</h1>
      <p className="text-sm text-gray-500">Leads trong kho phòng ban của bạn — có thể nhận (claim)</p>
      <div className="mt-4">
        <LeadTable leads={data} poolMode="floating" />
      </div>
    </div>
  );
}
