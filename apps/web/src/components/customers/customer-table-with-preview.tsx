'use client';

import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { BulkDeleteBar } from '@/components/shared/bulk-delete-bar';
import { useBulkSelection } from '@/hooks/use-bulk-selection';
import { cn } from '@/lib/utils';

interface Customer {
  id: string; name: string; phone: string;
  status: string; shortDescription?: string | null;
  labels?: { label: { id: string; name: string; color: string; textColor: string } }[];
  createdAt: string;
}

/** Customer list table - click name navigates to detail page. */
export function CustomerTableWithPreview({
  customers,
  enableBulkDelete = false,
}: {
  customers: Customer[];
  /** SA-only bulk delete toggle. */
  enableBulkDelete?: boolean;
}) {
  const sel = useBulkSelection(customers);

  if (customers.length === 0) {
    return <div className="p-8 text-center text-slate-400">Không có khách hàng nào</div>;
  }

  return (
    <>
      <table className="w-full text-sm">
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            {enableBulkDelete && (
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  aria-label="Chọn tất cả"
                  checked={sel.allSelected}
                  ref={(el) => { if (el) el.indeterminate = sel.someSelected; }}
                  onChange={sel.toggleAll}
                  className="h-4 w-4 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
              </th>
            )}
            <th className="px-4 py-3 text-left font-medium text-slate-500">Họ tên</th>
            <th className="px-4 py-3 text-left font-medium text-slate-500">SĐT</th>
            <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-slate-500">Mô tả ngắn</th>
            <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-slate-500">Nhãn</th>
            <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-slate-500">Ngày tạo</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => {
            const isSelected = sel.isSelected(c.id);
            return (
              <tr key={c.id} className={cn('border-b border-slate-100 hover:bg-slate-50 last:border-0', isSelected && 'bg-sky-50')}>
                {enableBulkDelete && (
                  <td className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Chọn ${c.name}`}
                      checked={isSelected}
                      onChange={() => sel.toggleOne(c.id)}
                      className="h-4 w-4 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <Link href={`/customers/${c.id}`}
                    className="font-medium text-sky-600 hover:underline">
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.phone}</td>
                <td className="hidden md:table-cell px-4 py-3 text-slate-500 text-xs max-w-xs truncate">
                  {c.shortDescription || '-'}
                </td>
                <td className="hidden md:table-cell px-4 py-3">
                  {c.labels && c.labels.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {c.labels.slice(0, 3).map(ll => (
                        <span key={ll.label.id} className="rounded-full px-1.5 py-0.5 text-[9px] font-medium"
                          style={{ backgroundColor: ll.label.color, color: ll.label.textColor || '#ffffff' }}>{ll.label.name}</span>
                      ))}
                      {c.labels.length > 3 && (
                        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] text-slate-500">+{c.labels.length - 3}</span>
                      )}
                    </div>
                  ) : <span className="text-slate-400">-</span>}
                </td>
                <td className="hidden lg:table-cell px-4 py-3 text-slate-400">{formatDate(c.createdAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {enableBulkDelete && (
        <BulkDeleteBar
          count={sel.count}
          ids={sel.selectedIds}
          endpoint="/customers/bulk-delete"
          entityLabel="khách hàng"
          onClear={sel.clear}
        />
      )}
    </>
  );
}
