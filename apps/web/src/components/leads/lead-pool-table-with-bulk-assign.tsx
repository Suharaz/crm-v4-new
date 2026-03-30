'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/shared/status-badge';
import { LeadPoolActionButtons } from '@/components/leads/lead-pool-action-buttons';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { formatDate } from '@/lib/utils';
import { Users } from 'lucide-react';
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
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkUserId, setBulkUserId] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);

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
    let successCount = 0;
    let failCount = 0;

    // Assign từng lead (API chưa có bulk endpoint)
    for (const leadId of selected) {
      try {
        await api.post(`/leads/${leadId}/assign`, { userId: bulkUserId });
        successCount++;
      } catch {
        failCount++;
      }
    }

    setBulkAssigning(false);
    setBulkDialogOpen(false);
    setSelected(new Set());
    setBulkUserId('');

    if (successCount > 0) toast.success(`Đã phân ${successCount} leads thành công`);
    if (failCount > 0) toast.error(`${failCount} leads phân thất bại`);
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
            <Users className="h-4 w-4 mr-1" />Phân hàng loạt
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSelected(new Set())}>
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
                  <Link href={`/leads/${lead.id}`} className="font-medium text-sky-600 hover:underline">
                    {lead.name}
                  </Link>
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
    </div>
  );
}
