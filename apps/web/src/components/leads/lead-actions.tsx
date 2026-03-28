'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useFormAction } from '@/hooks/use-form-action';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api-client';
import { UserPlus, ArrowRightLeft, TrendingUp, Trash2, Tag, MessageSquarePlus } from 'lucide-react';

interface LeadActionsProps {
  lead: any;
  users: any[];
  departments: any[];
  labels: any[];
}

/** Action bar for lead detail page — assign, claim, transfer, convert, status, labels, notes. */
export function LeadActions({ lead, users, departments, labels }: LeadActionsProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER' || isAdmin;

  const [assignOpen, setAssignOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [labelOpen, setLabelOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [transferType, setTransferType] = useState('');
  const [transferDeptId, setTransferDeptId] = useState('');
  const [newStatus, setNewStatus] = useState('');
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [noteContent, setNoteContent] = useState('');
  const [createTaskFromNote, setCreateTaskFromNote] = useState(false);

  const assignAction = useFormAction({ successMessage: 'Đã phân lead' });
  const claimAction = useFormAction({ successMessage: 'Đã nhận lead' });
  const transferAction = useFormAction({ successMessage: 'Đã chuyển lead' });
  const statusAction = useFormAction({ successMessage: 'Đã đổi trạng thái' });
  const convertAction = useFormAction({ successMessage: 'Đã chuyển đổi thành khách hàng' });
  const deleteAction = useFormAction({ successMessage: 'Đã xóa lead' });
  const labelAction = useFormAction({ successMessage: 'Đã gắn nhãn' });
  const noteAction = useFormAction({ successMessage: 'Đã thêm ghi chú' });

  const canClaim = ['POOL', 'FLOATING'].includes(lead.status);
  const canConvert = lead.status === 'IN_PROGRESS';
  const canAssign = isManager && ['POOL', 'FLOATING', 'ASSIGNED'].includes(lead.status);

  return (
    <div className="flex flex-wrap gap-2">
      {/* Claim */}
      {canClaim && (
        <ConfirmDialog
          trigger={<Button size="sm" variant="outline"><UserPlus className="h-4 w-4 mr-1" />Nhận lead</Button>}
          title="Nhận lead"
          description="Bạn muốn nhận lead này về kho cá nhân?"
          confirmLabel="Nhận"
          onConfirm={() => claimAction.execute('post', `/leads/${lead.id}/claim`)}
          isLoading={claimAction.isLoading}
        />
      )}

      {/* Assign */}
      {canAssign && (
        <>
          <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
            <UserPlus className="h-4 w-4 mr-1" />Phân lead
          </Button>
          <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Phân lead cho nhân viên</DialogTitle></DialogHeader>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger><SelectValue placeholder="Chọn nhân viên" /></SelectTrigger>
                <SelectContent>
                  {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAssignOpen(false)}>Hủy</Button>
                <Button
                  disabled={!selectedUserId || assignAction.isLoading}
                  onClick={async () => {
                    const r = await assignAction.execute('post', `/leads/${lead.id}/assign`, { userId: selectedUserId });
                    if (r) setAssignOpen(false);
                  }}
                >
                  {assignAction.isLoading ? 'Đang xử lý...' : 'Phân'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}

      {/* Transfer */}
      <Button size="sm" variant="outline" onClick={() => setTransferOpen(true)}>
        <ArrowRightLeft className="h-4 w-4 mr-1" />Chuyển
      </Button>
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Chuyển lead</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={transferType} onValueChange={setTransferType}>
              <SelectTrigger><SelectValue placeholder="Chọn hình thức" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DEPARTMENT">Về phòng ban</SelectItem>
                <SelectItem value="FLOATING">Thả nổi</SelectItem>
                <SelectItem value="UNASSIGN">Bỏ phân</SelectItem>
              </SelectContent>
            </Select>
            {transferType === 'DEPARTMENT' && (
              <Select value={transferDeptId} onValueChange={setTransferDeptId}>
                <SelectTrigger><SelectValue placeholder="Chọn phòng ban" /></SelectTrigger>
                <SelectContent>
                  {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransferOpen(false)}>Hủy</Button>
            <Button
              disabled={!transferType || transferAction.isLoading}
              onClick={async () => {
                const body: any = { targetType: transferType };
                if (transferType === 'DEPARTMENT') body.targetDeptId = transferDeptId;
                const r = await transferAction.execute('post', `/leads/${lead.id}/transfer`, body);
                if (r) setTransferOpen(false);
              }}
            >
              {transferAction.isLoading ? 'Đang xử lý...' : 'Chuyển'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Status */}
      <Button size="sm" variant="outline" onClick={() => setStatusOpen(true)}>Đổi trạng thái</Button>
      <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Đổi trạng thái lead</DialogTitle></DialogHeader>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger><SelectValue placeholder="Chọn trạng thái" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="POOL">Pool</SelectItem>
              <SelectItem value="ASSIGNED">Đã phân</SelectItem>
              <SelectItem value="IN_PROGRESS">Đang xử lý</SelectItem>
              <SelectItem value="CONVERTED">Đã chuyển đổi</SelectItem>
              <SelectItem value="LOST">Mất</SelectItem>
              <SelectItem value="FLOATING">Thả nổi</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusOpen(false)}>Hủy</Button>
            <Button
              disabled={!newStatus || statusAction.isLoading}
              onClick={async () => {
                const r = await statusAction.execute('post', `/leads/${lead.id}/status`, { status: newStatus });
                if (r) setStatusOpen(false);
              }}
            >
              {statusAction.isLoading ? 'Đang xử lý...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert */}
      {canConvert && (
        <ConfirmDialog
          trigger={<Button size="sm"><TrendingUp className="h-4 w-4 mr-1" />Chuyển đổi KH</Button>}
          title="Chuyển đổi thành khách hàng"
          description="Lead sẽ được chuyển sang trạng thái CONVERTED và tạo/cập nhật khách hàng."
          confirmLabel="Chuyển đổi"
          onConfirm={() => convertAction.execute('post', `/leads/${lead.id}/convert`)}
          isLoading={convertAction.isLoading}
        />
      )}

      {/* Labels */}
      <Button size="sm" variant="outline" onClick={() => setLabelOpen(true)}>
        <Tag className="h-4 w-4 mr-1" />Nhãn
      </Button>
      <Dialog open={labelOpen} onOpenChange={setLabelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Gắn nhãn</DialogTitle></DialogHeader>
          <div className="flex flex-wrap gap-2">
            {labels.map(l => {
              const isSelected = selectedLabelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelectedLabelIds(prev =>
                    isSelected ? prev.filter(id => id !== l.id) : [...prev, l.id]
                  )}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${isSelected ? 'ring-2 ring-sky-500 text-white' : 'text-white opacity-60'}`}
                  style={{ backgroundColor: l.color }}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLabelOpen(false)}>Hủy</Button>
            <Button
              disabled={selectedLabelIds.length === 0 || labelAction.isLoading}
              onClick={async () => {
                const r = await labelAction.execute('post', `/leads/${lead.id}/labels`, { labelIds: selectedLabelIds });
                if (r) { setLabelOpen(false); setSelectedLabelIds([]); }
              }}
            >
              {labelAction.isLoading ? 'Đang xử lý...' : 'Gắn nhãn'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note */}
      <Button size="sm" variant="outline" onClick={() => setNoteOpen(true)}>
        <MessageSquarePlus className="h-4 w-4 mr-1" />Ghi chú
      </Button>
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Thêm ghi chú</DialogTitle></DialogHeader>
          <Textarea
            value={noteContent}
            onChange={e => setNoteContent(e.target.value)}
            placeholder="Nội dung ghi chú..."
            rows={4}
          />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={createTaskFromNote}
              onChange={e => setCreateTaskFromNote(e.target.checked)}
              className="rounded"
            />
            Tạo công việc từ ghi chú này
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNoteOpen(false)}>Hủy</Button>
            <Button
              disabled={!noteContent.trim() || noteAction.isLoading}
              onClick={async () => {
                const r = await noteAction.execute('post', `/leads/${lead.id}/activities`, { type: 'NOTE', content: noteContent });
                if (r) {
                  if (createTaskFromNote && user) {
                    try {
                      await api.post('/tasks', {
                        title: noteContent.substring(0, 50),
                        description: noteContent,
                        entityType: 'LEAD',
                        entityId: String(lead.id),
                        assignedTo: String(user.id),
                      });
                    } catch {
                      // task creation failure is non-blocking
                    }
                  }
                  setNoteOpen(false);
                  setNoteContent('');
                  setCreateTaskFromNote(false);
                }
              }}
            >
              {noteAction.isLoading ? 'Đang xử lý...' : 'Thêm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      {isAdmin && (
        <ConfirmDialog
          trigger={<Button size="sm" variant="destructive"><Trash2 className="h-4 w-4 mr-1" />Xóa</Button>}
          title="Xóa lead"
          description={`Bạn có chắc muốn xóa lead "${lead.name}"?`}
          confirmLabel="Xóa"
          onConfirm={() => deleteAction.execute('delete', `/leads/${lead.id}`)}
          isLoading={deleteAction.isLoading}
        />
      )}
    </div>
  );
}
