'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Clock, Mic, Copy } from 'lucide-react';
import { detectCarrier, CARRIER_LABEL, formatPhoneDisplay } from '@crm/utils';
import { LeadActivityTimelineDialog } from '@/components/shared/lead-activity-timeline-dialog';
import { CallHistoryDialog } from '@/components/shared/call-history-dialog';

interface PhoneCellProps {
  leadId: string;
  phone: string | null | undefined;
}

/**
 * Phone cell for lead tables.
 * - Main row: formatted phone + 3 actions (timeline / call history / copy).
 * - Sub row: carrier badge (VIETTEL / MOBI / VINA / ...). Hidden if unknown.
 */
export function PhoneCell({ leadId, phone }: PhoneCellProps) {
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [callsOpen, setCallsOpen] = useState(false);

  if (!phone) return <span className="text-slate-400">-</span>;

  const carrier = detectCarrier(phone);
  const display = formatPhoneDisplay(phone);

  async function copyPhone() {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      toast.success('Đã copy SĐT');
    } catch {
      toast.error('Không thể copy');
    }
  }

  return (
    <div className="flex flex-col gap-0.5 min-w-[200px]">
      <div className="flex items-center gap-1.5">
        <span className="font-medium text-slate-900 tabular-nums">{display}</span>
        <button
          type="button"
          onClick={() => setTimelineOpen(true)}
          title="Lịch tương tác"
          className="text-slate-400 hover:text-sky-600 transition-colors"
        >
          <Clock className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setCallsOpen(true)}
          title="Lịch sử gọi điện"
          className="text-slate-400 hover:text-sky-600 transition-colors"
        >
          <Mic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={copyPhone}
          title="Copy SĐT"
          className="text-slate-400 hover:text-sky-600 transition-colors"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
      {carrier && (
        <span className="text-[10px] font-semibold tracking-wider text-sky-600 uppercase">
          {CARRIER_LABEL[carrier]}
        </span>
      )}

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
