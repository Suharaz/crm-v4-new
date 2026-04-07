'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/shared/status-badge';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { ExternalLink, Phone, Mail, User, Building, Tag, Calendar, Package, Loader2, MessageSquarePlus, Tags, CreditCard } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { formatVND } from '@/lib/utils';
import { CreateOrderDialog } from '@/components/orders/create-order-dialog';

interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: 'lead' | 'customer';
  entityId: string | null;
}

const CACHE_PREFIX = 'crm_preview_';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/** Read from localStorage with TTL check. */
function readCache(key: string) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL) { localStorage.removeItem(CACHE_PREFIX + key); return null; }
    return parsed;
  } catch { return null; }
}

/** Write to localStorage with timestamp. */
function writeCache(key: string, data: any, activities: any[]) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, activities, ts: Date.now() })); } catch { /* quota */ }
}

/** Invalidate cache for a specific entity. Call after update/edit. */
export function invalidatePreviewCache(entityType: string, entityId: string) {
  try { localStorage.removeItem(CACHE_PREFIX + `${entityType}:${entityId}`); } catch { /* */ }
}

/** Quick preview dialog for lead/customer — shows key info + quick actions. */
export function EntityQuickPreviewDialog({ open, onOpenChange, entityType, entityId }: PreviewDialogProps) {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);
  // Quick action states
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [allLabels, setAllLabels] = useState<any[]>([]);
  const [labelSaving, setLabelSaving] = useState(false);
  const [products, setProducts] = useState<any[]>([]);
  const [paymentTypes, setPaymentTypes] = useState<any[]>([]);
  const [orderDataLoaded, setOrderDataLoaded] = useState(false);
  // Payment quick action
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [pmtOrderId, setPmtOrderId] = useState('');
  const [pmtAmount, setPmtAmount] = useState('');
  const [pmtContent, setPmtContent] = useState('');
  const [pmtSaving, setPmtSaving] = useState(false);

  useEffect(() => {
    if (!open || !entityId) return;

    const cacheKey = `${entityType}:${entityId}`;
    const cached = readCache(cacheKey);

    if (cached) {
      setData(cached.data);
      setActivities(cached.activities);
      setLoading(false);
      return;
    }

    setLoading(true);
    const endpoint = entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`;
    const activitiesEndpoint = `/${entityType === 'lead' ? 'leads' : 'customers'}/${entityId}/activities`;

    Promise.all([
      api.get<{ data: any }>(endpoint),
      api.get<{ data: any[] }>(activitiesEndpoint).catch(() => ({ data: [] })),
    ])
      .then(([entityRes, actRes]) => {
        const d = entityRes.data;
        const a = actRes.data || [];
        setData(d);
        setActivities(a);
        writeCache(cacheKey, d, a);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, entityId, entityType]);

  const detailUrl = entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`;
  const labels = data?.labels || data?.leadLabels || data?.customerLabels || [];
  const currentLabelIds = new Set(labels.map((ll: any) => String((ll.label || ll).id)));

  // Quick note submit
  async function submitNote() {
    if (!noteText.trim() || !entityId) return;
    setNoteSaving(true);
    try {
      await api.post(`/${entityType === 'lead' ? 'leads' : 'customers'}/${entityId}/activities`, { type: 'NOTE', content: noteText.trim() });
      setNoteText('');
      setNoteOpen(false);
      invalidatePreviewCache(entityType, entityId);
      // Refresh activities in-place
      const actRes = await api.get<{ data: any[] }>(`/${entityType === 'lead' ? 'leads' : 'customers'}/${entityId}/activities`).catch(() => ({ data: [] }));
      setActivities(actRes.data || []);
      router.refresh();
    } catch { /* */ }
    setNoteSaving(false);
  }

  // Quick label toggle
  async function toggleLabel(labelId: string) {
    if (!entityId) return;
    setLabelSaving(true);
    try {
      if (currentLabelIds.has(labelId)) {
        await api.delete(`/${entityType}s/${entityId}/labels/${labelId}`);
      } else {
        await api.post(`/${entityType}s/${entityId}/labels`, { labelIds: [labelId] });
      }
      invalidatePreviewCache(entityType, entityId);
      // Refresh entity data + server page
      const res = await api.get<{ data: any }>(entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`);
      setData(res.data);
      router.refresh();
    } catch { /* */ }
    setLabelSaving(false);
  }

  // Quick payment submit
  async function submitPayment() {
    if (!pmtAmount.trim() || !pmtOrderId) return;
    setPmtSaving(true);
    try {
      await api.post('/payments', { orderId: pmtOrderId, amount: Number(pmtAmount), transferContent: pmtContent || undefined });
      setPmtAmount(''); setPmtContent(''); setPmtOrderId(''); setPaymentOpen(false);
      if (entityId) invalidatePreviewCache(entityType, entityId);
      // Refresh entity data
      const res = await api.get<{ data: any }>(entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`);
      setData(res.data);
      router.refresh();
    } catch { /* */ }
    setPmtSaving(false);
  }

  const pendingOrders = (data?.orders || []).filter((o: any) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && o.status !== 'REFUNDED');
  const hasOrder = pendingOrders.length > 0;

  // Fetch labels list (cached in localStorage 24h)
  useEffect(() => {
    if (!labelPickerOpen || allLabels.length > 0) return;
    const cached = readCache('_all_labels');
    if (cached?.data) { setAllLabels(cached.data); return; }
    api.get<{ data: any[] }>('/labels').then(r => {
      setAllLabels(r.data || []);
      writeCache('_all_labels', r.data || [], []);
    }).catch(() => {});
  }, [labelPickerOpen, allLabels.length]);

  // Lazy-load products + payment types for order creation
  useEffect(() => {
    if (!open || !data || orderDataLoaded) return;
    if (entityType !== 'lead') return;
    Promise.all([
      api.get<{ data: any[] }>('/products').catch(() => ({ data: [] })),
      api.get<{ data: any[] }>('/payment-types').catch(() => ({ data: [] })),
    ]).then(([prodRes, ptRes]) => {
      setProducts((prodRes.data || []).map((p: any) => ({ ...p, id: String(p.id) })));
      setPaymentTypes((ptRes.data || []).map((pt: any) => ({ ...pt, id: String(pt.id) })));
      setOrderDataLoaded(true);
    });
  }, [open, data, entityType, orderDataLoaded]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <DialogTitle className="sr-only">
          {entityType === 'lead' ? 'Chi tiết Lead' : 'Chi tiết Khách hàng'}
        </DialogTitle>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
        ) : data ? (
          <div>
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-5 py-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 truncate">{data.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="h-3.5 w-3.5 text-gray-400" />
                    <a href={`tel:${data.phone}`} className="text-sm text-sky-600 hover:underline">{data.phone}</a>
                  </div>
                </div>
                <StatusBadge status={data.status} />
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {data.email && (
                  <InfoRow icon={Mail} label="Email" value={data.email} />
                )}
                {data.source?.name && (
                  <InfoRow icon={Tag} label="Nguồn" value={data.source.name} />
                )}
                {data.product?.name && (
                  <InfoRow icon={Package} label="Sản phẩm" value={data.product.name} />
                )}
                {data.assignedUser?.name && (
                  <InfoRow icon={User} label="Nhân viên" value={data.assignedUser.name} />
                )}
                {data.department?.name && (
                  <InfoRow icon={Building} label="Phòng ban" value={data.department.name} />
                )}
                <InfoRow icon={Calendar} label="Ngày tạo" value={formatDate(data.createdAt)} />
              </div>

              {/* Labels */}
              {labels.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Nhãn</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {labels.map((ll: any) => {
                      const label = ll.label || ll;
                      return (
                        <span
                          key={label.id}
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: label.color || '#6b7280' }}
                        >
                          {label.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes & Activities */}
              {activities.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">
                    Ghi chú & Hoạt động ({activities.length})
                  </span>
                  <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
                    {activities.slice(0, 5).map((a: any) => (
                      <div key={a.id} className="text-xs bg-gray-50 rounded-md px-2.5 py-2 border border-gray-100">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-medium text-gray-700">{a.user?.name || '—'}</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-400">{a.type === 'NOTE' ? 'Ghi chú' : a.type === 'CALL' ? 'Cuộc gọi' : a.type}</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-400">{formatDate(a.createdAt)}</span>
                        </div>
                        <p className="text-gray-600 whitespace-pre-line">
                          {a.content?.substring(0, 120)}{a.content?.length > 120 ? '...' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="border-t border-gray-100 px-5 py-3 space-y-2">
              <div className="flex gap-2">
                <Button size="sm" variant={noteOpen ? 'default' : 'outline'} onClick={() => { setNoteOpen(!noteOpen); setLabelPickerOpen(false); setPaymentOpen(false); }}>
                  <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />Ghi chú
                </Button>
                <Button size="sm" variant={labelPickerOpen ? 'default' : 'outline'} onClick={() => { setLabelPickerOpen(!labelPickerOpen); setNoteOpen(false); setPaymentOpen(false); }}>
                  <Tags className="h-3.5 w-3.5 mr-1" />Nhãn
                </Button>
                {entityType === 'lead' && hasOrder && (
                  <Button size="sm" variant={paymentOpen ? 'default' : 'outline'} onClick={() => { setPaymentOpen(!paymentOpen); setNoteOpen(false); setLabelPickerOpen(false); }}>
                    <CreditCard className="h-3.5 w-3.5 mr-1" />Thêm CK
                  </Button>
                )}
                {entityType === 'lead' && products.length > 0 && (
                  <CreateOrderDialog customerId={data.customerId ? String(data.customerId) : ''} leadId={entityId || undefined} products={products} paymentTypes={paymentTypes} />
                )}
              </div>

              {/* Inline note form */}
              {noteOpen && (
                <div className="space-y-2">
                  <Textarea value={noteText} onChange={e => setNoteText(e.target.value)} placeholder="Nhập ghi chú..." rows={2} className="text-sm" autoFocus />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setNoteOpen(false)}>Hủy</Button>
                    <Button size="sm" onClick={submitNote} disabled={noteSaving || !noteText.trim()}>
                      {noteSaving ? 'Đang lưu...' : 'Lưu'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Inline label picker */}
              {labelPickerOpen && (
                <div className="flex flex-wrap gap-1.5">
                  {allLabels.length === 0 && <span className="text-xs text-gray-400">Đang tải...</span>}
                  {allLabels.map((l: any) => (
                    <button
                      key={l.id}
                      onClick={() => toggleLabel(String(l.id))}
                      disabled={labelSaving}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                        currentLabelIds.has(String(l.id))
                          ? 'text-white ring-2 ring-offset-1 ring-gray-400'
                          : 'text-white opacity-50 hover:opacity-80'
                      }`}
                      style={{ backgroundColor: l.color || '#6b7280' }}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Inline payment form */}
              {paymentOpen && hasOrder && (
                <div className="space-y-2">
                  {pendingOrders.length > 1 ? (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-500">Chọn đơn hàng:</p>
                      {pendingOrders.map((o: any) => (
                        <label key={o.id} className={`flex items-center gap-2 rounded border px-2 py-1.5 cursor-pointer text-xs ${
                          pmtOrderId === String(o.id) ? 'border-sky-400 bg-sky-50' : 'border-gray-200'}`}>
                          <input type="radio" name="pmtOrder" checked={pmtOrderId === String(o.id)} onChange={() => setPmtOrderId(String(o.id))} />
                          <span>#{o.id} — {o.product?.name || 'N/A'} — {formatVND(Number(o.totalAmount))}</span>
                          <StatusBadge status={o.status} />
                        </label>
                      ))}
                    </div>
                  ) : (
                    <AutoSelectOrder orderId={String(pendingOrders[0].id)} onSelect={setPmtOrderId}>
                      Đơn #{pendingOrders[0].id} — {pendingOrders[0].product?.name} — {formatVND(Number(pendingOrders[0].totalAmount))}
                    </AutoSelectOrder>
                  )}
                  <div className="flex gap-2">
                    <Input type="number" value={pmtAmount} onChange={e => setPmtAmount(e.target.value)} placeholder="Số tiền (VNĐ)" className="text-sm" autoFocus />
                    <Input value={pmtContent} onChange={e => setPmtContent(e.target.value)} placeholder="Nội dung CK" className="text-sm" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setPaymentOpen(false)}>Hủy</Button>
                    <Button size="sm" onClick={submitPayment} disabled={pmtSaving || !pmtAmount.trim() || !pmtOrderId}>{pmtSaving ? 'Lưu...' : 'Thêm CK'}</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer — Detail button */}
            <div className="sticky bottom-0 border-t border-gray-200 bg-gray-50 px-5 py-3 flex justify-between items-center">
              <span className="text-xs text-gray-400">
                {entityType === 'lead' ? 'Lead' : 'Khách hàng'} #{entityId}
              </span>
              <Link href={detailUrl} onClick={() => onOpenChange(false)}>
                <Button size="sm">
                  <ExternalLink className="h-4 w-4 mr-1" />Xem chi tiết
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="py-16 text-center text-gray-400">Không tìm thấy dữ liệu</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Auto-select single order on mount */
function AutoSelectOrder({ orderId, onSelect, children }: { orderId: string; onSelect: (id: string) => void; children: React.ReactNode }) {
  useEffect(() => { onSelect(orderId); }, [orderId, onSelect]);
  return <p className="text-xs text-gray-500">{children}</p>;
}

/** Single info row for the preview grid */
function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-gray-400">{label}</div>
        <div className="text-gray-900 truncate">{value}</div>
      </div>
    </div>
  );
}
