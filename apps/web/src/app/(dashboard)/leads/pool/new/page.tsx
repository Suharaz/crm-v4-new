import { serverFetch, getCurrentUser } from '@/lib/auth';
import { LeadPoolTableWithBulkAssign } from '@/components/leads/lead-pool-table-with-bulk-assign';
import { CreateLeadDialog } from '@/components/leads/create-lead-dialog';

/** Kho Mới: POOL leads with no department (manager+ only). */
export default async function PoolNewPage() {
  const currentUser = await getCurrentUser();
  const isManager = ['SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role || '');

  let data: any[] = [];
  let users: any[] = [];
  try {
    const [leadsResult, usersResult] = await Promise.all([
      serverFetch<{ data: any[] }>('/leads/pool/new'),
      serverFetch<{ data: any[] }>('/users'),
    ]);
    data = leadsResult.data;
    users = (usersResult.data || []).map((u: any) => ({ id: String(u.id), name: u.name }));
  } catch { /* empty */ }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chờ phân phối</h1>
          <p className="text-sm text-gray-500">Leads chưa phân phối + theo dõi leads đã phân gần đây</p>
        </div>
        {isManager && <CreateLeadDialog />}
      </div>
      <div className="mt-4">
        <LeadPoolTableWithBulkAssign leads={data} users={users} poolMode="new" />
      </div>
    </div>
  );
}
