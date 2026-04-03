'use client';

import { useState } from 'react';
import { StatusBadge } from '@/components/shared/status-badge';
import { LeadInlineExpandDetail } from '@/components/leads/lead-inline-expand-detail';
import { LeadPoolActionButtons } from '@/components/leads/lead-pool-action-buttons';
import { cn } from '@/lib/utils';

interface Lead {
  id: string; name: string; phone: string; email?: string | null;
  status: string; source?: { name: string } | null;
  assignedUser?: { name: string } | null;
  department?: { name: string } | null;
  customerId?: string | null;
  orders?: { id: string }[];
  labels?: { label: { id: string; name: string; color: string } }[];
  activityCount?: number;
  lastInteractionAt?: string;
  createdAt: string;
}

/** Relative time label + danger color based on how long ago */
function RelativeTime({ date }: { date?: string }) {
  if (!date) return <span className="text-gray-400">—</span>;
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  let text: string;
  if (mins < 60) text = `${mins} phút trước`;
  else if (hours < 24) text = `${hours} giờ trước`;
  else if (days < 7) text = `${days} ngày trước`;
  else if (days < 30) text = `${Math.floor(days / 7)} tuần trước`;
  else text = `${Math.floor(days / 30)} tháng trước`;

  // Color: green < 1d, normal < 3d, orange < 7d, red >= 7d
  let color = 'text-gray-400';
  if (days < 1) color = 'text-emerald-600';
  else if (days < 3) color = 'text-gray-500';
  else if (days < 7) color = 'text-amber-600';
  else color = 'text-red-600 font-semibold';

  return <span className={cn('text-xs', color)}>{text}</span>;
}

interface LeadTableProps {
  leads: Lead[];
  poolMode?: 'new' | 'floating' | 'department';
  users?: { id: string; name: string }[];
}

export function LeadTable({ leads, poolMode, users = [] }: LeadTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const colCount = 6 + (poolMode ? 1 : 0);

  function toggle(id: string) {
    setExpandedId(prev => prev === id ? null : id);
  }

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
            <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-gray-500">Nhãn</th>
            <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-gray-500">Lần cuối</th>
            {poolMode && <th className="px-4 py-3 text-right font-medium text-gray-500">Thao tác</th>}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => {
            const isExpanded = expandedId === lead.id;
            return (
              <LeadRow key={lead.id} lead={lead} isExpanded={isExpanded} onToggle={() => toggle(lead.id)} poolMode={poolMode} users={users} colSpan={colCount} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function LeadRow({ lead, isExpanded, onToggle, poolMode, users, colSpan }: {
  lead: Lead; isExpanded: boolean; onToggle: () => void;
  poolMode?: string; users: { id: string; name: string }[]; colSpan: number;
}) {
  return (
    <>
      <tr className={cn('border-b border-gray-100 hover:bg-gray-50 cursor-pointer', isExpanded && 'bg-sky-50/50')} onClick={onToggle}>
        <td className="px-4 py-3">
          <span className="font-medium text-sky-600">{lead.name}</span>
          {lead.orders && lead.orders.length > 0 && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Đã mua</span>
          )}
        </td>
        <td className="px-4 py-3 text-gray-600">
          <span>{lead.phone}</span>
          {lead.activityCount != null && lead.activityCount > 0 && (
            <span className="ml-1.5 inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">{lead.activityCount} log</span>
          )}
        </td>
        <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
        <td className="hidden md:table-cell px-4 py-3 text-gray-600">{lead.source?.name || '—'}</td>
        <td className="hidden md:table-cell px-4 py-3">
          <div className="flex flex-wrap gap-1">
            {lead.labels?.slice(0, 3).map(ll => (
              <span key={ll.label.id} className="rounded-full px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: ll.label.color }}>{ll.label.name}</span>
            ))}
            {(lead.labels?.length || 0) > 3 && <span className="text-[10px] text-gray-400">+{(lead.labels?.length || 0) - 3}</span>}
          </div>
        </td>
        <td className="hidden lg:table-cell px-4 py-3"><RelativeTime date={lead.lastInteractionAt} /></td>
        {poolMode && (
          <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
            <LeadPoolActionButtons leadId={lead.id} leadName={lead.name} mode={poolMode === 'new' ? 'assign' : 'both'} users={users} />
          </td>
        )}
      </tr>
      {isExpanded && <LeadInlineExpandDetail entityType="lead" entityId={lead.id} colSpan={colSpan} />}
    </>
  );
}
