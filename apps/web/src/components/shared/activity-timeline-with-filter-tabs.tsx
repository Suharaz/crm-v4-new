'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/utils';
import { MessageSquare, Phone, ArrowRightLeft, FileText, Activity, ShoppingCart, CreditCard, CheckCircle } from 'lucide-react';

interface ActivityItem {
  id: string;
  type: string;
  content?: string;
  user?: { name: string };
  createdAt: string;
  metadata?: { type?: string; duration?: number; [key: string]: unknown } | null;
}

const TABS = [
  { value: 'ALL', label: 'Tất cả', icon: Activity },
  { value: 'NOTE', label: 'Ghi chú', icon: MessageSquare },
  { value: 'CALL', label: 'Cuộc gọi', icon: Phone },
  { value: 'STATUS_CHANGE', label: 'Trạng thái', icon: ArrowRightLeft },
  { value: 'PAYMENT', label: 'Thanh toán', icon: CreditCard },
  { value: 'OTHER', label: 'Khác', icon: FileText },
] as const;

// Types grouped under "Khác"
const OTHER_TYPES = ['ASSIGNMENT', 'TRANSFER', 'CLAIM', 'CONVERT', 'LABEL'];

// Metadata types that indicate payment/order activities (stored as NOTE type)
const PAYMENT_META_TYPES = ['ORDER_CREATED', 'PAYMENT_CREATED', 'PAYMENT_VERIFIED'];

/** Check if a NOTE activity is actually a payment/order activity via metadata */
function isPaymentActivity(a: ActivityItem): boolean {
  return !!a.metadata?.type && PAYMENT_META_TYPES.includes(a.metadata.type);
}

/** Get effective display type — resolves NOTE+metadata into ORDER/PAYMENT */
function getEffectiveType(a: ActivityItem): string {
  if (a.type === 'NOTE' && a.metadata?.type) {
    if (a.metadata.type === 'ORDER_CREATED') return 'ORDER';
    if (a.metadata.type === 'PAYMENT_CREATED' || a.metadata.type === 'PAYMENT_VERIFIED') return 'PAYMENT';
  }
  return a.type;
}

function getTypeLabelByEffective(effectiveType: string, metaType?: string): string {
  if (metaType === 'ORDER_CREATED') return 'Tạo đơn hàng';
  if (metaType === 'PAYMENT_CREATED') return 'Thanh toán';
  if (metaType === 'PAYMENT_VERIFIED') return 'Xác nhận TT';
  const map: Record<string, string> = {
    NOTE: 'Ghi chú', CALL: 'Cuộc gọi', STATUS_CHANGE: 'Đổi trạng thái',
    ASSIGNMENT: 'Phân lead', TRANSFER: 'Chuyển', CLAIM: 'Nhận',
    CONVERT: 'Chuyển đổi KH', LABEL: 'Nhãn', ORDER: 'Đơn hàng', PAYMENT: 'Thanh toán',
  };
  return map[effectiveType] || effectiveType;
}

function getTypeIconByEffective(effectiveType: string, metaType?: string) {
  if (metaType === 'ORDER_CREATED') return <ShoppingCart className="h-4 w-4 text-blue-500" />;
  if (metaType === 'PAYMENT_CREATED') return <CreditCard className="h-4 w-4 text-emerald-500" />;
  if (metaType === 'PAYMENT_VERIFIED') return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (effectiveType === 'NOTE') return <MessageSquare className="h-4 w-4 text-sky-500" />;
  if (effectiveType === 'CALL') return <Phone className="h-4 w-4 text-green-500" />;
  if (effectiveType === 'STATUS_CHANGE') return <ArrowRightLeft className="h-4 w-4 text-amber-500" />;
  return <FileText className="h-4 w-4 text-slate-400" />;
}

/** Activity timeline with filter tabs: Tất cả | Ghi chú | Cuộc gọi | Trạng thái | Khác */
export function ActivityTimelineWithFilterTabs({ activities }: { activities: ActivityItem[] }) {
  const [activeTab, setActiveTab] = useState<string>('ALL');

  const filtered = activeTab === 'ALL'
    ? activities
    : activeTab === 'PAYMENT'
      ? activities.filter(a => isPaymentActivity(a))
      : activeTab === 'NOTE'
        ? activities.filter(a => a.type === 'NOTE' && !isPaymentActivity(a))
        : activeTab === 'OTHER'
          ? activities.filter(a => OTHER_TYPES.includes(a.type))
          : activities.filter(a => a.type === activeTab);

  // Count per tab (using effective types)
  const counts: Record<string, number> = { ALL: activities.length };
  activities.forEach(a => {
    if (isPaymentActivity(a)) {
      counts['PAYMENT'] = (counts['PAYMENT'] || 0) + 1;
    } else if (OTHER_TYPES.includes(a.type)) {
      counts['OTHER'] = (counts['OTHER'] || 0) + 1;
    } else {
      counts[a.type] = (counts[a.type] || 0) + 1;
    }
  });

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 font-semibold text-slate-900">Lịch sử hoạt động</h3>

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
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                activeTab === tab.value ? 'bg-sky-200 text-sky-800' : 'bg-slate-200 text-slate-600'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Timeline */}
      {filtered.length === 0 ? (
        <p className="text-sm text-slate-400">Chưa có hoạt động nào</p>
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {filtered.map((a) => {
            const effectiveType = getEffectiveType(a);
            const metaType = a.metadata?.type;
            const isPmt = isPaymentActivity(a);
            return (
              <div key={a.id} className={`flex gap-3 border-b border-slate-100 pb-3 last:border-0 ${isPmt ? 'bg-emerald-50/40 rounded-lg px-2 py-1.5 -mx-1' : ''}`}>
                <div className="mt-0.5 shrink-0">{getTypeIconByEffective(effectiveType, metaType)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-700">{a.user?.name || '—'}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      isPmt ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {getTypeLabelByEffective(effectiveType, metaType)}
                    </span>
                    <span className="text-xs text-slate-400 ml-auto whitespace-nowrap">
                      {formatDateTime(a.createdAt)}
                    </span>
                  </div>
                  {a.content && (
                    <p className="mt-1 text-sm text-slate-600 whitespace-pre-line">{a.content}</p>
                  )}
                  {/* Call duration */}
                  {a.type === 'CALL' && a.metadata?.duration && (
                    <p className="mt-0.5 text-xs text-slate-400">
                      Thời lượng: {Math.floor(a.metadata.duration / 60)} phút {a.metadata.duration % 60}s
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
