import { serverFetch } from '@/lib/auth';
import { LeadPoolTableWithBulkAssign } from '@/components/leads/lead-pool-table-with-bulk-assign';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

/** Kho Mới: POOL leads with no department (manager+ only). */
export default async function PoolNewPage() {
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
          <p className="text-sm text-gray-500">Leads chưa phân phối phòng ban — chọn checkbox để phân hàng loạt</p>
        </div>
        <Link href="/leads/new">
          <Button><Plus className="h-4 w-4 mr-1" />Tạo Lead</Button>
        </Link>
      </div>
      <div className="mt-4">
        <LeadPoolTableWithBulkAssign leads={data} users={users} poolMode="new" />
      </div>
    </div>
  );
}
