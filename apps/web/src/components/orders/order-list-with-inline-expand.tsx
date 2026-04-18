'use client';

import { useState } from 'react';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate, formatVND } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrderRecord } from '@/types/entities';
import { BulkDeleteBar } from '@/components/shared/bulk-delete-bar';
import { useBulkSelection } from '@/hooks/use-bulk-selection';

interface OrderListWithInlineExpandProps {
  orders: OrderRecord[];
  /** SA-only bulk delete toggle. */
  enableBulkDelete?: boolean;
}

/** Orders table with inline expandable detail row showing payments + notes. */
export function OrderListWithInlineExpand({ orders, enableBulkDelete = false }: OrderListWithInlineExpandProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const selItems = orders.map((o) => ({ id: String(o.id) }));
  const sel = useBulkSelection(selItems);
  const colSpan = 7 + (enableBulkDelete ? 1 : 0);

  function toggle(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

  if (orders.length === 0) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">Không có đơn hàng nào</div>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
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
              <th className="w-8 px-2" />
              <th className="px-4 py-3 text-left font-medium text-slate-500">Mã</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Khách hàng</th>
              <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-slate-500">Sản phẩm</th>
              <th className="px-4 py-3 text-right font-medium text-slate-500">Tổng tiền</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Trạng thái</th>
              <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-slate-500">Ngày tạo</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const idStr = String(o.id);
              const isExpanded = expandedId === idStr;
              return (
                <OrderRow
                  key={o.id}
                  order={o}
                  isExpanded={isExpanded}
                  onToggle={() => toggle(idStr)}
                  enableBulkDelete={enableBulkDelete}
                  isSelected={sel.isSelected(idStr)}
                  onSelectToggle={() => sel.toggleOne(idStr)}
                  expandedColSpan={colSpan}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {enableBulkDelete && (
        <BulkDeleteBar
          count={sel.count}
          ids={sel.selectedIds}
          endpoint="/orders/bulk-delete"
          entityLabel="đơn hàng"
          hint="Chỉ đơn PENDING sẽ bị xóa — đơn đã xác nhận sẽ bỏ qua."
          onClear={sel.clear}
        />
      )}
    </>
  );
}

function OrderRow({
  order: o, isExpanded, onToggle,
  enableBulkDelete, isSelected, onSelectToggle, expandedColSpan,
}: {
  order: OrderRecord; isExpanded: boolean; onToggle: () => void;
  enableBulkDelete: boolean; isSelected: boolean; onSelectToggle: () => void; expandedColSpan: number;
}) {
  return (
    <>
      <tr
        className={cn('border-b border-slate-100 hover:bg-slate-50 cursor-pointer', isExpanded && 'bg-sky-50/50', isSelected && 'bg-sky-50')}
        onClick={onToggle}
      >
        {enableBulkDelete && (
          <td className="w-10 px-3 py-3" onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              aria-label={`Chọn đơn #${o.id}`}
              checked={isSelected}
              onChange={onSelectToggle}
              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
          </td>
        )}
        <td className="px-2 text-center">
          <ChevronDown size={14} className={cn('text-slate-400 transition-transform', isExpanded && 'rotate-180')} />
        </td>
        <td className="px-4 py-3 font-medium text-sky-600">#{o.id}</td>
        <td className="px-4 py-3 text-slate-600">{o.customer?.name}</td>
        <td className="hidden md:table-cell px-4 py-3 text-slate-600">{o.product?.name || '—'}</td>
        <td className="px-4 py-3 text-right font-medium text-slate-900">{formatVND(Number(o.totalAmount))}</td>
        <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
        <td className="hidden lg:table-cell px-4 py-3 text-slate-400">{formatDate(o.createdAt)}</td>
      </tr>
      {isExpanded && (
        <tr className="bg-slate-50/50">
          <td colSpan={expandedColSpan} className="px-6 py-4">
            <OrderExpandedDetail order={o} />
          </td>
        </tr>
      )}
    </>
  );
}

function OrderExpandedDetail({ order: o }: { order: OrderRecord }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      {/* Left: order info */}
      <div className="space-y-2">
        <h4 className="font-semibold text-slate-700">Chi tiết đơn hàng</h4>
        <div className="grid grid-cols-2 gap-1 text-slate-600">
          <span>Khách hàng:</span><span className="font-medium">{o.customer?.name} — {o.customer?.phone}</span>
          <span>Sản phẩm:</span><span>{o.product?.name || '—'}</span>
          <span>Giá:</span><span>{formatVND(Number(o.amount))}</span>
          {Number(o.vatRate) > 0 && <><span>VAT ({o.vatRate}%):</span><span>{formatVND(Number(o.vatAmount))}</span></>}
          <span>Tổng:</span><span className="font-bold text-sky-600">{formatVND(Number(o.totalAmount))}</span>
          {(o.orderFormat || o.productGroup) && (
            <>
              {o.orderFormat && <><span>Hình thức:</span><span>{o.orderFormat.name}</span></>}
              {o.productGroup && <><span>Nhóm sản phẩm:</span><span>{o.productGroup.name}</span></>}
            </>
          )}
          {o.vatEmail && <><span>Mail VAT:</span><span>{o.vatEmail}</span></>}
          <span>Người tạo:</span><span>{o.creator?.name || '—'}</span>
          {o.notes && <><span>Ghi chú:</span><span>{o.notes}</span></>}
        </div>
      </div>

      {/* Right: payments */}
      <div className="space-y-2">
        <h4 className="font-semibold text-slate-700">Thanh toán ({o.payments?.length || 0})</h4>
        {(!o.payments || o.payments.length === 0) ? (
          <p className="text-slate-400">Chưa có thanh toán</p>
        ) : (
          <div className="space-y-2">
            {o.payments.map((p) => (
              <div key={p.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 space-y-1">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{p.paymentType?.name}</span>
                    {p.installment && <span className="ml-2 text-xs text-slate-500">{p.installment.name}</span>}
                    {p.transferContent && <span className="ml-2 text-xs text-slate-400">{p.transferContent}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{formatVND(Number(p.amount))}</span>
                    <StatusBadge status={p.status} />
                  </div>
                </div>
                {(p.transferDate || p.vatAmount) && (
                  <div className="flex gap-4 text-xs text-slate-400">
                    {p.transferDate && <span>Ngày CK: {formatDate(p.transferDate)}</span>}
                    {p.vatAmount && Number(p.vatAmount) > 0 && <span>VAT: {formatVND(Number(p.vatAmount))}</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
