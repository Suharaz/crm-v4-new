'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/shared/status-badge';
import { EntityQuickPreviewDialog } from '@/components/shared/entity-quick-preview-dialog';
import { LeadPoolActionButtons } from '@/components/leads/lead-pool-action-buttons';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { formatDate } from '@/lib/utils';
import { Users, Shuffle } from 'lucide-react';
import { toast } from 'sonner';

interface Lead {
  id: string; name: string; phone: string; email?: string | null;
  status: string; source?: { name: string } | null;
  assignedUser?: { name: string } | null;
  department?: { name: string } | null;
  createdAt: string;
}

interface PoolTableProps {
  leads: Lead[];
  users: { id: string; name: string }[];
  poolMode: 'new' | 'floating' | 'department';
}

/** Lead pool table with checkbox selection and bulk assign capability. */
export function LeadPoolTableWithBulkAssign({ leads, users, poolMode }: PoolTableProps) {
  const router = useRouter();
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkUserId, setBulkUserId] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);

  // Template state
  const [templates, setTemplates] = useState<{ id: string; name: string; members: { user: { name: string } }[] }[]>([]);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateApplying, setTemplateApplying] = useState(false);

  useEffect(() => {
    if (!isManager) return;
    api.get<{ data: any[] }>('/assignment-templates').then(res => setTemplates(res.data || [])).catch(() => {});
  }, [isManager]);

  const allSelected = leads.length > 0 && selected.size === leads.length;
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map(l => l.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleBulkAssign() {
    if (!bulkUserId || selected.size === 0) return;
    setBulkAssigning(true);
    try {
      const res = await api.post<{ data: { assigned: number; skipped: number } }>(
        '/leads/bulk-assign',
        { leadIds: Array.from(selected), userId: bulkUserId },
      );
      const { assigned, skipped } = res.data;
      toast.success(`Đã phân ${assigned} leads thành công${skipped > 0 ? ` (${skipped} bỏ qua)` : ''}`);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi phân phối hàng loạt');
    }

    setBulkAssigning(false);
    setBulkDialogOpen(false);
    setSelected(new Set());
    setBulkUserId('');
    router.refresh();
  }

  async function handleTemplateApply() {
    if (!selectedTemplateId || selected.size === 0) return;
    setTemplateApplying(true);
    try {
      const res = await api.post<{ data: { assigned: number } }>(
        `/assignment-templates/${selectedTemplateId}/apply`,
        { leadIds: Array.from(selected) },
      );
      toast.success(`Đã phân phối ${res.data?.assigned ?? 0} leads theo template`);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi phân phối theo template');
    }
    setTemplateApplying(false);
    setTemplateDialogOpen(false);
    setSelected(new Set());
    setSelectedTemplateId('');
    router.refresh();
  }

  if (leads.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">Không có lead nào</div>;
  }

  return (
    <div>
      {/* Bulk action toolbar */}
      {someSelected && isManager && (
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-sky-50 border border-sky-200 px-4 py-2.5">
          <span className="text-sm font-medium text-sky-700">
            Đã chọn {selected.size} lead
          </span>
          <Button size="sm" onClick={() => setBulkDialogOpen(true)}>
            <Users className="h-4 w-4 mr-1" />Phân cho 1 người
          </Button>
          {templates.length > 0 && (
            <Button size="sm" variant="outline" onClick={() => setTemplateDialogOpen(true)}>
              <Shuffle className="h-4 w-4 mr-1" />Áp dụng Template
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              {isManager && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left font-medium text-gray-500">Họ tên</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">SĐT</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Trạng thái</th>
              <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-gray-500">Nguồn</th>
              <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-gray-500">Ngày tạo</th>
              <th className="px-4 py-3 text-right font-medium text-gray-500">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className={`border-b border-gray-100 hover:bg-gray-50 last:border-0 ${selected.has(lead.id) ? 'bg-sky-50/50' : ''}`}
              >
                {isManager && (
                  <td className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                      className="h-4 w-4 rounded border-gray-300 text-sky-600 focus:ring-sky-500"
                    />
                  </td>
                )}
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setPreviewId(lead.id)}
                    className="font-medium text-sky-600 hover:underline text-left"
                  >
                    {lead.name}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-600">{lead.phone}</td>
                <td className="px-4 py-3"><StatusBadge status={lead.status} /></td>
                <td className="hidden md:table-cell px-4 py-3 text-gray-600">{lead.source?.name || '—'}</td>
                <td className="hidden lg:table-cell px-4 py-3 text-gray-400">{formatDate(lead.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <LeadPoolActionButtons
                    leadId={lead.id}
                    leadName={lead.name}
                    mode={poolMode === 'new' ? 'assign' : 'both'}
                    users={users}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bulk assign dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Phân {selected.size} leads cho nhân viên</DialogTitle>
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
              {bulkAssigning ? `Đang phân ${selected.size} leads...` : `Phân ${selected.size} leads`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template apply dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Phân phối {selected.size} leads theo Template</DialogTitle>
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
                Round-robin: {selected.size} leads chia đều cho{' '}
                {templates.find(t => t.id === selectedTemplateId)?.members?.map(m => m.user.name).join(', ')}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleTemplateApply} disabled={!selectedTemplateId || templateApplying}>
              {templateApplying ? 'Đang phân phối...' : `Phân phối ${selected.size} leads`}
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
