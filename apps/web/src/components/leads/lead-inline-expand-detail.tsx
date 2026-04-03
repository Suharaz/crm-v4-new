'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { ExternalLink, Phone, Mail, User, Building, Tag, Calendar, Package, Loader2, MessageSquarePlus, Tags, ShoppingCart, ArrowRightLeft } from 'lucide-react';

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
    ]).then(([entityRes, actRes]) => {
      setData(entityRes.data);
      setActivities(actRes.data || []);
      writeCache(cacheKey, entityRes.data, actRes.data || []);
    }).catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [entityType, entityId]);

  const labels = data?.labels || [];
  const currentLabelIds = new Set(labels.map((ll: any) => String((ll.label || ll).id)));

  async function submitNote() {
    if (!noteText.trim()) return;
    setNoteSaving(true);
    try {
      await api.post('/activities', { entityType: entityType === 'lead' ? 'LEAD' : 'CUSTOMER', entityId, type: 'NOTE', content: noteText.trim() });
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {/* Col 1: Info */}
          <div className="space-y-2">
            <h4 className="font-semibold text-gray-700 text-xs uppercase">Thông tin</h4>
            <div className="space-y-1.5 text-gray-600">
              <div className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400" /><a href={`tel:${data.phone}`} className="text-sky-600">{data.phone}</a></div>
              {data.email && <div className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gray-400" />{data.email}</div>}
              {data.source?.name && <div className="flex items-center gap-2"><Tag className="h-3.5 w-3.5 text-gray-400" />{data.source.name}</div>}
              {data.product?.name && <div className="flex items-center gap-2"><Package className="h-3.5 w-3.5 text-gray-400" />{data.product.name}</div>}
              {data.assignedUser?.name && <div className="flex items-center gap-2"><User className="h-3.5 w-3.5 text-gray-400" />{data.assignedUser.name}</div>}
              {data.department?.name && <div className="flex items-center gap-2"><Building className="h-3.5 w-3.5 text-gray-400" />{data.department.name}</div>}
              <div className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-gray-400" />{formatDate(data.createdAt)}</div>
            </div>
            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {labels.map((ll: any) => {
                  const l = ll.label || ll;
                  return <span key={l.id} className="rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: l.color || '#6b7280' }}>{l.name}</span>;
                })}
              </div>
            )}
          </div>

          {/* Col 2: Activities */}
          <div className="space-y-2">
            <h4 className="font-semibold text-gray-700 text-xs uppercase">Hoạt động ({activities.length})</h4>
            {activities.length === 0 ? (
              <p className="text-xs text-gray-400">Chưa có hoạt động</p>
            ) : (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {activities.slice(0, 5).map((a: any) => (
                  <div key={a.id} className="text-xs bg-white rounded-md px-2.5 py-2 border border-gray-100">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-medium text-gray-700">{a.user?.name || '—'}</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-gray-400">{a.type === 'NOTE' ? 'Ghi chú' : a.type === 'CALL' ? 'Cuộc gọi' : a.type}</span>
                      <span className="text-gray-300">·</span>
                      <span className="text-gray-400">{formatDate(a.createdAt)}</span>
                    </div>
                    <p className="text-gray-600">{a.content?.substring(0, 100)}{a.content?.length > 100 ? '...' : ''}</p>
                  </div>
                ))}
              </div>
            )}
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
              {entityType === 'lead' && data?.customerId && (
                <Link href={`/leads/${entityId}`}>
                  <Button size="sm" variant="outline"><ShoppingCart className="h-3.5 w-3.5 mr-1" />Tạo đơn</Button>
                </Link>
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
          </div>
        </div>
      </td>
    </tr>
  );
}
