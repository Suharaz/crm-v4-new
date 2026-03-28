'use client';

import Link from 'next/link';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils';

interface Lead {
  id: string; name: string; phone: string; email?: string | null;
  status: string; source?: { name: string } | null;
  assignedUser?: { name: string } | null;
  department?: { name: string } | null;
  createdAt: string;
}

export function LeadTable({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">Không có lead nào</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Họ tên</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">SĐT</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Trạng thái</th>
            <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-gray-500">Nguồn</th>
            <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-gray-500">Nhân viên</th>
            <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-gray-500">Ngày tạo</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} className="border-b border-gray-100 hover:bg-gray-50 last:border-0">
              <td className="px-4 py-3">
                <Link href={`/leads/${lead.id}`} className="font-medium text-sky-600 hover:underline">
                  {lead.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-600">{lead.phone}</td>
              <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
              <td className="hidden md:table-cell px-4 py-3 text-gray-600">{lead.source?.name || '—'}</td>
              <td className="hidden md:table-cell px-4 py-3 text-gray-600">{lead.assignedUser?.name || '—'}</td>
              <td className="hidden lg:table-cell px-4 py-3 text-gray-400">{formatDate(lead.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
