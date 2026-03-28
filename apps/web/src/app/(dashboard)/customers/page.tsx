import { serverFetch } from '@/lib/auth';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

/** Customer list page with search. */
export default async function CustomersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const query = new URLSearchParams(params).toString();

  let data: any[] = [];
  try {
    const result = await serverFetch<{ data: any[] }>(`/customers?${query}`);
    data = result.data;
  } catch { /* empty */ }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Khách hàng</h1>
          <p className="text-sm text-gray-500">Quản lý thông tin khách hàng</p>
        </div>
        <Link href="/customers/new">
          <Button><Plus className="h-4 w-4 mr-1" />Tạo khách hàng</Button>
        </Link>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        {data.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Không có khách hàng nào</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Họ tên</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">SĐT</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Email</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Trạng thái</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Nhân viên</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Ngày tạo</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c: any) => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/customers/${c.id}`} className="font-medium text-sky-600 hover:underline">{c.name}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{c.phone}</td>
                  <td className="px-4 py-3 text-gray-600">{c.email || '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-gray-600">{c.assignedUser?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-400">{formatDate(c.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
