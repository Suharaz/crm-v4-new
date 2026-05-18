'use client';

interface Props {
  name: string;
}

/**
 * Ten lead trong bang - plain text, KHONG link/click.
 * Theo design: chi tiet lead truy cap qua icon ⓘ trong PhoneCell -> EntityQuickPreviewDialog.
 *
 * Giu ten file/component cu de tranh phai sua nhieu chi noi import (YAGNI rename).
 */
export function LeadNameLink({ name }: Props) {
  return (
    <span className="font-medium text-slate-900 truncate">
      {name}
    </span>
  );
}
