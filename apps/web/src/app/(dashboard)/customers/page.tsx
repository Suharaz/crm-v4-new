import { serverFetch } from '@/lib/auth';
import { PaginationControls } from '@/components/shared/pagination-controls';
import { CustomerTableWithPreview } from '@/components/customers/customer-table-with-preview';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CsvExportButton } from '@/components/shared/csv-export-button';

/** Customer list page with search. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const query = new URLSearchParams(params).toString();

  let data: any[] = [];
  let nextCursor: string | undefined;
  try {
    const result = await serverFetch<{ data: any[]; nextCursor?: string }>(`/customers?${query}`);
    data = result.data;
    nextCursor = result.nextCursor;
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
          <Link href="/customers/new">
            <Button><Plus className="h-4 w-4 mr-1" />Tạo khách hàng</Button>
          </Link>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <CustomerTableWithPreview customers={data} />
      </div>
      <PaginationControls nextCursor={nextCursor} />
    </div>
  );
}
