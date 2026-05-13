'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Phone, Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { leadSecondaryPhonesApi } from '@/lib/api/lead-secondary-phones';
import type { CustomerPhoneRecord } from '@/types/entities';

interface Props {
  leadId: string;
  /** Có customer chưa - quyết định hint hiển thị (auto-create vs read existing). */
  hasCustomer?: boolean;
}

// Relaxed: 8-14 digits, optional leading '+' (VN mobile / service / international)
const PHONE_RE = /^\+?\d{8,14}$/;

/**
 * Section "Số điện thoại khác" trong LeadForm/LeadEditDrawer.
 * - MỌI role thêm/sửa/xóa được (khác customer-phones - chỉ MANAGER+).
 * - Backend tự ensure customer (auto-create nếu lead.customerId rỗng).
 */
export function LeadSecondaryPhonesSection({ leadId, hasCustomer }: Props) {
  const [phones, setPhones] = useState<CustomerPhoneRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerPhoneRecord | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await leadSecondaryPhonesApi.list(leadId);
      setPhones(res.data || []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi tải SĐT phụ');
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => { refresh(); }, [refresh]);

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(phone: CustomerPhoneRecord) {
    setEditing(phone);
    setDialogOpen(true);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2">
          <Phone className="h-4 w-4 text-sky-600" />
          Số điện thoại khác
          {phones.length > 0 && (
            <span className="text-xs font-normal text-slate-500">({phones.length})</span>
          )}
        </h3>
        <Button size="sm" variant="outline" onClick={openAdd} className="h-9">
          <Plus className="h-4 w-4 mr-1" />Thêm số
        </Button>
      </div>

      {!hasCustomer && phones.length === 0 && (
        <p className="text-xs text-slate-400 mb-2 italic">
          Số sẽ được lưu vào hồ sơ khách hàng (tự động tạo khi cần)
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Đang tải...</p>
      ) : phones.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có số phụ</p>
      ) : (
        <ul className="space-y-2">
          {phones.map((p) => (
            <PhoneRow
              key={p.id}
              phone={p}
              leadId={leadId}
              onEdit={() => openEdit(p)}
              onDeleted={refresh}
            />
          ))}
        </ul>
      )}

      <PhoneDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        leadId={leadId}
        editing={editing}
        onSaved={refresh}
      />
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function PhoneRow({
  phone, leadId, onEdit, onDeleted,
}: {
  phone: CustomerPhoneRecord;
  leadId: string;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await leadSecondaryPhonesApi.remove(leadId, phone.id);
      toast.success('Đã xóa số phụ');
      onDeleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Lỗi khi xóa');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3 hover:bg-slate-50">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm font-medium text-slate-800">{phone.phone}</span>
          {phone.label && (
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
              {phone.label}
            </span>
          )}
        </div>
        {phone.note && (
          <p className="mt-1 truncate text-xs text-slate-500">{phone.note}</p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          size="icon" variant="ghost" className="h-9 w-9"
          onClick={onEdit} aria-label="Sửa"
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <ConfirmDialog
          trigger={
            <Button size="icon" variant="ghost" className="h-9 w-9 text-rose-600" aria-label="Xóa">
              <Trash2 className="h-4 w-4" />
            </Button>
          }
          title="Xóa số phụ?"
          description={`Số ${phone.phone} sẽ bị xóa khỏi danh sách.`}
          confirmLabel="Xóa"
          onConfirm={handleDelete}
          isLoading={deleting}
        />
      </div>
    </li>
  );
}

// ── Dialog (add + edit) ───────────────────────────────────────────────────

function PhoneDialog({
  open, onOpenChange, leadId, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  leadId: string;
  editing: CustomerPhoneRecord | null;
  onSaved: () => void;
}) {
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function handleOpenChange(v: boolean) {
    if (v) {
      setPhone(editing?.phone ?? '');
      setLabel(editing?.label ?? '');
      setNote(editing?.note ?? '');
    }
    onOpenChange(v);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = phone.trim();
    if (!PHONE_RE.test(trimmed)) {
      toast.error('Số điện thoại không hợp lệ (VD: 0901234567)');
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        await leadSecondaryPhonesApi.update(leadId, editing.id, {
          phone: trimmed,
          label: label.trim() || undefined,
          note: note.trim() || undefined,
        });
        toast.success('Đã cập nhật số phụ');
      } else {
        await leadSecondaryPhonesApi.add(leadId, {
          phone: trimmed,
          label: label.trim() || undefined,
          note: note.trim() || undefined,
        });
        toast.success('Đã thêm số phụ');
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Có lỗi xảy ra');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Sửa số phụ' : 'Thêm số phụ'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="lead-phone">Số điện thoại *</Label>
            <Input
              id="lead-phone" value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0901234567"
              required autoFocus
            />
          </div>
          <div>
            <Label htmlFor="lead-phone-label">Nhãn</Label>
            <Input
              id="lead-phone-label" value={label} maxLength={50}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="VD: Vợ, Thư ký, Công ty"
            />
          </div>
          <div>
            <Label htmlFor="lead-phone-note">Ghi chú</Label>
            <Textarea
              id="lead-phone-note" value={note} maxLength={255}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú thêm (tùy chọn)"
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Hủy</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Đang lưu...' : (editing ? 'Cập nhật' : 'Thêm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
