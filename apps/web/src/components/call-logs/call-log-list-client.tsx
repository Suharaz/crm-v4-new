'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, User, FileText, Link2 } from 'lucide-react';

const CALL_TYPE_CONFIG: Record<string, { label: string; icon: typeof PhoneIncoming; color: string }> = {
  INCOMING: { label: 'Gọi đến', icon: PhoneIncoming, color: 'text-emerald-600' },
  OUTGOING: { label: 'Gọi đi', icon: PhoneOutgoing, color: 'text-sky-600' },
  MISSED: { label: 'Nhỡ', icon: PhoneMissed, color: 'text-red-500' },
};

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}p${s > 0 ? ` ${s}s` : ''}` : `${s}s`;
}

interface Props {
  callLogs: any[];
}

/** Call log list with inline expand for conversation content. */
export function CallLogListClient({ callLogs }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Cuộc gọi</h1>
      <p className="text-sm text-gray-500 mb-4">Lịch sử cuộc gọi — bấm để xem chi tiết hội thoại</p>

      {callLogs.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">Không có cuộc gọi nào</div>
      ) : (
        <div className="space-y-1.5">
          {callLogs.map((c: any) => {
            const id = String(c.id);
            const isExpanded = expandedId === id;
            const config = CALL_TYPE_CONFIG[c.callType] || CALL_TYPE_CONFIG.OUTGOING;
            const Icon = config.icon;
            const hasContent = c.content && c.content.trim();
            const isMatched = c.matchStatus !== 'UNMATCHED';

            return (
              <div key={id}>
                {/* Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : id)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg border bg-white px-4 py-3 cursor-pointer transition-all',
                    isExpanded ? 'border-sky-300 bg-sky-50/50' : 'border-gray-200 hover:border-gray-300',
                  )}
                >
                  <Icon className={cn('h-5 w-5 shrink-0', config.color)} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{c.phoneNumber}</span>
                      <span className={cn('text-xs', config.color)}>{config.label}</span>
                      {hasContent && <span title="Có ghi chú"><FileText className="h-3 w-3 text-amber-500" /></span>}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">{formatDateTime(c.callTime)}</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-sm">
                    <span className="text-gray-500 flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDuration(c.duration)}</span>
                    {isMatched ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 flex items-center gap-1"><Link2 className="h-3 w-3" />Đã ghép</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">Chưa ghép</span>
                    )}
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="ml-8 mr-2 mt-1 mb-2 rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-3 text-sm">
                    {/* Content / conversation */}
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Nội dung hội thoại</h4>
                      {hasContent ? (
                        <p className="whitespace-pre-wrap text-gray-700 bg-white rounded-md border border-gray-100 p-3">{c.content}</p>
                      ) : (
                        <p className="text-gray-400 italic">Chưa có nội dung ghi chú</p>
                      )}
                    </div>

                    {/* Match info */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-xs text-gray-500">Trạng thái ghép</span>
                        <p className="font-medium text-gray-700">{isMatched ? 'Đã ghép nối' : 'Chưa ghép nối'}</p>
                      </div>
                      {c.matchedEntityType && (
                        <div>
                          <span className="text-xs text-gray-500">Ghép với</span>
                          <p className="font-medium text-gray-700 flex items-center gap-1">
                            <User className="h-3.5 w-3.5" />
                            {c.matchedEntityType === 'LEAD' ? 'Lead' : 'Khách hàng'} #{c.matchedEntityId}
                          </p>
                        </div>
                      )}
                      <div>
                        <span className="text-xs text-gray-500">Thời lượng</span>
                        <p className="font-medium text-gray-700">{formatDuration(c.duration)}</p>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">External ID</span>
                        <p className="font-medium text-gray-700 text-xs">{c.externalId || '—'}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
