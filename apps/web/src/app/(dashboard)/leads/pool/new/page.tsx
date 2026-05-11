import { Suspense } from 'react';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import { LeadPoolTableWithBulkAssign } from '@/components/leads/lead-pool-table-with-bulk-assign';
import { LeadListAdvancedFilterBar } from '@/components/leads/lead-list-advanced-filter-bar';
import { CreateLeadDialog } from '@/components/leads/create-lead-dialog';
import type { LeadRecord, NamedEntity, LabelEntity } from '@/types/entities';

/** Kho Mới: POOL leads with no department (manager+ only). */
export default async function PoolNewPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const qp = new URLSearchParams(params);
  qp.delete('cursor');
  const query = qp.toString();

  const currentUser = await getCurrentUser();
  const isManager = ['SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role || '');

  let data: LeadRecord[] = [];
  let sources: NamedEntity[] = [];
  let products: NamedEntity[] = [];
  let users: NamedEntity[] = [];
  let departments: NamedEntity[] = [];
  let labels: LabelEntity[] = [];
  try {
    const [leadsRes, srcRes, prodRes, usrRes, deptRes, lblRes] = await Promise.all([
      serverFetch<{ data: LeadRecord[] }>(`/leads/pool/new${query ? `?${query}` : ''}`),
      serverFetch<{ data: NamedEntity[] }>('/lead-sources').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/products').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/users').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/departments').catch(() => ({ data: [] })),
      serverFetch<{ data: LabelEntity[] }>('/labels').catch(() => ({ data: [] })),
    ]);
    data = leadsRes.data;
    sources = (srcRes.data || []).map((s: NamedEntity) => ({ id: String(s.id), name: s.name }));
    products = (prodRes.data || []).map((p: NamedEntity) => ({ id: String(p.id), name: p.name }));
    users = (usrRes.data || []).map((u: NamedEntity) => ({ id: String(u.id), name: u.name }));
    departments = (deptRes.data || []).map((d: NamedEntity) => ({ id: String(d.id), name: d.name }));
    labels = (lblRes.data || []).map((l: LabelEntity) => ({ id: String(l.id), name: l.name, color: l.color }));
  } catch { /* empty */ }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Chờ phân phối</h1>
          <p className="text-sm text-slate-500">Leads chưa phân phối + theo dõi leads đã phân gần đây</p>
        </div>
        {isManager && <CreateLeadDialog sources={sources} products={products} />}
      </div>

      <Suspense>
        <LeadListAdvancedFilterBar
          sources={sources} products={products} users={users}
          departments={departments} labels={labels}
          hideStatus showAssignedDateFilter storageKey="crm_lead_filters_pool_new"
        />
      </Suspense>

      <LeadPoolTableWithBulkAssign leads={data as unknown as Parameters<typeof LeadPoolTableWithBulkAssign>[0]['leads']} users={users} poolMode="new" />
    </div>
  );
}
