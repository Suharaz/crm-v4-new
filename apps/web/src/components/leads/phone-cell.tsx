'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Clock, Mic, Copy } from 'lucide-react';
import { detectCarrier, CARRIER_LABEL, formatPhoneDisplay } from '@crm/utils';
import { LeadActivityTimelineDialog } from '@/components/shared/lead-activity-timeline-dialog';
import { CallHistoryDialog } from '@/components/shared/call-history-dialog';
import { LabelPill } from '@/components/leads/label-pill';

interface PhoneCellProps {
  leadId: string;
  phone: string | null | undefined;
  /** Nhãn của lead - hiển thị pill nhỏ dưới SĐT nếu có. */
  label?: { name: string; color: string; textColor?: string | null } | null;
}

/**
 * Phone cell for lead tables.
 * - Main row: formatted phone + 3 actions (timeline / call history / copy).
 * - Sub row: carrier badge (VIETTEL / MOBI / VINA / ...). Hidden if unknown.
 */
export function PhoneCell({ leadId, phone, label }: PhoneCellProps) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [callsOpen, setCallsOpen] = useState(false);

  if (!phone) return <span className="text-slate-400">-</span>;

  const carrier = detectCarrier(phone);
  const display = formatPhoneDisplay(phone);

  async function copyPhone(e: React.MouseEvent) {
    // Chặn bubble lên row để click copy không trigger row-toggle ở bảng leads
    e.stopPropagation();
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      toast.success('Đã copy SĐT');
    } catch {
      toast.error('Không thể copy');
    }
  }

  // Carrier brand colors (badge background + text)
  const carrierStyle: Record<string, string> = {
    VIETTEL: 'bg-red-50 text-red-600 ring-red-200',
    MOBI: 'bg-blue-50 text-blue-600 ring-blue-200',
    VINA: 'bg-emerald-50 text-emerald-600 ring-emerald-200',
    VIETNAMOBILE: 'bg-orange-50 text-orange-600 ring-orange-200',
    GMOBILE: 'bg-purple-50 text-purple-600 ring-purple-200',
    ITELECOM: 'bg-slate-100 text-slate-600 ring-slate-200',
  };

  return (
    <div className="flex flex-col gap-0.5 min-w-[200px]">
      <div className="flex items-center gap-1">
        <span className="font-medium text-slate-900 tabular-nums">{display}</span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setTimelineOpen(true); }}
          title="Lịch tương tác"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
        >
          <Clock className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setCallsOpen(true); }}
          title="Lịch sử gọi điện"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
        >
          <Mic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={copyPhone}
          title="Copy SĐT"
          className="inline-flex h-6 w-6 items-center justify-center rounded-md text-amber-500 hover:bg-amber-50 hover:text-amber-700 transition-colors"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      {carrier && (
        <span className={`inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase ring-1 ring-inset ${carrierStyle[carrier]}`}>
          {CARRIER_LABEL[carrier]}
        </span>
      )}
      {label && <LabelPill label={label} />}

      <LeadActivityTimelineDialog
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
        leadId={leadId}
      />
      <CallHistoryDialog
        open={callsOpen}
        onOpenChange={setCallsOpen}
        phone={phone}
      />
    </div>
  );
}
