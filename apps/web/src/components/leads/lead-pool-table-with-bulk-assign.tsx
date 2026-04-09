'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/shared/status-badge';
import { EntityQuickPreviewDialog } from '@/components/shared/entity-quick-preview-dialog';
import { LeadPoolActionButtons } from '@/components/leads/lead-pool-action-buttons';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { formatDate } from '@/lib/utils';
import { Users, Shuffle, Undo2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Lead {
  id: string; name: string; phone: string; email?: string | null;
  status: string; source?: { name: string } | null;
  assignedUser?: { id: string; name: string } | null;
  department?: { name: string } | null;
  customerId?: string | null;
  orders?: { id: string }[];
  labels?: { label: { id: string; name: string; color: string } }[];
  activityCount?: number;
  assignedAt?: string | null;
  createdAt: string;
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
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Template state
  const [templates, setTemplates] = useState<{ id: string; name: string; members: { user: { name: string } }[] }[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateApplying, setTemplateApplying] = useState(false);

  // Recall state
  const [recalling, setRecalling] = useState(false);

  useEffect(() => {
    if (!isManager) return;
    api.get<{ data: any[] }>('/assignment-templates').then(res => setTemplates(res.data || [])).catch(() => {});
  }, [isManager]);

  // Auto-refresh polling (30s) — only for poolMode 'new'
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

  // Sync with SSR data on initial render
  useEffect(() => { setLeads(initialLeads); }, [initialLeads]);

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
    } catch (err: any) {
      toast.error(err.message || 'Lỗi phân phối hàng loạt');
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
    } catch (err: any) {
      toast.error(err.message || 'Lỗi phân phối theo template');
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
    } catch (err: any) {
      toast.error(err.message || 'Lỗi thu hồi');
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
    } catch (err: any) {
      toast.error(err.message || 'Lỗi thu hồi hàng loạt');
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
    return <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">Không có data</div>;
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
        <div className="mb-2 flex items-center justify-end gap-2 text-xs text-gray-400">
          <RefreshCw className="h-3 w-3" />
          <span>Tự động cập nhật · {lastRefresh.toLocaleTimeString('vi-VN')}</span>
          <button type="button" onClick={fetchLeads} className="text-sky-500 hover:underline">Làm mới</button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              {isManager && (
                <th className="w-10 px-3 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
                </th>
              )}
              <th className="px-4 py-3 text-left font-medium text-gray-500">Họ tên</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">SĐT</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Trạng thái</th>
              <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-gray-500">Nguồn</th>
              {isNewPool && (
                <>
                  <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-gray-500">Phân cho</th>
                  <th className="hidden lg:table-cell px-4 py-3 text-center font-medium text-gray-500">Tương tác</th>
                </>
              )}
              <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-gray-500">Ngày tạo</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              const isDistributed = lead.status !== 'POOL' && !!lead.assignedAt;
              return (
                <tr key={lead.id}
                  className={`border-b border-gray-100 hover:bg-gray-50 last:border-0 ${selected.has(lead.id) ? 'bg-sky-50/50' : ''} ${isDistributed ? 'bg-amber-50/30' : ''}`}>
                  {isManager && (
                    <td className="w-10 px-3 py-3">
                      <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleOne(lead.id)}
                        className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500" />
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <div>
                      <button type="button" onClick={() => setPreviewId(lead.id)}
                        className="font-medium text-sky-600 hover:underline text-left">
                        {lead.name}
                      </button>
                      {lead.orders && lead.orders.length > 0 && (
                        <span className="ml-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">Đã mua</span>
                      )}
                    </div>
                    {lead.labels && lead.labels.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {lead.labels.slice(0, 3).map(ll => (
                          <span key={ll.label.id} className="rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white" style={{ backgroundColor: ll.label.color }}>{ll.label.name}</span>
                        ))}
                        {lead.labels.length > 3 && <span className="rounded-full bg-gray-200 px-1.5 py-0.5 text-[9px] text-gray-500">+{lead.labels.length - 3}</span>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{lead.phone}</td>
                  <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-600">{lead.source?.name || '—'}</td>
                  {isNewPool && (
                    <>
                      <td className="hidden lg:table-cell px-4 py-3 text-gray-600">
                        {isDistributed ? (
                          <div>
                            <span className="font-medium text-gray-800">{lead.assignedUser?.name}</span>
                            <span className="ml-1 text-xs text-gray-400">({relativeTime(lead.assignedAt!)})</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="hidden lg:table-cell px-4 py-3 text-center">
                        {isDistributed ? (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                            (lead.activityCount ?? 0) >= 2 ? 'bg-emerald-100 text-emerald-700' :
                            (lead.activityCount ?? 0) === 1 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {lead.activityCount ?? 0}
                          </span>
                        ) : '—'}
                      </td>
                    </>
                  )}
                  <td className="hidden lg:table-cell px-4 py-3 text-gray-400">{formatDate(lead.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {isDistributed ? (
                      <Button size="sm" variant="outline" onClick={() => handleRecallOne(lead.id)}
                        className="h-7 px-2 text-xs text-amber-700 border-amber-300 hover:bg-amber-50">
                        <Undo2 className="h-3.5 w-3.5 mr-1" />Thu hồi
                      </Button>
                    ) : (
                      <LeadPoolActionButtons
                        leadId={lead.id} leadName={lead.name}
                        mode={poolMode === 'new' ? 'assign' : 'both'}
                        users={users}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
              <p className="text-xs text-gray-500">
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
