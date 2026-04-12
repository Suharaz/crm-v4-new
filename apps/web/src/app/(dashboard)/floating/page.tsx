import { serverFetch } from '@/lib/auth';
import { LeadPoolTableWithBulkAssign } from '@/components/leads/lead-pool-table-with-bulk-assign';
import type { LeadRecord, NamedEntity } from '@/types/entities';

/** Kho Thả Nổi: FLOATING leads visible to ALL users. */
export default async function FloatingPoolPage() {
  let data: LeadRecord[] = [];
  let users: NamedEntity[] = [];
  try {
    const [leadsResult, usersResult] = await Promise.all([
      serverFetch<{ data: LeadRecord[] }>('/leads/pool/floating'),
      serverFetch<{ data: NamedEntity[] }>('/users').catch(() => ({ data: [] })),
    ]);
    data = leadsResult.data;
    users = (usersResult.data || []).map((u: NamedEntity) => ({ id: String(u.id), name: u.name }));
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Kho Thả Nổi</h1>
      <p className="text-sm text-slate-500">Leads thả nổi — bất kỳ ai cũng có thể nhận, manager phân hàng loạt</p>
      <div className="mt-4">
        <LeadPoolTableWithBulkAssign leads={data as unknown as Parameters<typeof LeadPoolTableWithBulkAssign>[0]['leads']} users={users} poolMode="floating" />
      </div>
    </div>
  );
}
