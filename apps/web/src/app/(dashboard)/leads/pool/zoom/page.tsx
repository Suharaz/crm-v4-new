import { Suspense } from 'react';
import { serverFetch } from '@/lib/auth';
import { LeadPoolTableWithBulkAssign } from '@/components/leads/lead-pool-table-with-bulk-assign';
import { LeadListAdvancedFilterBar } from '@/components/leads/lead-list-advanced-filter-bar';
import { LeadLabelQuickFilters } from '@/components/leads/lead-label-quick-filters';
import type { LeadRecord, NamedEntity, LabelEntity } from '@/types/entities';

/** Kho Zoom: leads từ nguồn có skipPool=true, chờ xử lý riêng. */
export default async function PoolZoomPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const qp = new URLSearchParams(params);
  qp.delete('cursor');
  const query = qp.toString();

  let data: LeadRecord[] = [];
  let sources: NamedEntity[] = [];
  let products: NamedEntity[] = [];
  let users: NamedEntity[] = [];
  let departments: NamedEntity[] = [];
  let labels: LabelEntity[] = [];
  try {
    const [leadsRes, srcRes, prodRes, usrRes, deptRes, lblRes] = await Promise.all([
      serverFetch<{ data: LeadRecord[] }>(`/leads/pool/zoom${query ? `?${query}` : ''}`),
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
    labels = (lblRes.data || []).map((l: LabelEntity) => ({ id: String(l.id), name: l.name, color: l.color, textColor: l.textColor || '#ffffff' }));
  } catch { /* empty */ }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Kho Zoom</h1>
        <p className="text-sm text-slate-500">Leads từ nguồn bỏ qua kho mới - cần xử lý riêng</p>
      </div>

      <Suspense>
        <LeadListAdvancedFilterBar
          sources={sources} products={products} users={users}
          departments={departments} labels={labels}
          hideStatus showAssignedDateFilter storageKey="crm_lead_filters_pool_zoom"
        />
      </Suspense>

      <Suspense>
        <LeadLabelQuickFilters scope="pool-zoom" />
      </Suspense>

      <LeadPoolTableWithBulkAssign
        leads={data as unknown as Parameters<typeof LeadPoolTableWithBulkAssign>[0]['leads']}
        users={users}
        poolMode="zoom"
        departments={departments}
      />
    </div>
  );
}
