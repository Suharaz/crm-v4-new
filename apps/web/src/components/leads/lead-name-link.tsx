'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';
import { EntityQuickPreviewDialog } from '@/components/shared/entity-quick-preview-dialog';

interface Props {
  leadId: string;
  name: string;
}

/**
 * Ten lead trong bang - plain text + icon ⓘ chấm than mở popup chi tiết.
 *
 * Layout: [Ten plain text] [ⓘ vong tron do]
 *
 * - Click ten: khong lam gi (text thuan).
 * - Click ⓘ: mo EntityQuickPreviewDialog (popup info + 5 note + quick actions).
 * - Giu ten file/component cu (LeadNameLink) - tranh phai sua nhieu import.
 */
export function LeadNameLink({ leadId, name }: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="font-medium text-slate-900 truncate">{name}</span>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setPreviewOpen(true); }}
        title="Xem chi tiết lead"
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-50 text-red-500 ring-1 ring-red-200 hover:bg-red-100 hover:text-red-600 transition-colors shrink-0"
      >
        <Info className="h-3 w-3" />
      </button>

      <EntityQuickPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        entityType="lead"
        entityId={leadId}
      />
    </div>
  );
}
