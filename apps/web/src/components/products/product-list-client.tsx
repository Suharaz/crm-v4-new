'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { SettingsCrudList } from '@/components/settings/settings-crud-list';
import { useFormAction } from '@/hooks/use-form-action';
import { useAuth } from '@/providers/auth-provider';
import { formatVND } from '@/lib/utils';
import { productSchema, parseZodErrors } from '@/lib/zod-form-validation-schemas';
import { Plus, Pencil, Trash2, Power } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';

interface ProductListClientProps {
  products: any[];
  categories: any[];
}

/** Products & categories page with tabs. */
export function ProductListClient({ products, categories }: ProductListClientProps) {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';
  const isAdmin = user?.role === 'SUPER_ADMIN';

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [viewingProduct, setViewingProduct] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', price: '', description: '', categoryId: '', vatRate: '0' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { execute, isLoading } = useFormAction({ successMessage: 'Đã lưu sản phẩm' });
  const deleteAction = useFormAction({ successMessage: 'Đã xóa sản phẩm' });
  const [toggling, setToggling] = useState<string | null>(null);

  async function toggleActive(p: any) {
    setToggling(p.id);
    try {
      await api.patch(`/products/${p.id}`, { isActive: !p.isActive });
      toast.success(p.isActive ? 'Đã ẩn sản phẩm' : 'Đã kích hoạt sản phẩm');
      try { localStorage.removeItem('crm_order_products'); } catch { /* */ }
      window.location.reload();
    } catch { toast.error('Lỗi cập nhật'); }
    setToggling(null);
  }

  function update(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: '' }));
  }

  function openCreate() {
    setEditingProduct(null);
    setForm({ name: '', price: '', description: '', categoryId: '', vatRate: '0' });
    setFieldErrors({});
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
    setFieldErrors({});
    setDialogOpen(true);
  }

  async function handleSubmit() {
    const parsed = productSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(parseZodErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    const body: Record<string, any> = { name: form.name, price: Number(form.price) };
    if (form.description) body.description = form.description;
    if (form.categoryId) body.categoryId = form.categoryId;
    body.vatRate = Number(form.vatRate) || 0;

    const result = editingProduct
      ? await execute('patch', `/products/${editingProduct.id}`, body)
      : await execute('post', '/products', body);

    if (result) {
      setDialogOpen(false);
      // Invalidate order dialog cache so new products show up
      try { localStorage.removeItem('crm_order_products'); } catch { /* */ }
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Sản phẩm</h1>
      <p className="text-sm text-gray-500 mb-4">Quản lý sản phẩm và danh mục</p>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">Sản phẩm</TabsTrigger>
          <TabsTrigger value="categories">Danh mục</TabsTrigger>
        </TabsList>

        {/* ── Tab: Sản phẩm ── */}
        <TabsContent value="products">
          <div className="flex items-center justify-end mb-4">
            {isManager && (
              <Button onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" />Thêm sản phẩm
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.length === 0 ? (
              <div className="col-span-full rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">Không có sản phẩm nào</div>
            ) : products.map((p: any) => (
              <div key={p.id} className={`rounded-xl border p-5 cursor-pointer hover:shadow-sm transition-all ${p.isActive ? 'border-gray-200 bg-white hover:border-sky-200' : 'border-gray-100 bg-gray-50 opacity-60'}`} onClick={() => setViewingProduct(p)}>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {p.name}
                      {!p.isActive && <span className="ml-2 text-xs text-red-400 font-normal">Đã ẩn</span>}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500">{p.category?.name || 'Chưa phân loại'}</p>
                  </div>
                  {isManager && (
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(p)} disabled={toggling === p.id} title={p.isActive ? 'Ẩn sản phẩm' : 'Kích hoạt'}>
                        <Power className={`h-3.5 w-3.5 ${p.isActive ? 'text-emerald-500' : 'text-gray-300'}`} />
                      </Button>
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
                {p.description && <p className="mt-2 line-clamp-2 text-sm text-gray-600">{p.description}</p>}
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ── Tab: Danh mục ── */}
        <TabsContent value="categories">
          <SettingsCrudList
            data={categories}
            endpoint="/product-categories"
            entityName="Danh mục sản phẩm"
            fields={[{ key: 'name', label: 'Tên danh mục', required: true, placeholder: 'VD: Khóa học, Tư vấn...' }]}
            canEdit={isManager}
          />
        </TabsContent>
      </Tabs>

      {/* View Product Detail Dialog */}
      <Dialog open={!!viewingProduct} onOpenChange={() => setViewingProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewingProduct?.name}</DialogTitle>
          </DialogHeader>
          {viewingProduct && (
            <div className="space-y-3 py-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Danh mục</span>
                <span className="font-medium">{viewingProduct.category?.name || 'Chưa phân loại'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Giá</span>
                <span className="text-lg font-bold text-sky-600">{formatVND(Number(viewingProduct.price))}</span>
              </div>
              {Number(viewingProduct.vatRate) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">VAT</span>
                  <span>{viewingProduct.vatRate}%</span>
                </div>
              )}
              {viewingProduct.description && (
                <div>
                  <span className="text-gray-500">Mô tả</span>
                  <p className="mt-1 whitespace-pre-wrap text-gray-700">{viewingProduct.description}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingProduct(null)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Product Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingProduct ? 'Sửa sản phẩm' : 'Thêm sản phẩm'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Tên sản phẩm" required error={fieldErrors.name}>
              <Input value={form.name} onChange={e => update('name', e.target.value)} placeholder="VD: Khóa học ABC" />
            </FormField>
            <FormField label="Giá (VNĐ)" required error={fieldErrors.price}>
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
