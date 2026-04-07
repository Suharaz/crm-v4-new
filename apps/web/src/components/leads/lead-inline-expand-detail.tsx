'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/shared/status-badge';
import { api } from '@/lib/api-client';
import { cn, formatDate, formatVND } from '@/lib/utils';
import { ExternalLink, Phone, Mail, User, Building, Tag, Calendar, Package, Loader2, MessageSquarePlus, Tags, ArrowRightLeft, CreditCard } from 'lucide-react';
import { CreateOrderDialog } from '@/components/orders/create-order-dialog';

const CACHE_PREFIX = 'crm_preview_';
const CACHE_TTL = 24 * 60 * 60 * 1000;

function readCache(key: string) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL) { localStorage.removeItem(CACHE_PREFIX + key); return null; }
    return parsed;
  } catch { return null; }
}
function writeCache(key: string, data: any, activities: any[]) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, activities, ts: Date.now() })); } catch { /* */ }
}
function invalidateCache(entityType: string, entityId: string) {
  try { localStorage.removeItem(CACHE_PREFIX + `${entityType}:${entityId}`); } catch { /* */ }
}

interface Props {
  entityType: 'lead' | 'customer';
  entityId: string;
  colSpan: number;
}

/** Inline expandable detail row for lead/customer — replaces popup dialog. */
export function LeadInlineExpandDetail({ entityType, entityId, colSpan }: Props) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<any[]>([]);

  // Quick actions
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [allLabels, setAllLabels] = useState<any[]>([]);
  const [labelSaving, setLabelSaving] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [allDepts, setAllDepts] = useState<any[]>([]);
  const [transferring, setTransferring] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [pmtOrderId, setPmtOrderId] = useState('');
  const [pmtAmount, setPmtAmount] = useState('');
  const [pmtContent, setPmtContent] = useState('');
  const [pmtSaving, setPmtSaving] = useState(false);

  useEffect(() => {
    const cacheKey = `${entityType}:${entityId}`;
    const cached = readCache(cacheKey);
    if (cached) {
      setData(cached.data);
      setActivities(cached.activities);
      setLoading(false);
      return;
    }

    const endpoint = entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`;
    const actEndpoint = `/${entityType === 'lead' ? 'leads' : 'customers'}/${entityId}/activities`;

    Promise.all([
      api.get<{ data: any }>(endpoint),
      api.get<{ data: any[] }>(actEndpoint).catch(() => ({ data: [] })),
    ]).then(async ([entityRes, actRes]) => {
      setData(entityRes.data);
      let allActs = (actRes.data || []).map((a: any) => ({ ...a, _source: 'lead' }));
      // Merge customer activities if lead has customerId
      if (entityType === 'lead' && entityRes.data?.customerId) {
        try {
          const custActs = await api.get<{ data: any[] }>(`/customers/${entityRes.data.customerId}/activities`);
          const custItems = (custActs.data || []).map((a: any) => ({ ...a, _source: 'customer' }));
          allActs = [...allActs, ...custItems].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        } catch { /* ok */ }
      }
      setActivities(allActs);
      writeCache(cacheKey, entityRes.data, allActs);
    }).catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  const labels = data?.labels || [];
  const currentLabelIds = new Set(labels.map((ll: any) => String((ll.label || ll).id)));

  async function submitNote() {
    if (!noteText.trim()) return;
    setNoteSaving(true);
    try {
      await api.post(`/${entityType === 'lead' ? 'leads' : 'customers'}/${entityId}/activities`, { type: 'NOTE', content: noteText.trim() });
      setNoteText(''); setNoteOpen(false);
      invalidateCache(entityType, entityId);
      const actRes = await api.get<{ data: any[] }>(`/${entityType === 'lead' ? 'leads' : 'customers'}/${entityId}/activities`).catch(() => ({ data: [] }));
      setActivities(actRes.data || []);
      router.refresh();
    } catch { /* */ }
    setNoteSaving(false);
  }

  async function toggleLabel(labelId: string) {
    setLabelSaving(true);
    try {
      if (currentLabelIds.has(labelId)) {
        await api.delete(`/${entityType}s/${entityId}/labels/${labelId}`);
      } else {
        await api.post(`/${entityType}s/${entityId}/labels`, { labelIds: [labelId] });
      }
      invalidateCache(entityType, entityId);
      const res = await api.get<{ data: any }>(entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`);
      setData(res.data);
    } catch { /* */ }
    setLabelSaving(false);
  }

  async function transferToDept(deptId: string) {
    setTransferring(true);
    try {
      await api.post(`/leads/${entityId}/transfer`, { targetType: 'DEPARTMENT', targetDeptId: deptId });
      invalidateCache(entityType, entityId);
      setTransferOpen(false);
      router.refresh();
    } catch { /* */ }
    setTransferring(false);
  }

  async function transferToFloating() {
    setTransferring(true);
    try {
      await api.post(`/leads/${entityId}/transfer`, { targetType: 'FLOATING' });
      invalidateCache(entityType, entityId);
      setTransferOpen(false);
      router.refresh();
    } catch { /* */ }
    setTransferring(false);
  }

  // Quick payment for existing order
  async function submitPayment() {
    if (!pmtAmount.trim() || !pmtOrderId) return;
    setPmtSaving(true);
    try {
      await api.post('/payments', { orderId: pmtOrderId, amount: Number(pmtAmount), transferContent: pmtContent || undefined });
      setPmtAmount(''); setPmtContent(''); setPmtOrderId(''); setPaymentOpen(false);
      invalidateCache(entityType, entityId);
      router.refresh();
    } catch { /* */ }
    setPmtSaving(false);
  }

  const pendingOrders = (data?.orders || []).filter((o: any) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && o.status !== 'REFUNDED');
  const hasOrder = pendingOrders.length > 0;

  // Fetch depts on transfer open
  useEffect(() => {
    if (!transferOpen || allDepts.length > 0) return;
    const cached = readCache('_all_depts');
    if (cached?.data) { setAllDepts(cached.data); return; }
    api.get<{ data: any[] }>('/departments').then(r => {
      setAllDepts(r.data || []);
      writeCache('_all_depts', r.data || [], []);
    }).catch(() => {});
  }, [transferOpen, allDepts.length]);

  useEffect(() => {
    if (!labelPickerOpen || allLabels.length > 0) return;
    const cached = readCache('_all_labels');
    if (cached?.data) { setAllLabels(cached.data); return; }
    api.get<{ data: any[] }>('/labels').then(r => {
      setAllLabels(r.data || []);
      writeCache('_all_labels', r.data || [], []);
    }).catch(() => {});
  }, [labelPickerOpen, allLabels.length]);

  if (loading) {
    return (
      <tr className="bg-sky-50/30">
        <td colSpan={colSpan} className="px-6 py-6 text-center">
          <Loader2 className="h-5 w-5 animate-spin text-sky-500 mx-auto" />
        </td>
      </tr>
    );
  }

  if (!data) {
    return (
      <tr className="bg-gray-50"><td colSpan={colSpan} className="px-6 py-4 text-center text-gray-400">Không tìm thấy</td></tr>
    );
  }

  return (
    <tr className="bg-sky-50/20">
      <td colSpan={colSpan} className="px-4 py-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          {/* Col 1: Calls + Notes + Orders */}
          <div className="space-y-2">
            {/* Orders section */}
            {data.orders && data.orders.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-700 text-xs uppercase mb-1">Đơn hàng ({data.orders.length})</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {data.orders.map((o: any) => (
                    <div key={o.id} className="rounded-md border border-gray-100 bg-white text-xs">
                      <div className="flex items-center justify-between px-2.5 py-1.5">
                        <div>
                          <span className="font-medium text-gray-700">#{o.id}</span>
                          <span className="ml-1.5 text-gray-500">{o.product?.name || '—'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{formatVND(Number(o.totalAmount))}</span>
                          <StatusBadge status={o.status} />
                        </div>
                      </div>
                      {o.payments && o.payments.length > 0 && (
                        <div className="border-t border-gray-50 px-2.5 py-1 space-y-0.5">
                          {o.payments.map((p: any) => (
                            <div key={p.id} className="flex items-center justify-between text-[11px] text-gray-500">
                              <span>{p.paymentType?.name || 'CK'} {p.transferContent ? `— ${p.transferContent}` : ''}</span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-gray-700">{formatVND(Number(p.amount))}</span>
                                <StatusBadge status={p.status} />
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Cuộc gọi */}
            {(() => {
              const calls = activities.filter((a: any) => a.type === 'CALL');
              return calls.length > 0 ? (
                <div>
                  <h4 className="font-semibold text-gray-700 text-xs uppercase mb-1">Cuộc gọi ({calls.length})</h4>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {calls.slice(0, 5).map((a: any) => (
                      <div key={a.id} className="text-xs bg-white rounded-md px-2.5 py-1.5 border border-gray-100">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-gray-700">{a.user?.name || '—'}</span>
                          {a._source === 'customer' && <span className="text-[9px] bg-blue-100 text-blue-600 rounded px-1">KH</span>}
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-400">{formatDate(a.createdAt)}</span>
                          {a.metadata?.duration && <span className="text-gray-400 ml-auto">{Math.floor(a.metadata.duration / 60)}p{a.metadata.duration % 60}s</span>}
                        </div>
                        {a.content && <p className="text-gray-600 mt-0.5">{a.content.substring(0, 80)}{a.content.length > 80 ? '...' : ''}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {/* Ghi chú */}
            {(() => {
              const notes = activities.filter((a: any) => a.type === 'NOTE');
              return (
                <div>
                  <h4 className="font-semibold text-gray-700 text-xs uppercase mb-1">Ghi chú ({notes.length})</h4>
                  {notes.length === 0 ? (
                    <p className="text-xs text-gray-400">Chưa có ghi chú</p>
                  ) : (
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {notes.slice(0, 5).map((a: any) => (
                        <div key={a.id} className="text-xs bg-white rounded-md px-2.5 py-1.5 border border-gray-100">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-gray-700">{a.user?.name || '—'}</span>
                            {a._source === 'customer' && <span className="text-[9px] bg-blue-100 text-blue-600 rounded px-1">KH</span>}
                            <span className="text-gray-300">·</span>
                            <span className="text-gray-400">{formatDate(a.createdAt)}</span>
                          </div>
                          <p className="text-gray-600 mt-0.5">{a.content?.substring(0, 100)}{(a.content?.length || 0) > 100 ? '...' : ''}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Col 3: Quick Actions */}
          <div className="space-y-2">
            <h4 className="font-semibold text-gray-700 text-xs uppercase">Thao tác nhanh</h4>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={noteOpen ? 'default' : 'outline'} onClick={() => { setNoteOpen(!noteOpen); setLabelPickerOpen(false); }}>
                <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />Ghi chú
              </Button>
              <Button size="sm" variant={labelPickerOpen ? 'default' : 'outline'} onClick={() => { setLabelPickerOpen(!labelPickerOpen); setNoteOpen(false); }}>
                <Tags className="h-3.5 w-3.5 mr-1" />Nhãn
              </Button>
              {entityType === 'lead' && (
                <Button size="sm" variant={transferOpen ? 'default' : 'outline'} onClick={() => { setTransferOpen(!transferOpen); setNoteOpen(false); setLabelPickerOpen(false); }}>
                  <ArrowRightLeft className="h-3.5 w-3.5 mr-1" />Chuyển
                </Button>
              )}
              {entityType === 'lead' && (
                <Button size="sm" variant={paymentOpen ? 'default' : 'outline'} onClick={() => { setPaymentOpen(!paymentOpen); setNoteOpen(false); setLabelPickerOpen(false); setTransferOpen(false); }}>
                  <CreditCard className="h-3.5 w-3.5 mr-1" />Thêm giao dịch
                </Button>
              )}
              {entityType === 'lead' && (
                <CreateOrderDialog customerId={data.customerId ? String(data.customerId) : ''} leadId={entityId} products={[]} paymentTypes={[]} />
              )}
              <Link href={entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`}>
                <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5 mr-1" />Chi tiết</Button>
              </Link>
            </div>

            {/* Inline note */}
            {noteOpen && (
              <div className="space-y-2">
                <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Nhập ghi chú..." rows={2} className="text-sm" autoFocus />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>Hủy</Button>
                  <Button size="sm" onClick={submitNote} disabled={noteSaving || !noteText.trim()}>{noteSaving ? 'Lưu...' : 'Lưu'}</Button>
                </div>
              </div>
            )}

            {/* Inline label picker */}
            {labelPickerOpen && (
              <div className="flex flex-wrap gap-1.5">
                {allLabels.length === 0 && <span className="text-xs text-gray-400">Đang tải...</span>}
                {allLabels.map((l: any) => (
                  <button key={l.id} onClick={() => toggleLabel(String(l.id))} disabled={labelSaving}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${currentLabelIds.has(String(l.id)) ? 'text-white ring-2 ring-offset-1 ring-gray-400' : 'text-white opacity-50 hover:opacity-80'}`}
                    style={{ backgroundColor: l.color || '#6b7280' }}
                  >{l.name}</button>
                ))}
              </div>
            )}

            {/* Inline transfer picker */}
            {transferOpen && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500">Chọn phòng ban hoặc thả nổi:</p>
                <div className="flex flex-wrap gap-2">
                  {allDepts.map((d: any) => (
                    <Button key={d.id} size="sm" variant="outline" disabled={transferring || String(d.id) === String(data?.departmentId)}
                      onClick={() => transferToDept(String(d.id))}
                    >
                      <Building className="h-3.5 w-3.5 mr-1" />{d.name}
                    </Button>
                  ))}
                  <Button size="sm" variant="outline" className="text-violet-600 border-violet-200" disabled={transferring} onClick={transferToFloating}>
                    Thả nổi
                  </Button>
                </div>
              </div>
            )}

            {/* Inline payment form */}
            {paymentOpen && (
              <div className="space-y-2">
                {pendingOrders.length === 0 ? (
                  <p className="text-xs text-gray-400">Chưa có đơn hàng — hãy tạo đơn hàng trước</p>
                ) : (
                  <>
                    {pendingOrders.length > 1 ? (
                      <div className="space-y-1">
                        <p className="text-xs text-gray-500">Chọn đơn hàng:</p>
                        {pendingOrders.map((o: any) => (
                          <label key={o.id} className={cn('flex items-center gap-2 rounded border px-2 py-1.5 cursor-pointer text-xs',
                            pmtOrderId === String(o.id) ? 'border-sky-400 bg-sky-50' : 'border-gray-200')}>
                            <input type="radio" name="pmtOrder" checked={pmtOrderId === String(o.id)} onChange={() => setPmtOrderId(String(o.id))} />
                            <span>#{o.id} — {o.product?.name || 'N/A'} — {formatVND(Number(o.totalAmount))}</span>
                            <StatusBadge status={o.status} />
                          </label>
                        ))}
                      </div>
                    ) : (
                      <AutoSelect orderId={String(pendingOrders[0].id)} onSelect={setPmtOrderId}>
                        Đơn #{pendingOrders[0].id} — {pendingOrders[0].product?.name} — {formatVND(Number(pendingOrders[0].totalAmount))}
                      </AutoSelect>
                    )}
                    <div className="flex gap-2">
                      <Input type="number" value={pmtAmount} onChange={e => setPmtAmount(e.target.value)} placeholder="Số tiền (VNĐ)" className="text-sm" autoFocus />
                      <Input value={pmtContent} onChange={e => setPmtContent(e.target.value)} placeholder="Nội dung CK" className="text-sm" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setPaymentOpen(false)}>Hủy</Button>
                      <Button size="sm" onClick={submitPayment} disabled={pmtSaving || !pmtAmount.trim() || !pmtOrderId}>{pmtSaving ? 'Lưu...' : 'Thêm giao dịch'}</Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

/** Auto-select single order on mount */
function AutoSelect({ orderId, onSelect, children }: { orderId: string; onSelect: (id: string) => void; children: React.ReactNode }) {
  useEffect(() => { onSelect(orderId); }, [orderId, onSelect]);
  return <p className="text-xs text-gray-500">{children}</p>;
}
