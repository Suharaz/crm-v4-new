'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { useFormAction } from '@/hooks/use-form-action';
import { useAuth } from '@/providers/auth-provider';
import { formatVND } from '@/lib/utils';
import { Plus, Pencil, Trash2 } from 'lucide-react';

interface ProductListClientProps {
  products: any[];
  categories: any[];
}

/** Products grid with dialog-based CRUD. */
export function ProductListClient({ products, categories }: ProductListClientProps) {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', price: '', description: '', categoryId: '', vatRate: '0' });

  const { execute, isLoading } = useFormAction({ successMessage: 'Đã lưu sản phẩm' });
  const deleteAction = useFormAction({ successMessage: 'Đã xóa sản phẩm' });

  function update(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditingProduct(null);
    setForm({ name: '', price: '', description: '', categoryId: '', vatRate: '0' });
    setDialogOpen(true);
  }

  function openEdit(p: any) {
    setEditingProduct(p);
    setForm({
      name: p.name || '',
      price: String(p.price) || '',
      description: p.description || '',
      categoryId: p.categoryId || '',
      vatRate: String(p.vatRate) || '0',
    });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    const body: Record<string, any> = { name: form.name, price: Number(form.price) };
    if (form.description) body.description = form.description;
    if (form.categoryId) body.categoryId = form.categoryId;
    body.vatRate = Number(form.vatRate) || 0;

    const result = editingProduct
      ? await execute('patch', `/products/${editingProduct.id}`, body)
      : await execute('post', '/products', body);

    if (result) setDialogOpen(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sản phẩm</h1>
          <p className="text-sm text-gray-500">Danh sách sản phẩm và dịch vụ</p>
        </div>
        {isManager && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />Thêm sản phẩm
          </Button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.length === 0 ? (
          <div className="col-span-full rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">Không có sản phẩm nào</div>
        ) : products.map((p: any) => (
          <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{p.category?.name || 'Chưa phân loại'}</p>
              </div>
              {isManager && (
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
                    <Pencil className="h-3.5 w-3.5 text-gray-400" />
                  </Button>
                  {isAdmin && (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      }
                      title="Xóa sản phẩm"
                      description={`Bạn có chắc muốn xóa "${p.name}"?`}
                      confirmLabel="Xóa"
                      onConfirm={() => deleteAction.execute('delete', `/products/${p.id}`)}
                      isLoading={deleteAction.isLoading}
                    />
                  )}
                </div>
              )}
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-lg font-bold text-sky-600">{formatVND(Number(p.price))}</span>
              {Number(p.vatRate) > 0 && <span className="text-xs text-gray-400">+VAT {p.vatRate}%</span>}
            </div>
            {p.description && <p className="mt-2 text-sm text-gray-600">{p.description}</p>}
          </div>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Tên sản phẩm" required>
              <Input value={form.name} onChange={e => update('name', e.target.value)} placeholder="VD: Khóa học ABC" />
            </FormField>
            <FormField label="Giá (VNĐ)" required>
              <Input type="number" value={form.price} onChange={e => update('price', e.target.value)} placeholder="1000000" />
            </FormField>
            <FormField label="Thuế VAT (%)">
              <Input type="number" value={form.vatRate} onChange={e => update('vatRate', e.target.value)} placeholder="0" />
            </FormField>
            <FormField label="Danh mục">
              <Select value={form.categoryId} onValueChange={v => update('categoryId', v)}>
                <SelectTrigger><SelectValue placeholder="Chọn danh mục" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Mô tả">
              <Textarea value={form.description} onChange={e => update('description', e.target.value)} placeholder="Mô tả sản phẩm..." />
            </FormField>
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
