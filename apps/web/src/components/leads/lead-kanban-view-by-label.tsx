'use client';

import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate } from '@/lib/utils';

interface Lead {
  id: string; name: string; phone: string; status: string;
  source?: { name: string } | null;
  assignedUser?: { name: string } | null;
  customerId?: string | null;
  activityCount?: number;
  labels?: { label: { id: string; name: string; color: string } }[];
  createdAt: string;
}

interface Props {
  leads: Lead[];
  onLeadClick?: (id: string) => void;
}

const MAX_LABEL_COLUMNS = 5;

/** Kanban board grouped by lead labels. Max 5 label columns + "Khác". */
export function LeadKanbanViewByLabel({ leads, onLeadClick }: Props) {
  // Count leads per label to find top 5
  const labelCounts = new Map<string, { label: { id: string; name: string; color: string }; count: number }>();
  for (const lead of leads) {
    if (!lead.labels || lead.labels.length === 0) continue;
    for (const ll of lead.labels) {
      const key = ll.label.id;
      const existing = labelCounts.get(key);
      if (existing) existing.count++;
      else labelCounts.set(key, { label: ll.label, count: 1 });
    }
  }

  // Sort by count desc, take top 5
  const sorted = [...labelCounts.values()].sort((a, b) => b.count - a.count);
  const topLabels = sorted.slice(0, MAX_LABEL_COLUMNS);
  const topLabelIds = new Set(topLabels.map(l => l.label.id));

  // Group leads into columns
  const columns: { id: string; name: string; color: string; leads: Lead[] }[] = topLabels.map(tl => ({
    id: tl.label.id, name: tl.label.name, color: tl.label.color, leads: [],
  }));
  const otherColumn: Lead[] = [];
  const noLabelColumn: Lead[] = [];

  for (const lead of leads) {
    if (!lead.labels || lead.labels.length === 0) {
      noLabelColumn.push(lead);
      continue;
    }
    // Place lead in first matching top-label column
    let placed = false;
    for (const ll of lead.labels) {
      if (topLabelIds.has(ll.label.id)) {
        const col = columns.find(c => c.id === ll.label.id);
        if (col) { col.leads.push(lead); placed = true; break; }
      }
    }
    if (!placed) otherColumn.push(lead);
  }

  // Build final columns array
  const allColumns = [
    ...columns,
    ...(otherColumn.length > 0 ? [{ id: '_other', name: 'Khác', color: '#9ca3af', leads: otherColumn }] : []),
    ...(noLabelColumn.length > 0 ? [{ id: '_none', name: 'Chưa gắn nhãn', color: '#d1d5db', leads: noLabelColumn }] : []),
  ];

  return (
    <div className="flex gap-3 overflow-x-auto pb-4">
      {allColumns.map(col => (
        <div key={col.id} className="flex w-72 flex-shrink-0 flex-col rounded-xl border border-gray-200 bg-gray-50/50">
          {/* Column header */}
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: col.color }} />
            <span className="text-sm font-semibold text-gray-700">{col.name}</span>
            <span className="ml-auto rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">{col.leads.length}</span>
          </div>

          {/* Cards */}
          <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ maxHeight: '70vh' }}>
            {col.leads.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-400">Trống</p>
            ) : col.leads.map(lead => (
              <div
                key={lead.id}
                onClick={() => onLeadClick?.(lead.id)}
                className="cursor-pointer rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all hover:border-sky-200 hover:shadow"
              >
                <div className="flex items-start justify-between">
                  <span className="text-sm font-medium text-gray-900">{lead.name}</span>
                  <StatusBadge status={lead.status} />
                </div>
                <p className="mt-1 text-xs text-gray-500">{lead.phone}
                  {lead.customerId && <span className="ml-1 rounded-full bg-blue-100 px-1 text-[9px] text-blue-700">KH</span>}
                </p>
                <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                  <span>{lead.assignedUser?.name || '—'}</span>
                  <span>{formatDate(lead.createdAt)}</span>
                </div>
                {/* Label pills */}
                {lead.labels && lead.labels.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {lead.labels.slice(0, 2).map(ll => (
                      <span key={ll.label.id} className="rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white" style={{ backgroundColor: ll.label.color }}>{ll.label.name}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
