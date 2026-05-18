'use client';

import { detectCarrier, CARRIER_LABEL, formatPhoneDisplay } from '@crm/utils';
import { LeadQuickActionsMenu } from '@/components/leads/lead-quick-actions-menu';

interface PhoneCellProps {
  leadId: string;
  phone: string | null | undefined;
}

/**
 * Phone cell for lead tables.
 * - Main row: formatted phone (click -> dropdown menu thao tác nhanh).
 * - Sub row: carrier badge (VIETTEL / MOBI / VINA / ...). Hidden if unknown.
 *
 * Lưu ý: cột Nhãn đã tách riêng khỏi PhoneCell (theo yêu cầu UX). 3 icon button cũ
 * (Clock/Mic/Copy) gom vào LeadQuickActionsMenu để click SĐT là xổ menu thống nhất.
 */
export function PhoneCell({ leadId, phone }: PhoneCellProps) {
  if (!phone) return <span className="text-slate-400">-</span>;

  const carrier = detectCarrier(phone);
  const display = formatPhoneDisplay(phone);

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
    <div className="flex flex-col gap-0.5 min-w-[160px]">
      <LeadQuickActionsMenu
        leadId={leadId}
        phone={phone}
        triggerTitle="Thao tác nhanh"
        triggerClassName="font-medium text-slate-900 tabular-nums text-left hover:text-sky-600 hover:underline focus:outline-none focus:ring-2 focus:ring-sky-500 rounded"
      >
        {display}
      </LeadQuickActionsMenu>
      {carrier && (
        <span className={`inline-flex w-fit items-center rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase ring-1 ring-inset ${carrierStyle[carrier]}`}>
          {CARRIER_LABEL[carrier]}
        </span>
      )}
    </div>
  );
}
