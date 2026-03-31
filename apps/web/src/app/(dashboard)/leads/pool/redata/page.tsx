import { serverFetch } from '@/lib/auth';
import { LeadPoolTableWithBulkAssign } from '@/components/leads/lead-pool-table-with-bulk-assign';

/** Kho Re-data: leads từ nguồn có skipPool=true, chờ xử lý riêng. */
export default async function PoolRedataPage() {
  let data: any[] = [];
  let users: any[] = [];
  try {
    const [leadsResult, usersResult] = await Promise.all([
      serverFetch<{ data: any[] }>('/leads/pool/redata'),
      serverFetch<{ data: any[] }>('/users'),
    ]);
    data = leadsResult.data;
    users = (usersResult.data || []).map((u: any) => ({ id: String(u.id), name: u.name }));
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Kho Re-data</h1>
      <p className="text-sm text-gray-500">Leads từ nguồn bỏ qua kho mới — cần xử lý riêng</p>
      <div className="mt-4">
        <LeadPoolTableWithBulkAssign leads={data} users={users} poolMode="new" />
      </div>
    </div>
  );
}
