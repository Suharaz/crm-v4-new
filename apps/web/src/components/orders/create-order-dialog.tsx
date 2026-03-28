'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/shared/form-field';
import { useFormAction } from '@/hooks/use-form-action';
import { orderSchema, parseZodErrors } from '@/lib/zod-form-validation-schemas';
import { Plus } from 'lucide-react';

interface CreateOrderDialogProps {
  customerId: string;
  leadId?: string;
  products: any[];
}

/** Dialog to create an order from customer/lead detail page. */
export function CreateOrderDialog({ customerId, leadId, products }: CreateOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ productId: '', amount: '', notes: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const { execute, isLoading } = useFormAction({ successMessage: 'Đã tạo đơn hàng' });

  function update(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: '' }));
  }

  function onProductChange(productId: string) {
    update('productId', productId);
    const product = products.find(p => p.id === productId);
    if (product) update('amount', String(product.price));
  }

  async function handleSubmit() {
    const parsed = orderSchema.safeParse({ customerId, amount: form.amount, productId: form.productId, notes: form.notes });
    if (!parsed.success) {
      setFieldErrors(parseZodErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    const body: Record<string, any> = {
      customerId,
      amount: Number(form.amount),
    };
    if (leadId) body.leadId = leadId;
    if (form.productId) body.productId = form.productId;
    if (form.notes) body.notes = form.notes;

    const result = await execute('post', '/orders', body);
    if (result) {
      setOpen(false);
      setForm({ productId: '', amount: '', notes: '' });
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />Tạo đơn hàng
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tạo đơn hàng</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Sản phẩm">
              <Select value={form.productId} onValueChange={onProductChange}>
                <SelectTrigger><SelectValue placeholder="Chọn sản phẩm" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Số tiền (VNĐ)" required error={fieldErrors.amount}>
              <Input type="number" value={form.amount} onChange={e => update('amount', e.target.value)} placeholder="1000000" />
            </FormField>
            <FormField label="Ghi chú">
              <Textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="Ghi chú đơn hàng..." />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button>
            <Button onClick={handleSubmit} disabled={!form.amount || isLoading}>
              {isLoading ? 'Đang tạo...' : 'Tạo đơn'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
