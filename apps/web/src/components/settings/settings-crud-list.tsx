'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useFormAction } from '@/hooks/use-form-action';
import { settingsNameSchema, parseZodErrors } from '@/lib/zod-form-validation-schemas';
import { Pencil, Trash2, Plus } from 'lucide-react';

interface FieldConfig {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'color';
  required?: boolean;
  placeholder?: string;
}

interface SettingsCrudListProps {
  data: any[];
  endpoint: string;
  entityName: string;
  fields: FieldConfig[];
  canEdit: boolean;
  renderItem?: (item: any) => React.ReactNode;
}

/** Generic CRUD list for settings entities with dialog-based create/edit/delete. */
export function SettingsCrudList({ data, endpoint, entityName, fields, canEdit, renderItem }: SettingsCrudListProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { execute, isLoading } = useFormAction({ successMessage: `${entityName} đã được lưu` });
  const deleteAction = useFormAction({ successMessage: `Đã xóa ${entityName.toLowerCase()}` });

  function openCreate() {
    setEditingItem(null);
    const defaults: Record<string, any> = {};
    fields.forEach(f => { defaults[f.key] = f.type === 'number' ? '' : (f.type === 'color' ? '#6b7280' : ''); });
    setFormData(defaults);
    setFieldErrors({});
    setDialogOpen(true);
  }

  function openEdit(item: any) {
    setEditingItem(item);
    const values: Record<string, any> = {};
    fields.forEach(f => { values[f.key] = item[f.key] ?? ''; });
    setFormData(values);
    setFieldErrors({});
    setDialogOpen(true);
  }

  async function handleSubmit() {
    // Validate required name field if present
    const nameField = fields.find(f => f.key === 'name' && f.required);
    if (nameField) {
      const parsed = settingsNameSchema.safeParse({ name: formData['name'] });
      if (!parsed.success) {
        setFieldErrors(parseZodErrors(parsed.error));
        return;
      }
    }
    setFieldErrors({});
    const body: Record<string, any> = {};
    fields.forEach(f => {
      const val = formData[f.key];
      if (val !== '' && val !== undefined) {
        body[f.key] = f.type === 'number' ? Number(val) : val;
      }
    });

    const result = editingItem
      ? await execute('patch', `${endpoint}/${editingItem.id}`, body)
      : await execute('post', endpoint, body);

    if (result) setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    await deleteAction.execute('delete', `${endpoint}/${id}`);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{entityName} ({data.length})</h3>
        {canEdit && (
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Thêm
          </Button>
        )}
      </div>

      {data.length === 0 ? (
        <p className="text-sm text-gray-400">Chưa có dữ liệu</p>
      ) : (
        <div className="space-y-1">
          {data.map((item: any) => (
            <div key={item.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-50">
              <div className="flex-1">
                {renderItem ? renderItem(item) : (
                  <span className="text-sm text-gray-700">{item.name}</span>
                )}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                    <Pencil className="h-3.5 w-3.5 text-gray-400" />
                  </Button>
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </Button>
                    }
                    title={`Xóa ${entityName.toLowerCase()}`}
                    description={`Bạn có chắc muốn xóa "${item.name}"? Hành động này không thể hoàn tác.`}
                    confirmLabel="Xóa"
                    onConfirm={() => handleDelete(item.id)}
                    isLoading={deleteAction.isLoading}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? `Sửa ${entityName.toLowerCase()}` : `Thêm ${entityName.toLowerCase()}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {fields.map(f => (
              <div key={f.key} className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  {f.label}
                  {f.required && <span className="text-red-500 ml-0.5">*</span>}
                </label>
                <Input
                  type={f.type === 'color' ? 'color' : f.type === 'number' ? 'number' : 'text'}
                  placeholder={f.placeholder}
                  value={formData[f.key] ?? ''}
                  onChange={e => {
                    setFormData(prev => ({ ...prev, [f.key]: e.target.value }));
                    if (fieldErrors[f.key]) setFieldErrors(prev => ({ ...prev, [f.key]: '' }));
                  }}
                  className={f.type === 'color' ? 'h-10 w-20 p-1' : undefined}
                />
                {fieldErrors[f.key] && <p className="text-xs text-red-500">{fieldErrors[f.key]}</p>}
              </div>
            ))}
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
