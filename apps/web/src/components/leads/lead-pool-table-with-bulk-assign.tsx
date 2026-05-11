'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EntityQuickPreviewDialog } from '@/components/shared/entity-quick-preview-dialog';
import { LeadDuplicateBadge } from '@/components/leads/lead-duplicate-badge';
import { LeadNameLink } from '@/components/leads/lead-name-link';
import { LeadEditButton } from '@/components/leads/lead-edit-button';
import { PhoneCell } from '@/components/leads/phone-cell';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { cn, formatVND } from '@/lib/utils';
import { Users, Shuffle, Undo2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface OrderLite {
  id: string;
  totalAmount: number;
  payments?: { amount: number; status: string }[];
}

interface Lead {
  id: string; name: string; phone: string; email?: string | null;
  status: string; source?: { name: string } | null;
  product?: { id: string; name: string } | null;
  assignedUser?: { id: string; name: string } | null;
  department?: { name: string } | null;
  customerId?: string | null;
  orders?: OrderLite[];
  label?: { id: string; name: string; color: string } | null;
  activityCount?: number;
  assignedAt?: string | null;
  latestNote?: { content: string | null; createdAt: string } | null;
  createdAt: string;
  /** Tổng số lead chưa xóa có cùng SĐT (gồm cả lead này). >=2 → trùng. */
  duplicateCount?: number;
}

/** Pick latest order + sum verified payments. */
function computeOrderSummary(orders: OrderLite[] | undefined) {
  if (!orders || orders.length === 0) return null;
  const latest = orders[0];
  const depositPaid = (latest.payments || [])
    .filter((p) => p.status === 'VERIFIED')
    .reduce((sum, p) => sum + Number(p.amount), 0);
  return { totalAmount: Number(latest.totalAmount), depositPaid };
}

interface PoolTableProps {
  leads: Lead[];
  users: { id: string; name: string }[];
  poolMode: 'new' | 'floating' | 'department';
}

/** Lead pool table with bulk assign, monitoring, and auto-refresh. */
export function LeadPoolTableWithBulkAssign({ leads: initialLeads, users, poolMode }: PoolTableProps) {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';

  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkUserId, setBulkUserId] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  // Template state
  const [templates, setTemplates] = useState<{ id: string; name: string; members: { user: { name: string } }[] }[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateApplying, setTemplateApplying] = useState(false);

  // Recall state
  const [recalling, setRecalling] = useState(false);

  useEffect(() => {
    if (!isManager) return;
    api.get<{ data: typeof templates }>('/assignment-templates').then(res => setTemplates(res.data || [])).catch(() => {});
  }, [isManager]);

  // Auto-refresh polling (30s) - only for poolMode 'new'
  const fetchLeads = useCallback(async () => {
    if (poolMode !== 'new') return;
    try {
      const res = await api.get<{ data: Lead[] }>('/leads/pool/new?limit=200');
      setLeads(res.data || []);
      setLastRefresh(new Date());
    } catch { /* silent fail on poll */ }
  }, [poolMode]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (poolMode !== 'new') return;
    intervalRef.current = setInterval(fetchLeads, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [poolMode, fetchLeads]);

  // Sync with SSR data on initial render + set client-only timestamp
  useEffect(() => { setLeads(initialLeads); setLastRefresh(new Date()); }, [initialLeads]);

  const allSelected = leads.length > 0 && selected.size === leads.length;
  const someSelected = selected.size > 0;

  // Separate pool vs distributed leads for bulk action logic
  const selectedPool = [...selected].filter(id => leads.find(l => l.id === id)?.status === 'POOL');
  const selectedDistributed = [...selected].filter(id => {
    const l = leads.find(le => le.id === id);
    return l && l.status !== 'POOL';
  });

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(leads.map(l => l.id)));
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleBulkAssign() {
    if (!bulkUserId || selectedPool.length === 0) return;
    setBulkAssigning(true);
    try {
      const res = await api.post<{ data: { assigned: number; skipped: number } }>(
        '/leads/bulk-assign',
        { leadIds: selectedPool, userId: bulkUserId },
      );
      const { assigned, skipped } = res.data;
      toast.success(`Đã phân ${assigned} leads thành công${skipped > 0 ? ` (${skipped} bỏ qua)` : ''}`);
      await fetchLeads();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi phân phối hàng loạt');
    }
    setBulkAssigning(false);
    setBulkDialogOpen(false);
    setSelected(new Set());
    setBulkUserId('');
  }

  async function handleTemplateApply() {
    if (!selectedTemplateId || selectedPool.length === 0) return;
    setTemplateApplying(true);
    try {
      const res = await api.post<{ data: { assigned: number } }>(
        `/assignment-templates/${selectedTemplateId}/apply`,
        { leadIds: selectedPool },
      );
      toast.success(`Đã phân phối ${res.data?.assigned ?? 0} leads theo template`);
      await fetchLeads();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi phân phối theo template');
    }
    setTemplateApplying(false);
    setTemplateDialogOpen(false);
    setSelected(new Set());
    setSelectedTemplateId('');
  }

  async function handleRecallOne(leadId: string) {
    try {
      await api.post(`/leads/${leadId}/recall`);
      toast.success('Đã thu hồi lead về Kho Mới');
      await fetchLeads();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi thu hồi');
    }
  }

  async function handleBulkRecall() {
    if (selectedDistributed.length === 0) return;
    setRecalling(true);
    try {
      const res = await api.post<{ data: { recalled: number } }>(
        '/leads/bulk-recall',
        { leadIds: selectedDistributed },
      );
      toast.success(`Đã thu hồi ${res.data?.recalled ?? 0} leads`);
      await fetchLeads();
      setSelected(new Set());
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi thu hồi hàng loạt');
    }
    setRecalling(false);
  }

  /** Format relative time in Vietnamese. */
  function relativeTime(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
  }

  if (leads.length === 0) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">Không có data</div>;
  }

  const isNewPool = poolMode === 'new';

  return (
    <div>
      {/* Bulk action toolbar */}
      {someSelected && isManager && (
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-sky-50 border border-sky-200 px-4 py-2.5">
          <span className="text-sm font-medium text-sky-700">
            Đã chọn {selected.size} lead
          </span>
          {selectedPool.length > 0 && (
            <>
              <Button size="sm" onClick={() => setBulkDialogOpen(true)}>
                <Users className="h-4 w-4 mr-1" />Phân {selectedPool.length} cho 1 người
              </Button>
              {templates.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => setTemplateDialogOpen(true)}>
                  <Shuffle className="h-4 w-4 mr-1" />Áp dụng Template
                </Button>
              )}
            </>
          )}
          {selectedDistributed.length > 0 && (
            <Button size="sm" variant="outline" onClick={handleBulkRecall} disabled={recalling}
              className="text-amber-700 border-amber-300 hover:bg-amber-50">
              <Undo2 className="h-4 w-4 mr-1" />
              {recalling ? 'Đang thu hồi...' : `Thu hồi ${selectedDistributed.length}`}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </Button>
        </div>
      )}

      {/* Auto-refresh indicator */}
      {isNewPool && (
        <div className="mb-2 flex items-center justify-end gap-2 text-xs text-slate-400">
          <RefreshCw className="h-3 w-3" />
          <span>Tự động cập nhật{lastRefresh ? ` · ${lastRefresh.toLocaleTimeString('vi-VN')}` : ''}</span>
          <button type="button" onClick={fetchLeads} className="text-sky-500 hover:underline">Làm mới</button>
        </div>
      )}

      {/* Table */}
      {(() => {
        // Sticky column offsets
        const STT_LEFT = isManager ? 'left-[40px]' : 'left-0';
        const NAME_LEFT = isManager ? 'left-[80px]' : 'left-[40px]';
        const PHONE_LEFT = isManager ? 'left-[280px]' : 'left-[240px]';
        // "Phân cho" + "Tương tác" - manager-only + only on Kho Mới (isNewPool)
        const showAssignCols = isManager && isNewPool;

        return (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-sm border-separate border-spacing-0">
              <thead className="bg-slate-50">
                <tr>
                  {isManager && (
                    <th className="sticky left-0 z-20 w-10 px-3 py-3 bg-slate-50 border-b border-slate-200">
                      <input type="checkbox" checked={allSelected} onChange={toggleAll}
                        className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                    </th>
                  )}
                  <th className={cn('sticky z-20 w-10 px-3 py-3 text-center font-medium text-slate-500 bg-slate-50 border-b border-slate-200', STT_LEFT)}>#</th>
                  <th className={cn('sticky z-20 w-[200px] px-4 py-3 text-left font-medium text-slate-500 bg-slate-50 border-b border-slate-200', NAME_LEFT)}>Tên khách hàng</th>
                  <th className={cn('sticky z-20 w-[200px] px-4 py-3 text-left font-medium text-slate-500 bg-slate-50 border-b border-slate-200 shadow-[2px_0_4px_rgba(0,0,0,0.04)]', PHONE_LEFT)}>Số điện thoại</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 bg-slate-50 border-b border-slate-200">Sản phẩm</th>
                  <th className="px-4 py-3 text-center font-medium text-slate-500 bg-slate-50 border-b border-slate-200">Số</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 bg-slate-50 border-b border-slate-200">Thành tiền</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-500 bg-slate-50 border-b border-slate-200">Tiền đặt cọc</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 bg-slate-50 border-b border-slate-200">Nguồn khách</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-500 bg-slate-50 border-b border-slate-200">Nhãn KH</th>
                  {showAssignCols && (
                    <>
                      <th className="px-4 py-3 text-left font-medium text-slate-500 bg-slate-50 border-b border-slate-200">Phân cho</th>
                      <th className="px-4 py-3 text-center font-medium text-slate-500 bg-slate-50 border-b border-slate-200">Tương tác</th>
                    </>
                  )}
                  <th className="px-3 py-3 text-center font-medium text-slate-500 bg-slate-50 border-b border-slate-200 w-[60px]">Chỉnh sửa</th>
                  {/* Bỏ cột "Thao tác" cho tất cả pool tables:
                      - Pool Mới: bulk-assign bar đủ + Thu hồi nhét vào ô "Phân cho"
                      - Pool Zoom / Floating: dùng nút Chỉnh sửa (popup) hoặc bulk select */}
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, idx) => {
                  const isDistributed = lead.status !== 'POOL' && !!lead.assignedAt;
                  const summary = computeOrderSummary(lead.orders);
                  const isSel = selected.has(lead.id);
                  const rowBg = isSel ? 'bg-sky-50' : isDistributed ? 'bg-amber-50/30' : 'bg-white';

                  return (
                    <tr key={lead.id} className={cn('hover:bg-slate-50', rowBg)}>
                      {isManager && (
                        <td className={cn('sticky left-0 z-10 w-10 px-3 py-3 border-b border-slate-100', rowBg)}>
                          <input type="checkbox" checked={isSel} onChange={() => toggleOne(lead.id)}
                            className="h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                        </td>
                      )}
                      <td className={cn('sticky z-10 w-10 px-3 py-3 text-center text-xs text-slate-500 border-b border-slate-100', STT_LEFT, rowBg)}>{idx + 1}</td>
                      <td className={cn('sticky z-10 w-[200px] px-4 py-3 border-b border-slate-100', NAME_LEFT, rowBg)}>
                        <div className="flex items-center gap-1.5">
                          <LeadNameLink leadId={lead.id} name={lead.name} />
                          {lead.orders && lead.orders.length > 0 && (
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 shrink-0">Đã mua</span>
                          )}
                        </div>
                      </td>
                      <td className={cn('sticky z-10 w-[200px] px-4 py-3 border-b border-slate-100 shadow-[2px_0_4px_rgba(0,0,0,0.04)]', PHONE_LEFT, rowBg)}>
                        <div className="flex items-center gap-2">
                          <PhoneCell leadId={lead.id} phone={lead.phone} />
                          <LeadDuplicateBadge
                            count={lead.duplicateCount ?? 0}
                            phone={lead.phone}
                            currentLeadId={lead.id}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 border-b border-slate-100">{lead.product?.name || '-'}</td>
                      <td className="px-4 py-3 text-center text-slate-600 border-b border-slate-100">{summary ? 1 : '-'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700 border-b border-slate-100">
                        {summary ? formatVND(summary.totalAmount) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700 border-b border-slate-100">
                        {summary ? formatVND(summary.depositPaid) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600 border-b border-slate-100">{lead.source?.name || '-'}</td>
                      <td className="px-4 py-3 border-b border-slate-100">
                        {lead.label ? (
                          <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: lead.label.color }}>{lead.label.name}</span>
                        ) : (
                          <span className="text-[10px] text-slate-400">-</span>
                        )}
                      </td>
                      {showAssignCols && (
                        <>
                          <td className="px-4 py-3 text-slate-600 border-b border-slate-100">
                            {isDistributed ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                <div>
                                  <span className="font-medium text-slate-800">{lead.assignedUser?.name}</span>
                                  <span className="ml-1 text-xs text-slate-400">({relativeTime(lead.assignedAt!)})</span>
                                </div>
                                {/* Thu hồi inline - bù cho việc bỏ cột Thao tác ở Kho Mới */}
                                <Button size="sm" variant="outline" onClick={() => handleRecallOne(lead.id)}
                                  className="h-6 px-1.5 text-[11px] text-amber-700 border-amber-300 hover:bg-amber-50">
                                  <Undo2 className="h-3 w-3 mr-0.5" />Thu hồi
                                </Button>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3 text-center border-b border-slate-100">
                            {isDistributed ? (
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                (lead.activityCount ?? 0) >= 2 ? 'bg-emerald-100 text-emerald-700' :
                                (lead.activityCount ?? 0) === 1 ? 'bg-yellow-100 text-yellow-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {lead.activityCount ?? 0}
                              </span>
                            ) : '-'}
                          </td>
                        </>
                      )}
                      <td className="px-3 py-3 text-center border-b border-slate-100">
                        <LeadEditButton leadId={lead.id} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Bulk assign dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Phân {selectedPool.length} leads cho nhân viên</DialogTitle>
          </DialogHeader>
          <Select value={bulkUserId} onValueChange={setBulkUserId}>
            <SelectTrigger><SelectValue placeholder="Chọn nhân viên" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleBulkAssign} disabled={!bulkUserId || bulkAssigning}>
              {bulkAssigning ? `Đang phân...` : `Phân ${selectedPool.length} leads`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template apply dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Phân phối {selectedPool.length} leads theo Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger><SelectValue placeholder="Chọn template" /></SelectTrigger>
              <SelectContent>
                {templates.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.members?.length || 0} người)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplateId && (
              <p className="text-xs text-slate-500">
                Round-robin: {selectedPool.length} leads chia đều cho{' '}
                {templates.find(t => t.id === selectedTemplateId)?.members?.map(m => m.user.name).join(', ')}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleTemplateApply} disabled={!selectedTemplateId || templateApplying}>
              {templateApplying ? 'Đang phân phối...' : `Phân phối ${selectedPool.length} leads`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quick preview popup */}
      <EntityQuickPreviewDialog
        open={!!previewId}
        onOpenChange={(open) => { if (!open) setPreviewId(null); }}
        entityType="lead"
        entityId={previewId}
      />
    </div>
  );
}
