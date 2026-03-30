import { serverFetch } from '@/lib/auth';
import { LeadPoolTableWithBulkAssign } from '@/components/leads/lead-pool-table-with-bulk-assign';

/** Kho Thả Nổi: FLOATING leads visible to ALL users. */
export default async function FloatingPoolPage() {
  let data: any[] = [];
  let users: any[] = [];
  try {
    const [leadsResult, usersResult] = await Promise.all([
      serverFetch<{ data: any[] }>('/leads/pool/floating'),
      serverFetch<{ data: any[] }>('/users').catch(() => ({ data: [] })),
    ]);
    data = leadsResult.data;
    users = (usersResult.data || []).map((u: any) => ({ id: String(u.id), name: u.name }));
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Kho Thả Nổi</h1>
      <p className="text-sm text-gray-500">Leads thả nổi — bất kỳ ai cũng có thể nhận, manager phân hàng loạt</p>
      <div className="mt-4">
        <LeadPoolTableWithBulkAssign leads={data} users={users} poolMode="floating" />
      </div>
    </div>
  );
}
