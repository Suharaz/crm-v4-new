import { Suspense } from 'react';
import { serverFetch, getCurrentUser } from '@/lib/auth';
import type { LeadRecord, NamedEntity, LabelEntity, ApiListResponse } from '@/types/entities';
import { LeadListAdvancedFilterBar } from '@/components/leads/lead-list-advanced-filter-bar';
import { PaginationControls } from '@/components/shared/pagination-controls';
import { LeadListWithViewToggle } from '@/components/leads/lead-list-with-view-toggle';
import { CreateLeadDialog } from '@/components/leads/create-lead-dialog';
import { CsvExportButton } from '@/components/shared/csv-export-button';

/** Lead list page — table or kanban view with deep filters. */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const qp = new URLSearchParams(params);
  qp.delete('cursor');
  const query = qp.toString();

  const currentUser = await getCurrentUser();
  const isManager = ['SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role || '');

  let data: LeadRecord[] = [];
  let meta: ApiListResponse<LeadRecord>['meta'] = {};
  let sources: NamedEntity[] = [];
  let products: NamedEntity[] = [];
  let users: NamedEntity[] = [];
  let departments: NamedEntity[] = [];
  let labels: LabelEntity[] = [];

  try {
    const [leadsRes, srcRes, prodRes, usrRes, deptRes, lblRes] = await Promise.all([
      serverFetch<ApiListResponse<LeadRecord>>(`/leads?${query}`),
      serverFetch<{ data: NamedEntity[] }>('/lead-sources').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/products').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/users').catch(() => ({ data: [] })),
      serverFetch<{ data: NamedEntity[] }>('/departments').catch(() => ({ data: [] })),
      serverFetch<{ data: LabelEntity[] }>('/labels').catch(() => ({ data: [] })),
    ]);
    data = leadsRes.data;
    meta = leadsRes.meta;
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
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        </div>
        <div className="flex gap-2">
          <CsvExportButton exportPath="/exports/leads" />
          {isManager && <CreateLeadDialog sources={sources} products={products} />}
        </div>
      </div>

      <Suspense>
        <LeadListAdvancedFilterBar
          sources={sources} products={products} users={users}
          departments={departments} labels={labels}
        />
      </Suspense>

      <LeadListWithViewToggle leads={data} allLabels={labels} />
      <PaginationControls total={meta?.total} page={meta?.page} limit={meta?.limit} totalPages={meta?.totalPages} />
    </div>
  );
}
