import { serverFetch } from '@/lib/auth';
import { LeadTable } from '@/components/leads/lead-table';

/** Kho Mới: POOL leads with no department (manager+ only). */
export default async function PoolNewPage() {
  let data: any[] = [];
  try {
    const result = await serverFetch<{ data: any[] }>('/leads/pool/new');
    data = result.data;
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Kho Mới</h1>
      <p className="text-sm text-gray-500">Leads chưa phân phối phòng ban</p>
      <div className="mt-4">
        <LeadTable leads={data} />
      </div>
    </div>
  );
}
