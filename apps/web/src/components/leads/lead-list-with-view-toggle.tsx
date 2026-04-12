'use client';

import { useState, useEffect } from 'react';
import { LeadTable } from '@/components/leads/lead-table';
import { LeadKanbanViewByLabel } from '@/components/leads/lead-kanban-view-by-label';
import { EntityQuickPreviewDialog } from '@/components/shared/entity-quick-preview-dialog';
import { List, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LeadRecord, LabelEntity } from '@/types/entities';

const STORAGE_KEY = 'crm_leads_view_mode';
type ViewMode = 'table' | 'kanban';

interface Props {
  leads: LeadRecord[];
  allLabels?: LabelEntity[];
}

/** Leads list with toggle between table and kanban views. Persists choice in localStorage. */
export function LeadListWithViewToggle({ leads, allLabels }: Props) {
  const [view, setView] = useState<ViewMode>('table');
  const [previewId, setPreviewId] = useState<string | null>(null);

  // Restore saved view mode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ViewMode | null;
    if (saved === 'table' || saved === 'kanban') setView(saved);
  }, []);

  function changeView(mode: ViewMode) {
    setView(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }

  return (
    <>
      {/* View mode toggle */}
      <div className="flex justify-end">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
          <button
            onClick={() => changeView('table')}
            className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              view === 'table' ? 'bg-sky-500 text-white' : 'text-slate-600 hover:bg-slate-100')}
          >
            <List size={14} /> Bảng
          </button>
          <button
            onClick={() => changeView('kanban')}
            className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
              view === 'kanban' ? 'bg-sky-500 text-white' : 'text-slate-600 hover:bg-slate-100')}
          >
            <LayoutGrid size={14} /> Kanban
          </button>
        </div>
      </div>

      {/* View content — child components use stricter local Lead interfaces; cast is safe as shapes are compatible */}
      {view === 'table' ? (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <LeadTable leads={leads as any} />
      ) : (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <LeadKanbanViewByLabel leads={leads as any} allLabels={allLabels} onLeadClick={setPreviewId} />
      )}

      {/* Quick preview for kanban card clicks */}
      {view === 'kanban' && (
        <EntityQuickPreviewDialog
          open={!!previewId}
          onOpenChange={(open) => { if (!open) setPreviewId(null); }}
          entityType="lead"
          entityId={previewId}
        />
      )}
    </>
  );
}
