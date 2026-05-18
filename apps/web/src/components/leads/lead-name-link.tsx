'use client';

import { LeadQuickActionsMenu } from '@/components/leads/lead-quick-actions-menu';

interface Props {
  leadId: string;
  name: string;
  /** Optional SĐT - khi truyền vào, menu sẽ có thêm item Copy SĐT + Lịch sử gọi điện. */
  phone?: string | null;
}

/**
 * Lead name - click để xổ dropdown thao tác nhanh (LeadQuickActionsMenu).
 * Trước đây chỉ là Link tới /leads/[id]; gom thêm menu thống nhất với PhoneCell.
 *
 * Vẫn cho phép navigate sang chi tiết qua item "Xem chi tiết" trong menu.
 */
export function LeadNameLink({ leadId, name, phone }: Props) {
  return (
    <LeadQuickActionsMenu
      leadId={leadId}
      phone={phone}
      triggerTitle="Thao tác nhanh"
      triggerClassName="font-medium text-slate-900 hover:text-sky-600 hover:underline truncate text-left focus:outline-none focus:ring-2 focus:ring-sky-500 rounded"
    >
      {name}
    </LeadQuickActionsMenu>
  );
}
