import { serverFetch } from '@/lib/auth';
import { LeadTable } from '@/components/leads/lead-table';
import type { LeadRecord } from '@/types/entities';

/** Kho phòng ban: leads POOL thuộc department của user, chờ claim. */
export default async function MyDeptPoolPage() {
  let data: LeadRecord[] = [];
  try {
    const result = await serverFetch<{ data: LeadRecord[] }>('/leads/my-dept-pool');
    data = result.data;
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Kho phân loại</h1>
      <div className="mt-4">
        <LeadTable leads={data as unknown as Parameters<typeof LeadTable>[0]['leads']} poolMode="floating" />
      </div>
    </div>
  );
}
