'use client';

import { useState } from 'react';
import { LeadInlineExpandDetail } from '@/components/leads/lead-inline-expand-detail';
import { LeadPoolActionButtons } from '@/components/leads/lead-pool-action-buttons';
import { LeadDuplicateBadge } from '@/components/leads/lead-duplicate-badge';
import { LeadEditButton } from '@/components/leads/lead-edit-button';
import { LeadNotesCell } from '@/components/leads/lead-notes-cell';
import { PhoneCell } from '@/components/leads/phone-cell';
import { LeadNameLink } from '@/components/leads/lead-name-link';
import { LabelPill } from '@/components/leads/label-pill';
import { BulkDeleteBar } from '@/components/shared/bulk-delete-bar';
import { useBulkSelection } from '@/hooks/use-bulk-selection';
import { cn, formatVND } from '@/lib/utils';

interface OrderLite {
  id: string;
  totalAmount: number;
  payments?: { amount: number; status: string }[];
}

interface LeadNoteSummary {
  id: string;
  content: string;
  createdAt: string;
}

interface Lead {
  id: string; name: string; phone: string; email?: string | null;
  status: string; source?: { name: string } | null; product?: { name: string } | null;
  assignedUser?: { name: string } | null;
  department?: { name: string } | null;
  customerId?: string | null;
  orders?: OrderLite[];
  label?: { id: string; name: string; color: string; textColor: string } | null;
  activityCount?: number;
  lastInteractionAt?: string;
  metadata?: { aiLevel?: string; aiScore?: number };
  createdAt: string;
  /** Tổng số lead chưa xóa có cùng SĐT (gồm chính lead này). >=2 → hiện badge trùng. */
  duplicateCount?: number;
  /** Top 5 note gần nhất (DESC theo createdAt). Backend trả về - dùng cho cột Note. */
  recentNotes?: LeadNoteSummary[];
}

/** Pick the latest order + sum verified payments for "Tiền đặt cọc" column. */
function computeOrderSummary(orders: OrderLite[] | undefined) {
  if (!orders || orders.length === 0) return null;
  const latest = orders[0]; // backend orderBy id desc
  const depositPaid = (latest.payments || [])
    .filter((p) => p.status === 'VERIFIED')
    .reduce((sum, p) => sum + Number(p.amount), 0);
  return { totalAmount: Number(latest.totalAmount), depositPaid };
}

interface LeadTableProps {
  leads: Lead[];
  poolMode?: 'new' | 'floating' | 'department';
  users?: { id: string; name: string }[];
  /** Bật checkbox + bulk-delete bar. Chỉ truyền true nếu user là SUPER_ADMIN. */
  enableBulkDelete?: boolean;
}

export function LeadTable({ leads, poolMode, users = [], enableBulkDelete = false }: LeadTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const sel = useBulkSelection(leads);
  // header cells count - used for colspan of expanded row
  // 8 base (Tên, SĐT, Sản phẩm, Nhãn, Thành tiền, Tiền đặt cọc, Nguồn, Note) + Chỉnh sửa + (poolMode ? Thao tác : 0) + (enableBulkDelete ? Checkbox : 0)
  const colCount = 9 + (poolMode ? 1 : 0) + (enableBulkDelete ? 1 : 0);

  function toggle(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

  if (leads.length === 0) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">Không có data</div>;
  }

  // Sticky column offsets (cumulative left position) - cột Tên là sticky đầu tiên sau checkbox (nếu có)
  const NAME_LEFT = enableBulkDelete ? 'left-[40px]' : 'left-0';
  const PHONE_LEFT = enableBulkDelete ? 'left-[240px]' : 'left-[200px]';

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="bg-slate-50">
            <tr>
              {enableBulkDelete && (
                <th className="sticky left-0 z-20 w-10 px-3 py-3 bg-slate-50 border-b border-slate-200">
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
              <th className={cn('sticky z-20 w-[200px] px-4 py-3 text-left font-medium text-slate-500 bg-slate-50 border-b border-slate-200', NAME_LEFT)}>Tên khách hàng</th>
              <th className={cn('sticky z-20 w-[200px] px-4 py-3 text-left font-medium text-slate-500 bg-slate-50 border-b border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.04)]', PHONE_LEFT)}>Số điện thoại</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500 bg-slate-50 border-b border-slate-200">Sản phẩm</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500 bg-slate-50 border-b border-slate-200">Nhãn</th>
              <th className="px-4 py-3 text-right font-medium text-slate-500 bg-slate-50 border-b border-slate-200">Thành tiền</th>
              <th className="px-4 py-3 text-right font-medium text-slate-500 bg-slate-50 border-b border-slate-200">Tiền đặt cọc</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500 bg-slate-50 border-b border-slate-200">Nguồn khách</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500 bg-slate-50 border-b border-slate-200 w-[240px]">Note</th>
              <th className="px-3 py-3 text-center font-medium text-slate-500 bg-slate-50 border-b border-slate-200 w-[60px]">Chỉnh sửa</th>
              {poolMode && <th className="sticky right-0 z-20 px-4 py-3 text-right font-medium text-slate-500 bg-slate-50 border-b border-slate-200 shadow-[-2px_0_4px_rgba(0,0,0,0.04)]">Thao tác</th>}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const isExpanded = expandedId === lead.id;
              return (
                <LeadRow
                  key={lead.id}
                  lead={lead}
                  isExpanded={isExpanded}
                  onToggle={() => toggle(lead.id)}
                  poolMode={poolMode}
                  users={users}
                  colSpan={colCount}
                  enableBulkDelete={enableBulkDelete}
                  isSelected={sel.isSelected(lead.id)}
                  onSelectToggle={() => sel.toggleOne(lead.id)}
                  nameLeft={NAME_LEFT}
                  phoneLeft={PHONE_LEFT}
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
          endpoint="/leads/bulk-delete"
          entityLabel="lead"
          onClear={sel.clear}
        />
      )}
    </>
  );
}

