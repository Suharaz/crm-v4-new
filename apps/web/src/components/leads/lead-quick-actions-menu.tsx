'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eye, Clock, Mic, Copy } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { LeadActivityTimelineDialog } from '@/components/shared/lead-activity-timeline-dialog';
import { CallHistoryDialog } from '@/components/shared/call-history-dialog';

interface LeadQuickActionsMenuProps {
  leadId: string;
  /** Optional - chỉ cần khi muốn show item "Copy SĐT" + "Lịch sử gọi điện". */
  phone?: string | null;
  /** Trigger element (tên hoặc SĐT formatted). Wrap trong button + stopPropagation. */
  children: ReactNode;
  /** Tailwind class cho trigger button - cho phép caller giữ style cũ của SĐT/tên. */
  triggerClassName?: string;
  /** Aria title cho trigger - giúp screen reader hiểu. */
  triggerTitle?: string;
}

/**
 * Dropdown menu thao tác nhanh cho lead - dùng chung cho PhoneCell và LeadNameLink.
 *
 * 4 thao tác:
 * - Xem chi tiết -> mở /leads/[id] (cùng tab)
 * - Lịch tương tác -> mở LeadActivityTimelineDialog
 * - Lịch sử gọi điện -> mở CallHistoryDialog (chỉ nếu có phone)
 * - Copy SĐT -> clipboard (chỉ nếu có phone)
 *
 * Tại sao tách component: PhoneCell và LeadNameLink trước đây có UI rời rạc (3 icon riêng vs link).
 * Gom thành 1 menu thống nhất giúp user nhớ thao tác nhanh có ở 2 chỗ, code reuse.
 *
 * stopPropagation trên trigger button: lead-table.tsx có row click -> toggle expand.
 * Không stop sẽ vô tình expand row mỗi lần mở menu.
 */
export function LeadQuickActionsMenu({
  leadId,
  phone,
  children,
  triggerClassName,
  triggerTitle,
}: LeadQuickActionsMenuProps) {
  const router = useRouter();
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [callsOpen, setCallsOpen] = useState(false);

  async function copyPhone() {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      toast.success('Đã copy SĐT');
    } catch {
      toast.error('Không thể copy');
    }
  }

  function viewDetail() {
    router.push(`/leads/${leadId}`);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={triggerTitle}
            onClick={(e) => e.stopPropagation()}
            className={triggerClassName}
          >
            {children}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="min-w-[180px]"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenuItem onSelect={viewDetail} className="gap-2">
            <Eye className="h-4 w-4 text-sky-500" />
            <span>Xem chi tiết</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setTimelineOpen(true)} className="gap-2">
            <Clock className="h-4 w-4 text-indigo-500" />
            <span>Lịch tương tác</span>
          </DropdownMenuItem>
          {phone && (
            <>
              <DropdownMenuItem onSelect={() => setCallsOpen(true)} className="gap-2">
                <Mic className="h-4 w-4 text-emerald-500" />
                <span>Lịch sử gọi điện</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={copyPhone} className="gap-2">
                <Copy className="h-4 w-4 text-amber-500" />
                <span>Copy SĐT</span>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <LeadActivityTimelineDialog
        open={timelineOpen}
        onOpenChange={setTimelineOpen}
        leadId={leadId}
      />
      {phone && (
        <CallHistoryDialog
          open={callsOpen}
          onOpenChange={setCallsOpen}
          phone={phone}
        />
      )}
    </>
  );
}
