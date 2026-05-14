'use client';

import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';

interface LeadNoteSummary {
  id: string;
  content: string;
  createdAt: string;
}

interface LeadNotesCellProps {
  notes?: LeadNoteSummary[] | null;
}

/**
 * Cell hiển thị note mới nhất của lead + badge +N nếu có thêm.
 * Click cell mở popover hiển thị tối đa 5 note (chỉ content, không tên/timestamp - theo spec UX).
 */
export function LeadNotesCell({ notes }: LeadNotesCellProps) {
  if (!notes || notes.length === 0) {
    return <span className="text-slate-300 text-sm">-</span>;
  }

  const first = notes[0];
  const extra = notes.length - 1;

  return (
    <Popover>
      <PopoverTrigger
        asChild
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="text-left w-full max-w-[240px] hover:bg-slate-50 rounded px-1 -mx-1 py-0.5 cursor-pointer"
          title="Xem note"
        >
          <span className="line-clamp-1 text-sm text-slate-700">{first.content}</span>
          {extra > 0 && (
            <span className="ml-1 inline-block rounded-full bg-slate-100 text-slate-600 text-[10px] font-semibold px-1.5 py-0.5">
              +{extra}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 max-h-96 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {notes.map((n, i) => (
          <div
            key={n.id}
            className={`px-3 py-2 ${i < notes.length - 1 ? 'border-b border-slate-100' : ''}`}
          >
            <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{n.content}</p>
          </div>
        ))}
      </PopoverContent>
    </Popover>
  );
}
