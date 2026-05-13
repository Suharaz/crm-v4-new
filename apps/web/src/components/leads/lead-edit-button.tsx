'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { LeadEditDrawer } from '@/components/leads/lead-edit-drawer';
import type { LeadRecord } from '@/types/entities';

interface Props {
  leadId: string;
  /**
   * Optional - data lead lấy từ row table. Khi truyền vào, drawer mở instant
   * không cần fetch /leads/:id. Khuyến nghị luôn truyền để tối ưu UX.
   */
  lead?: Partial<LeadRecord>;
}

/**
 * Pencil-icon button trên các bảng lead. Mở Sheet/Drawer chứa LeadForm dạng accordion.
 * - Truyền `lead` từ row -> 0 request khi mở.
 * - User expand section sâu hơn -> mới fetch detail/phones/sources/products theo nhu cầu.
 */
export function LeadEditButton({ leadId, lead }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title="Chỉnh sửa lead"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-200 hover:bg-sky-100 hover:text-sky-700 hover:ring-sky-300 transition-colors"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>

      <LeadEditDrawer open={open} onOpenChange={setOpen} leadId={leadId} leadRow={lead} />
    </>
  );
}
