'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Clock, User, FileText, Link2, Search, Loader2, Sparkles, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import ReactMarkdown from 'react-markdown';

const CALL_TYPE_CONFIG: Record<string, { label: string; icon: typeof PhoneIncoming; color: string }> = {
  INCOMING: { label: 'Gọi đến', icon: PhoneIncoming, color: 'text-emerald-600' },
  OUTGOING: { label: 'Gọi đi', icon: PhoneOutgoing, color: 'text-sky-600' },
  MISSED: { label: 'Nhỡ', icon: PhoneMissed, color: 'text-red-500' },
};

/** 8-color pastel palette for hash-based tag coloring. */
const TAG_COLORS = [
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
  'bg-orange-100 text-orange-700',
  'bg-teal-100 text-teal-700',
];

function hashTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0;
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

/** Parse analysis JSON. Handles both new JSON format and legacy plain text. */
function parseAnalysis(raw: string | null): { tags: string[]; detail: string } | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return { tags: parsed.tags || [], detail: parsed.detail || '' };
  } catch {
    return { tags: [], detail: raw };
  }
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}p${s > 0 ? ` ${s}s` : ''}` : `${s}s`;
}

/** Collapsible section with "Xem thêm / Thu gọn" toggle. */
function CollapsibleSection({ title, titleClass, children }: { title: string; titleClass?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1 text-xs font-semibold uppercase mb-1 hover:opacity-80">
        <span className={titleClass || 'text-gray-500'}>{title}</span>
        {open ? <ChevronUp className="h-3 w-3 text-gray-400" /> : <ChevronDown className="h-3 w-3 text-gray-400" />}
      </button>
      {open && children}
    </div>
  );
}

/** Call log list with date filter, tags, analysis, and AI summary. */
export function CallLogListClient({ callLogs: initialLogs }: { callLogs: any[] }) {
  const [callLogs, setCallLogs] = useState(initialLogs);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  async function fetchFiltered() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      const res = await api.get<{ data: any[] }>(`/call-logs?${params}`);
      setCallLogs(res.data);
      setSummary(null);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }

  async function handleSummarize() {
    if (!dateFrom || !dateTo) { toast.error('Chọn khoảng ngày trước'); return; }
    setSummarizing(true);
    try {
      const res = await api.post<{ data: string }>('/call-logs/summarize', { dateFrom, dateTo });
      setSummary(res.data);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi tóm tắt');
    } finally {
      setSummarizing(false);
    }
  }

  function clearFilter() {
    setDateFrom(''); setDateTo('');
    setCallLogs(initialLogs); setSummary(null);
  }

  const hasFilter = dateFrom || dateTo;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Cuộc gọi</h1>
      <p className="text-sm text-gray-500 mb-4">Lịch sử cuộc gọi — bấm để xem chi tiết + phân tích AI</p>

      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
        <span className="text-gray-400">→</span>
        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
        <Button size="sm" variant="outline" onClick={fetchFiltered} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
          Lọc
        </Button>
        {hasFilter && (
          <Button size="sm" variant="ghost" onClick={clearFilter} className="text-gray-400">
            <X className="h-4 w-4 mr-1" />Xóa lọc
          </Button>
        )}
        {hasFilter && (
          <Button size="sm" onClick={handleSummarize} disabled={summarizing} className="ml-auto">
            {summarizing ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Đang tóm tắt...</> : <><Sparkles className="h-4 w-4 mr-1" />Tóm tắt AI</>}
          </Button>
        )}
      </div>

      {/* AI Summary */}
      {summary && (
        <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-purple-900 flex items-center gap-2"><Sparkles className="h-4 w-4" />Tóm tắt AI ({dateFrom} → {dateTo})</h3>
            <Button size="sm" variant="ghost" onClick={() => setSummary(null)} className="text-purple-400 h-7"><X className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="prose prose-sm prose-purple max-w-none text-sm text-purple-900 [&_strong]:text-purple-950 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-1">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Call list */}
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
            const analysis = parseAnalysis(c.analysis);
            const isMatched = c.matchStatus !== 'UNMATCHED';

            return (
              <div key={id}>
                {/* Row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : id)}
                  className={cn(
                    'rounded-lg border bg-white px-4 py-3 cursor-pointer transition-all',
                    isExpanded ? 'border-sky-300 bg-sky-50/50' : 'border-gray-200 hover:border-gray-300',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn('h-5 w-5 shrink-0', config.color)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{c.phoneNumber}</span>
                        <span className={cn('text-xs', config.color)}>{config.label}</span>
                        {hasContent && <span title="Có nội dung"><FileText className="h-3 w-3 text-amber-500" /></span>}
                        {analysis && <span title="Đã phân tích AI"><Sparkles className="h-3 w-3 text-purple-500" /></span>}
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

                  {/* Tags row — always visible if analysis has tags */}
                  {analysis && analysis.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 ml-8">
                      {analysis.tags.map((tag, i) => (
                        <span key={i} className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', hashTagColor(tag))}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="ml-8 mr-2 mt-1 mb-2 rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-3 text-sm">
                    {/* Content — collapsible */}
                    <CollapsibleSection title="Nội dung hội thoại">
                      {hasContent ? (
                        <p className="whitespace-pre-wrap text-gray-700 bg-white rounded-md border border-gray-100 p-3">{c.content}</p>
                      ) : (
                        <p className="text-gray-400 italic">Chưa có nội dung</p>
                      )}
                    </CollapsibleSection>

                    {/* AI Analysis — collapsible */}
                    {analysis && analysis.detail && (
                      <CollapsibleSection title="Phân tích AI" titleClass="text-purple-600">
                        <div className="bg-white rounded-md border border-purple-100 p-3 prose prose-sm prose-gray max-w-none text-sm [&_strong]:text-gray-800 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:my-0.5 [&_p]:my-1">
                          <ReactMarkdown>{analysis.detail}</ReactMarkdown>
                        </div>
                      </CollapsibleSection>
                    )}

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
