'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/shared/form-field';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useFormAction } from '@/hooks/use-form-action';
import { useAuth } from '@/providers/auth-provider';
import { formatDate, formatVND } from '@/lib/utils';
import { api } from '@/lib/api-client';
import { Plus, CheckCircle, XCircle } from 'lucide-react';
import type { PaymentRecord, NamedEntity } from '@/types/entities';

interface PaymentActionsProps {
  orderId: string;
  payments: PaymentRecord[];
  paymentTypes: NamedEntity[];
  /** Pre-fetched installments from server; fallback to client fetch if empty. */
  paymentInstallments?: NamedEntity[];
  /** Order-level VAT rate for auto-calculating payment VAT amount. */
  vatRate?: number;
}

/** Payment section with create, verify, reject actions. */
export function PaymentActions({
  orderId,
  payments,
  paymentTypes,
  paymentInstallments: propInstallments = [],
  vatRate = 0,
}: PaymentActionsProps) {
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';

  const [createOpen, setCreateOpen] = useState(false);
  const [installments, setInstallments] = useState<NamedEntity[]>(propInstallments);
  const [form, setForm] = useState({
    amount: '',
    paymentTypeId: '',
    transferDate: '',
    installmentId: '',
  });

  // Client-side fallback: fetch installments if not provided via props
  useEffect(() => {
    if (!createOpen || installments.length > 0) return;
    api.get<{ data: NamedEntity[] }>('/payment-installments')
      .then(r => setInstallments((r.data || []).map(i => ({ id: String(i.id), name: i.name }))))
      .catch(() => {});
  }, [createOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const createAction = useFormAction({ successMessage: 'Đã tạo thanh toán' });
  const verifyAction = useFormAction({ successMessage: 'Đã xác nhận thanh toán' });
  const rejectAction = useFormAction({ successMessage: 'Đã từ chối thanh toán' });

  function update(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  // Auto-calculate VAT extracted from gross payment amount
  const pmtAmountNum = Number(form.amount);
  const pmtVatAmount = vatRate > 0 && pmtAmountNum > 0
    ? Math.round(pmtAmountNum * vatRate / 100)
    : 0;

  async function handleCreate() {
    const body: Record<string, unknown> = {
      orderId,
      amount: pmtAmountNum,
    };
    if (form.paymentTypeId) body.paymentTypeId = form.paymentTypeId;
    if (form.transferDate) body.transferDate = form.transferDate;
    if (form.installmentId) body.installmentId = form.installmentId;
    if (vatRate > 0 && pmtVatAmount > 0) body.vatAmount = pmtVatAmount;

    const result = await createAction.execute('post', '/payments', body);
    if (result) {
      setCreateOpen(false);
      setForm({ amount: '', paymentTypeId: '', transferDate: '', installmentId: '' });
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Thanh toán ({payments.length})</h3>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />Thêm TT
        </Button>
      </div>

      {payments.length === 0 ? (
        <p className="text-sm text-gray-400">Chưa có thanh toán</p>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <div key={p.id} className="rounded-lg border border-gray-100 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.status === 'VERIFIED' ? 'bg-emerald-100 text-emerald-700' :
                      p.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {p.status === 'VERIFIED' ? 'Đã xác nhận' : p.status === 'REJECTED' ? 'Từ chối' : 'Chờ xác nhận'}
                    </span>
                    <span className="text-sm font-medium">{formatVND(Number(p.amount))}</span>
                    {p.installment && (
                      <span className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{p.installment.name}</span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-400">
                    {p.paymentType?.name && <span>{p.paymentType.name}</span>}
                    {p.transferDate && <span>Ngày CK: {formatDate(p.transferDate)}</span>}
                    {p.vatAmount && Number(p.vatAmount) > 0 && <span>VAT: {formatVND(Number(p.vatAmount))}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {p.status === 'PENDING' && isManager && (
                    <>
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                          </Button>
                        }
                        title="Xác nhận thanh toán"
                        description="Xác nhận đã nhận được thanh toán này?"
                        confirmLabel="Xác nhận"
                        onConfirm={() => verifyAction.execute('post', `/payments/${p.id}/verify`)}
                        isLoading={verifyAction.isLoading}
                      />
                      <ConfirmDialog
                        trigger={
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <XCircle className="h-4 w-4 text-red-500" />
                          </Button>
                        }
                        title="Từ chối thanh toán"
                        description="Từ chối thanh toán này?"
                        confirmLabel="Từ chối"
                        onConfirm={() => rejectAction.execute('post', `/payments/${p.id}/reject`)}
                        isLoading={rejectAction.isLoading}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Payment Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Thêm thanh toán</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Số tiền (VNĐ)" required>
              <Input
                type="number"
                value={form.amount}
                onChange={e => update('amount', e.target.value)}
                placeholder="1000000"
              />
            </FormField>
            {vatRate > 0 && pmtAmountNum > 0 && (
              <FormField label="Tiền VAT (tự tính)">
                <Input value={formatVND(pmtVatAmount)} readOnly className="bg-gray-50 text-gray-600" />
              </FormField>
            )}
            <FormField label="Loại thanh toán">
              <Select value={form.paymentTypeId} onValueChange={v => update('paymentTypeId', v)}>
                <SelectTrigger><SelectValue placeholder="Chọn loại" /></SelectTrigger>
                <SelectContent>
                  {paymentTypes.map(pt => <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </FormField>
            {installments.length > 0 && (
              <FormField label="Đợt thanh toán">
                <Select value={form.installmentId} onValueChange={v => update('installmentId', v)}>
                  <SelectTrigger><SelectValue placeholder="Chọn đợt" /></SelectTrigger>
                  <SelectContent>
                    {installments.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            )}
            <FormField label="Ngày chuyển khoản">
              <Input
                type="date"
                value={form.transferDate}
                onChange={e => update('transferDate', e.target.value)}
              />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Hủy</Button>
            <Button onClick={handleCreate} disabled={!form.amount || createAction.isLoading}>
              {createAction.isLoading ? 'Đang tạo...' : 'Tạo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
