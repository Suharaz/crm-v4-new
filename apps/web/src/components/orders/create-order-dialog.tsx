'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/shared/form-field';
import { api } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';

interface CreateOrderDialogProps {
  customerId: string;
  leadId?: string;
  products: any[];
}

/** Dialog to create an order — pick product (price auto-filled), then optionally create first payment. */
export function CreateOrderDialog({ customerId, leadId, products }: CreateOrderDialogProps) {
  const router = useRouter();
  const [step, setStep] = useState<'order' | 'payment'>('order');
  const [open, setOpen] = useState(false);
  const [productId, setProductId] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Created order state (for payment step)
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [orderAmount, setOrderAmount] = useState(0);

  // Payment form
  const [paymentAmount, setPaymentAmount] = useState('');

  const selectedProduct = products.find(p => p.id === productId);
  const price = selectedProduct ? Number(selectedProduct.price) : 0;
  const vatRate = selectedProduct?.vatRate || 0;
  const vatAmount = Math.round(price * vatRate / 100);
  const totalAmount = price + vatAmount;

  function resetAndClose() {
    setOpen(false);
    setStep('order');
    setProductId('');
    setNotes('');
    setCreatedOrderId(null);
    setOrderAmount(0);
    setPaymentAmount('');
  }

  async function handleCreateOrder() {
    if (!productId) { toast.error('Vui lòng chọn sản phẩm'); return; }
    setSubmitting(true);
    try {
      const body: Record<string, any> = {
        customerId,
        productId,
        amount: price,
      };
      if (leadId) body.leadId = leadId;
      if (notes) body.notes = notes;

      const res = await api.post<{ data: any }>('/orders', body);
      const order = res.data;
      setCreatedOrderId(order.id);
      setOrderAmount(Number(order.totalAmount || totalAmount));
      toast.success('Đã tạo đơn hàng');

      // Move to payment step
      setStep('payment');
      setPaymentAmount(String(Number(order.totalAmount || totalAmount)));
    } catch (err: any) {
      toast.error(err.message || 'Lỗi tạo đơn hàng');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreatePayment() {
    if (!createdOrderId || !paymentAmount) return;
    setSubmitting(true);
    try {
      await api.post('/payments', {
        orderId: createdOrderId,
        amount: Number(paymentAmount),
      });
      toast.success('Đã tạo thanh toán');
      resetAndClose();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi tạo thanh toán');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkipPayment() {
    resetAndClose();
    router.refresh();
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />Tạo đơn hàng
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
        <DialogContent className="sm:max-w-md">
          {step === 'order' ? (
            <>
              <DialogHeader><DialogTitle>Tạo đơn hàng</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <FormField label="Sản phẩm" required>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger><SelectValue placeholder="Chọn sản phẩm" /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} — {formatVND(Number(p.price))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>

                {selectedProduct && (
                  <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Giá sản phẩm</span>
                      <span className="font-medium">{formatVND(price)}</span>
                    </div>
                    {vatRate > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">VAT ({vatRate}%)</span>
                        <span>{formatVND(vatAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold">
                      <span>Tổng cộng</span>
                      <span className="text-sky-600">{formatVND(totalAmount)}</span>
                    </div>
                  </div>
                )}

                <FormField label="Ghi chú">
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ghi chú đơn hàng..." rows={2} />
                </FormField>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetAndClose}>Hủy</Button>
                <Button onClick={handleCreateOrder} disabled={!productId || submitting}>
                  {submitting ? 'Đang tạo...' : 'Tạo đơn hàng'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader><DialogTitle>Tạo thanh toán đợt 1</DialogTitle></DialogHeader>
              <div className="space-y-4 py-2">
                <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
                  Đơn hàng đã tạo thành công — tổng: {formatVND(orderAmount)}
                </div>
                <FormField label="Số tiền thanh toán (VNĐ)" required>
                  <input
                    type="number"
                    className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    value={paymentAmount}
                    onChange={e => setPaymentAmount(e.target.value)}
                    placeholder={String(orderAmount)}
                  />
                </FormField>
                <p className="text-xs text-gray-400">
                  Nhập toàn bộ để thanh toán 1 lần, hoặc nhập một phần cho đợt 1
                </p>
              </div>
              <DialogFooter className="flex gap-2">
                <Button variant="outline" onClick={handleSkipPayment}>Bỏ qua</Button>
                <Button onClick={handleCreatePayment} disabled={!paymentAmount || submitting}>
                  {submitting ? 'Đang tạo...' : 'Tạo thanh toán'}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
