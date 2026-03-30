'use client';

import { useState } from 'react';
import { StatusBadge } from '@/components/shared/status-badge';
import { EntityQuickPreviewDialog } from '@/components/shared/entity-quick-preview-dialog';
import { formatDate } from '@/lib/utils';

interface Customer {
  id: string; name: string; phone: string; email?: string | null;
  status: string; assignedUser?: { name: string } | null;
  createdAt: string;
}

/** Customer list table with quick-preview popup on name click. */
export function CustomerTableWithPreview({ customers }: { customers: Customer[] }) {
  const [previewId, setPreviewId] = useState<string | null>(null);

  if (customers.length === 0) {
    return <div className="p-8 text-center text-gray-400">Không có khách hàng nào</div>;
  }

  return (
    <>
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Họ tên</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">SĐT</th>
            <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-gray-500">Email</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Trạng thái</th>
            <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-gray-500">Nhân viên</th>
            <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-gray-500">Ngày tạo</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 last:border-0">
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setPreviewId(c.id)}
                  className="font-medium text-sky-600 hover:underline text-left"
                >
                  {c.name}
                </button>
              </td>
              <td className="px-4 py-3 text-gray-600">{c.phone}</td>
              <td className="hidden md:table-cell px-4 py-3 text-gray-600">{c.email || '—'}</td>
              <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
              <td className="hidden md:table-cell px-4 py-3 text-gray-600">{c.assignedUser?.name || '—'}</td>
              <td className="hidden lg:table-cell px-4 py-3 text-gray-400">{formatDate(c.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <EntityQuickPreviewDialog
        open={!!previewId}
        onOpenChange={(open) => { if (!open) setPreviewId(null); }}
        entityType="customer"
        entityId={previewId}
      />
    </>
  );
}