function LeadRow({ lead, isExpanded, onToggle, poolMode, users, colSpan, enableBulkDelete, isSelected, onSelectToggle, nameLeft, phoneLeft }: {
  lead: Lead; isExpanded: boolean; onToggle: () => void;
  poolMode?: string; users: { id: string; name: string }[]; colSpan: number;
  enableBulkDelete: boolean; isSelected: boolean; onSelectToggle: () => void;
  nameLeft: string; phoneLeft: string;
}) {
  const summary = computeOrderSummary(lead.orders);
  // Background for sticky cells matches row state (selected/expanded/default)
  const rowBg = isSelected ? 'bg-sky-50' : isExpanded ? 'bg-sky-50/50' : 'bg-white';

  return (
    <>
      <tr className={cn('hover:bg-slate-50 cursor-pointer', rowBg)} onClick={onToggle}>
        {enableBulkDelete && (
          <td className={cn('sticky left-0 z-10 w-10 px-3 py-3 border-b border-slate-100', rowBg)} onClick={e => e.stopPropagation()}>
            <input
              type="checkbox"
              aria-label={`Chọn ${lead.name}`}
              checked={isSelected}
              onChange={onSelectToggle}
              className="h-4 w-4 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
            />
          </td>
        )}
        <td className={cn('sticky z-10 w-[200px] px-4 py-3 border-b border-slate-100', nameLeft, rowBg)}>
          <div className="flex items-center gap-1.5">
            <LeadNameLink leadId={lead.id} name={lead.name} />
            {lead.metadata?.aiLevel && (
              <span className={`text-[9px] font-bold px-1 py-0.5 rounded-full text-white shrink-0 ${
                lead.metadata.aiLevel === 'HOT' ? 'bg-red-500' : lead.metadata.aiLevel === 'WARM' ? 'bg-amber-500' : 'bg-sky-400'
              }`}>{lead.metadata.aiScore || '?'}</span>
            )}
          </div>
        </td>
        <td className={cn('sticky z-10 w-[200px] px-4 py-3 border-b border-slate-100 shadow-[2px_0_4px_rgba(0,0,0,0.04)]', phoneLeft, rowBg)}>
          <div className="flex items-center gap-2">
            <PhoneCell leadId={lead.id} phone={lead.phone} />
            <LeadDuplicateBadge
              count={lead.duplicateCount ?? 0}
              phone={lead.phone}
              currentLeadId={lead.id}
            />
          </div>
        </td>
        <td className="px-4 py-3 text-slate-600 border-b border-slate-100">{lead.product?.name || '-'}</td>
        <td className="px-4 py-3 border-b border-slate-100">
          {lead.label ? <LabelPill label={lead.label} size="sm" /> : <span className="text-slate-300">-</span>}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-slate-700 border-b border-slate-100">
          {summary ? formatVND(summary.totalAmount) : <span className="text-slate-300">-</span>}
        </td>
        <td className="px-4 py-3 text-right tabular-nums text-slate-700 border-b border-slate-100">
          {summary ? formatVND(summary.depositPaid) : <span className="text-slate-300">-</span>}
        </td>
        <td className="px-4 py-3 text-slate-600 border-b border-slate-100">{lead.source?.name || '-'}</td>
        <td className="px-4 py-3 border-b border-slate-100" onClick={e => e.stopPropagation()}>
          <LeadNotesCell notes={lead.recentNotes} />
        </td>
        <td className="px-3 py-3 text-center border-b border-slate-100" onClick={e => e.stopPropagation()}>
          <LeadEditButton leadId={lead.id} lead={lead as unknown as Parameters<typeof LeadEditButton>[0]['lead']} />
        </td>
        {poolMode && (
          <td className={cn('sticky right-0 z-10 px-4 py-3 text-right border-b border-slate-100 shadow-[-2px_0_4px_rgba(0,0,0,0.04)]', rowBg)} onClick={e => e.stopPropagation()}>
            <LeadPoolActionButtons leadId={lead.id} leadName={lead.name} mode={poolMode === 'new' ? 'assign' : 'both'} users={users} />
          </td>
        )}
      </tr>
      {isExpanded && <LeadInlineExpandDetail entityType="lead" entityId={lead.id} colSpan={colSpan} />}
    </>
  );
}
