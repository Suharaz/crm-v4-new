'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/utils';
import { MessageSquare, Phone, ArrowRightLeft, FileText, Activity } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: string;
  content?: string;
  user?: { name: string };
  createdAt: string;
  metadata?: any;
}

const TABS = [
  { value: 'ALL', label: 'Tất cả', icon: Activity },
  { value: 'NOTE', label: 'Ghi chú', icon: MessageSquare },
  { value: 'CALL', label: 'Cuộc gọi', icon: Phone },
  { value: 'STATUS_CHANGE', label: 'Trạng thái', icon: ArrowRightLeft },
  { value: 'OTHER', label: 'Khác', icon: FileText },
] as const;

// Types grouped under "Khác"
const OTHER_TYPES = ['ASSIGNMENT', 'TRANSFER', 'CLAIM', 'CONVERT', 'LABEL', 'ORDER', 'PAYMENT'];

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    NOTE: 'Ghi chú', CALL: 'Cuộc gọi', STATUS_CHANGE: 'Đổi trạng thái',
    ASSIGNMENT: 'Phân lead', TRANSFER: 'Chuyển', CLAIM: 'Nhận',
    CONVERT: 'Chuyển đổi KH', LABEL: 'Nhãn', ORDER: 'Đơn hàng', PAYMENT: 'Thanh toán',
  };
  return map[type] || type;
}

function getTypeIcon(type: string) {
  if (type === 'NOTE') return <MessageSquare className="h-4 w-4 text-sky-500" />;
  if (type === 'CALL') return <Phone className="h-4 w-4 text-green-500" />;
  if (type === 'STATUS_CHANGE') return <ArrowRightLeft className="h-4 w-4 text-amber-500" />;
  return <FileText className="h-4 w-4 text-gray-400" />;
}

/** Activity timeline with filter tabs: Tất cả | Ghi chú | Cuộc gọi | Trạng thái | Khác */
export function ActivityTimelineWithFilterTabs({ activities }: { activities: ActivityItem[] }) {
  const [activeTab, setActiveTab] = useState<string>('ALL');

  const filtered = activeTab === 'ALL'
    ? activities
    : activeTab === 'OTHER'
      ? activities.filter(a => OTHER_TYPES.includes(a.type))
      : activities.filter(a => a.type === activeTab);

  // Count per tab
  const counts: Record<string, number> = { ALL: activities.length };
  activities.forEach(a => {
    if (OTHER_TYPES.includes(a.type)) {
      counts['OTHER'] = (counts['OTHER'] || 0) + 1;
    } else {
      counts[a.type] = (counts[a.type] || 0) + 1;
    }
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-4 font-semibold text-gray-900">Lịch sử hoạt động</h3>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map(tab => {
          const count = counts[tab.value] || 0;
          if (tab.value !== 'ALL' && count === 0) return null;
          return (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.value
                  ? 'bg-sky-100 text-sky-700'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                activeTab === tab.value ? 'bg-sky-200 text-sky-800' : 'bg-gray-200 text-gray-600'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <p className="text-sm text-gray-400">Chưa có hoạt động nào</p>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {filtered.map((a) => (
            <div key={a.id} className="flex gap-3 border-b border-gray-100 pb-3 last:border-0">
              <div className="mt-0.5 shrink-0">{getTypeIcon(a.type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-700">{a.user?.name || '—'}</span>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                    {getTypeLabel(a.type)}
                  </span>
                  <span className="text-xs text-gray-400 ml-auto whitespace-nowrap">
                    {formatDateTime(a.createdAt)}
                  </span>
                </div>
                {a.content && (
                  <p className="mt-1 text-sm text-gray-600 whitespace-pre-line">{a.content}</p>
                )}
                {/* Call duration */}
                {a.type === 'CALL' && a.metadata?.duration && (
                  <p className="mt-0.5 text-xs text-gray-400">
                    Thời lượng: {Math.floor(a.metadata.duration / 60)} phút {a.metadata.duration % 60}s
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
