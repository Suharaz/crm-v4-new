'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { EntityQuickPreviewDialog } from '@/components/shared/entity-quick-preview-dialog';

interface Props {
  leadId: string;
  name: string;
}

/**
 * Lead name + info icon (ⓘ) for table rows.
 * - Click the name → navigate to /leads/[id] (full detail page).
 * - Click the ⓘ → open quick preview dialog (no navigation, keeps list context).
 */
export function LeadNameWithInfo({ leadId, name }: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div className="flex items-center gap-1.5 min-w-[180px]">
      <Link
        href={`/leads/${leadId}`}
        className="font-medium text-slate-900 hover:text-sky-600 hover:underline truncate"
      >
        {name}
      </Link>
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        title="Xem nhanh thông tin"
        className="shrink-0 text-slate-400 hover:text-sky-600 transition-colors"
      >
        <Info className="h-4 w-4" />
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
