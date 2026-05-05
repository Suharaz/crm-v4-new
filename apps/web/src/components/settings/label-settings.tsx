'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Pencil, Trash2, Plus, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { api } from '@/lib/api-client';
import { settingsNameSchema, parseZodErrors } from '@/lib/zod-form-validation-schemas';
import type { LabelEntity, LabelRecallConfigItem } from '@/types/entities';

interface LabelSettingsProps {
  data: LabelEntity[];
  recallConfigs: LabelRecallConfigItem[];
  canEdit: boolean;        // manager + admin: edit name/color/category
  canEditRecall: boolean;  // super admin only: edit recall days
}

interface FormState {
  name: string;
  color: string;
  category: string;
  days: string;  // empty string = no recall
}

const EMPTY_FORM: FormState = { name: '', color: '#6b7280', category: '', days: '' };

/** Label settings with integrated auto-recall config (per-label day timer). */
export function LabelSettings({ data, recallConfigs, canEdit, canEditRecall }: LabelSettingsProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<LabelEntity | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Map labelId → config for O(1) lookup
  const configByLabelId = new Map(recallConfigs.map(c => [c.labelId, c]));

  function openCreate() {
    setEditingLabel(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setDialogOpen(true);
  }

  function openEdit(label: LabelEntity) {
    const config = configByLabelId.get(label.id);
    setEditingLabel(label);
    setForm({
      name: label.name,
      color: label.color || '#6b7280',
      category: label.category || '',
      days: config ? String(config.days) : '',
    });
    setErrors({});
    setDialogOpen(true);
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    const nameParsed = settingsNameSchema.safeParse({ name: form.name });
    if (!nameParsed.success) Object.assign(next, parseZodErrors(nameParsed.error));
    if (form.days !== '') {
      const n = Number(form.days);
      if (!Number.isInteger(n) || n < 1 || n > 365) {
        next.days = 'Số ngày phải là số nguyên từ 1 đến 365';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setIsLoading(true);
    const newDays = form.days === '' ? undefined : Number(form.days);
    const labelBody = { name: form.name, color: form.color, category: form.category || undefined };

    try {
      let labelId: string;
      if (editingLabel) {
        await api.patch(`/labels/${editingLabel.id}`, labelBody);
        labelId = editingLabel.id;
      } else {
        const created = await api.post<{ data: { id: string } }>('/labels', labelBody);
        labelId = created.data.id;
      }

      // Recall config diff (only super admin can change this)
      if (canEditRecall) {
        const currentConfig = editingLabel ? configByLabelId.get(editingLabel.id) : undefined;
        await syncRecallConfig(labelId, currentConfig, newDays, editingLabel?.name || form.name);
      }

      toast.success(editingLabel ? 'Đã cập nhật nhãn' : 'Đã tạo nhãn');
      setDialogOpen(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  }

  async function syncRecallConfig(
    labelId: string,
    current: LabelRecallConfigItem | undefined,
    newDays: number | undefined,
    labelName: string,
  ) {
    try {
      if (!current && newDays) {
        await api.post('/recall-configs/labels', { labelId, days: newDays });
      } else if (current && !newDays) {
        await api.delete(`/recall-configs/labels/${current.id}`);
      } else if (current && newDays && current.days !== newDays) {
        await api.patch(`/recall-configs/labels/${current.id}`, { days: newDays });
      }
    } catch (err) {
      // Label CRUD already succeeded — surface partial failure clearly
      const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
      toast.warning(`Đã lưu nhãn "${labelName}" nhưng cấu hình recall thất bại: ${msg}`);
    }
  }

  async function handleDelete(label: LabelEntity) {
    try {
      await api.delete(`/labels/${label.id}`);
      toast.success('Đã vô hiệu hóa nhãn');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Có lỗi xảy ra');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-slate-900">Nhãn ({data.length})</h3>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Thêm
          </Button>
        )}
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-slate-400">Chưa có dữ liệu</p>
      ) : (
        <div className="space-y-1">
          {data.map((item) => {
            const config = configByLabelId.get(item.id);
            return (
              <div key={item.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50">
                <div className="flex flex-1 items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-sm text-slate-700">{item.name}</span>
                  {item.category && <span className="text-xs text-slate-400">{item.category}</span>}
                  {config && (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">
                      <Clock className="h-3 w-3" />
                      Recall {config.days} ngày
                    </span>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                      <Pencil className="h-3.5 w-3.5 text-slate-400" />
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      }
                      title="Xóa nhãn"
                      description={`Bạn có chắc muốn vô hiệu hóa nhãn "${item.name}"? Cấu hình recall theo nhãn này (nếu có) sẽ ngừng chạy.`}
                      confirmLabel="Xóa"
                      onConfirm={() => handleDelete(item)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingLabel ? 'Sửa nhãn' : 'Thêm nhãn'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Field label="Tên nhãn" required error={errors.name}>
              <Input
                placeholder="VD: VIP"
                value={form.name}
                onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
              />
            </Field>
            <Field label="Màu sắc">
              <Input
                type="color"
                className="h-10 w-20 p-1"
                value={form.color}
                onChange={(e) => setForm(p => ({ ...p, color: e.target.value }))}
              />
            </Field>
            <Field label="Danh mục">
              <Input
                placeholder="VD: lead, customer"
                value={form.category}
                onChange={(e) => setForm(p => ({ ...p, category: e.target.value }))}
              />
            </Field>
            {canEditRecall && (
              <Field
                label="Số ngày auto-recall"
                error={errors.days}
                hint="Để trống nếu không cần auto-recall. Lead có nhãn này quá X ngày sẽ về kho POOL."
              >
                <Input
                  type="number"
                  min={1}
                  max={365}
                  placeholder="VD: 7"
                  value={form.days}
                  onChange={(e) => setForm(p => ({ ...p, days: e.target.value }))}
                />
              </Field>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, required, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
