import { Suspense } from 'react';
import { serverFetch } from '@/lib/auth';
import { LeadTable } from '@/components/leads/lead-table';
import { LeadListAdvancedFilterBar } from '@/components/leads/lead-list-advanced-filter-bar';
import { PaginationControls } from '@/components/shared/pagination-controls';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CsvExportButton } from '@/components/shared/csv-export-button';

/** Lead list page — shows all leads with deep filters. */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const query = new URLSearchParams(params).toString();

  let data: any[] = [];
  let nextCursor: string | undefined;
  let sources: any[] = [];
  let products: any[] = [];
  let users: any[] = [];
  let departments: any[] = [];
  let labels: any[] = [];

  try {
    const [leadsRes, srcRes, prodRes, usrRes, deptRes, lblRes] = await Promise.all([
      serverFetch<{ data: any[]; meta?: any }>(`/leads?${query}`),
      serverFetch<{ data: any[] }>('/lead-sources').catch(() => ({ data: [] })),
      serverFetch<{ data: any[] }>('/products').catch(() => ({ data: [] })),
      serverFetch<{ data: any[] }>('/users').catch(() => ({ data: [] })),
      serverFetch<{ data: any[] }>('/departments').catch(() => ({ data: [] })),
      serverFetch<{ data: any[] }>('/labels').catch(() => ({ data: [] })),
    ]);
    data = leadsRes.data;
    nextCursor = leadsRes.meta?.nextCursor;
    sources = (srcRes.data || []).map((s: any) => ({ id: String(s.id), name: s.name }));
    products = (prodRes.data || []).map((p: any) => ({ id: String(p.id), name: p.name }));
    users = (usrRes.data || []).map((u: any) => ({ id: String(u.id), name: u.name }));
    departments = (deptRes.data || []).map((d: any) => ({ id: String(d.id), name: d.name }));
    labels = (lblRes.data || []).map((l: any) => ({ id: String(l.id), name: l.name, color: l.color }));
  } catch { /* empty */ }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
          <p className="text-sm text-gray-500">Quản lý leads và phân phối</p>
        </div>
        <div className="flex gap-2">
          <CsvExportButton exportPath="/exports/leads" />
          <Link href="/leads/new">
            <Button><Plus className="h-4 w-4 mr-1" />Tạo Lead</Button>
          </Link>
        </div>
      </div>

      <Suspense>
        <LeadListAdvancedFilterBar
          sources={sources} products={products} users={users}
          departments={departments} labels={labels}
        />
      </Suspense>

      <LeadTable leads={data} />
      <PaginationControls nextCursor={nextCursor} />
    </div>
  );
}
