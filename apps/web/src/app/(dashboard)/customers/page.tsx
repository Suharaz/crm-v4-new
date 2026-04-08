import { serverFetch, getCurrentUser } from '@/lib/auth';
import { PaginationControls } from '@/components/shared/pagination-controls';
import { CustomerTableWithPreview } from '@/components/customers/customer-table-with-preview';
import { CustomerListAdvancedFilterBar } from '@/components/customers/customer-list-advanced-filter-bar';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CsvExportButton } from '@/components/shared/csv-export-button';

/** Customer list page with advanced filters. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const query = new URLSearchParams(params).toString();

  const currentUser = await getCurrentUser();
  const isManager = ['SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role || '');

  let data: any[] = [];
  let nextCursor: string | undefined;
  let departments: any[] = [];
  let users: any[] = [];
  let labels: any[] = [];

  try {
    const [result, deptRes, usersRes, labelsRes] = await Promise.all([
      serverFetch<{ data: any[]; meta?: { nextCursor?: string } }>(`/customers?${query}`),
      serverFetch<{ data: any[] }>('/departments').catch(() => ({ data: [] })),
      serverFetch<{ data: any[] }>('/users').catch(() => ({ data: [] })),
      serverFetch<{ data: any[] }>('/labels').catch(() => ({ data: [] })),
    ]);
    data = result.data;
    nextCursor = result.meta?.nextCursor;
    departments = (deptRes.data || []).map((d: any) => ({ id: String(d.id), name: d.name }));
    users = (usersRes.data || []).map((u: any) => ({ id: String(u.id), name: u.name }));
    labels = (labelsRes.data || []).map((l: any) => ({ id: String(l.id), name: l.name, color: l.color || '#6b7280' }));
  } catch { /* empty */ }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Khách hàng</h1>
          <p className="text-sm text-gray-500">Quản lý thông tin khách hàng</p>
        </div>
        <div className="flex gap-2">
          <CsvExportButton exportPath="/exports/customers" />
          {isManager && (
            <Link href="/customers/new">
              <Button><Plus className="h-4 w-4 mr-1" />Tạo khách hàng</Button>
            </Link>
          )}
        </div>
      </div>

      <div className="mt-4">
        <CustomerListAdvancedFilterBar departments={departments} users={users} labels={labels} />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <CustomerTableWithPreview customers={data} />
      </div>
      <PaginationControls nextCursor={nextCursor} />
    </div>
  );
}
