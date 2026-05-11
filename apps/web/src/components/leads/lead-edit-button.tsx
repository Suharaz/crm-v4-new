'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { EntityQuickPreviewDialog } from '@/components/shared/entity-quick-preview-dialog';

interface Props {
  leadId: string;
}

/**
 * Pencil-icon button that opens the EntityQuickPreviewDialog for a lead.
 * Used in the "Chỉnh sửa" column of lead tables.
 * Dialog supports view info + quick edit actions (label, note, payment).
 */
export function LeadEditButton({ leadId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Xem & chỉnh sửa nhanh"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-200 hover:bg-sky-100 hover:text-sky-700 hover:ring-sky-300 transition-colors"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      <EntityQuickPreviewDialog
        open={open}
        onOpenChange={setOpen}
        entityType="lead"
        entityId={leadId}
      />
    </>
  );
}
