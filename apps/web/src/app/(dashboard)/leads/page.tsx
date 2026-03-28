import { serverFetch } from '@/lib/auth';
import { LeadTable } from '@/components/leads/lead-table';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { CsvExportButton } from '@/components/shared/csv-export-button';

/** Lead list page — shows all leads with filters. */
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const query = new URLSearchParams(params).toString();

  let data: any[] = [];
  try {
    const result = await serverFetch<{ data: any[] }>(`/leads?${query}`);
    data = result.data;
  } catch { /* empty list on error */ }

  return (
    <div>
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
          <Link href="/leads/pool/new">
            <Button variant="outline" size="sm">Kho Mới</Button>
          </Link>
          <Link href="/floating">
            <Button variant="outline" size="sm">Thả Nổi</Button>
          </Link>
        </div>
      </div>
      <div className="mt-4">
        <LeadTable leads={data} />
      </div>
    </div>
  );
}
