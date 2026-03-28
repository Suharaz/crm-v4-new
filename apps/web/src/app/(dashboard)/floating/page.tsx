import { serverFetch } from '@/lib/auth';
import { LeadTable } from '@/components/leads/lead-table';

/** Kho Thả Nổi: FLOATING leads visible to ALL users. */
export default async function FloatingPoolPage() {
  let data: any[] = [];
  try {
    const result = await serverFetch<{ data: any[] }>('/leads/pool/floating');
    data = result.data;
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Kho Thả Nổi</h1>
      <p className="text-sm text-gray-500">Leads và khách hàng thả nổi — bất kỳ ai cũng có thể claim</p>
      <div className="mt-4">
        <LeadTable leads={data} />
      </div>
    </div>
  );
}
