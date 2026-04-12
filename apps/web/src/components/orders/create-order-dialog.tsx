'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/shared/form-field';
import { api } from '@/lib/api-client';
import { formatVND } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { NamedEntity, ProductRecord } from '@/types/entities';

interface CreateOrderDialogProps {
  customerId: string;
  leadId?: string;
  products: ProductRecord[];
  paymentTypes?: NamedEntity[];
}

/** Single-step dialog: create order + payment together. */
const CACHE_KEY_PRODUCTS = 'crm_order_products';
const CACHE_KEY_PT = 'crm_order_payment_types';
const CACHE_KEY_BA = 'crm_order_bank_accounts';
const CACHE_KEY_FORMATS = 'crm_order_formats';
const CACHE_KEY_GROUPS = 'crm_order_product_groups';
const CACHE_KEY_INSTALLMENTS = 'crm_order_installments';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

/** Invalidate order dialog caches — call after adding/editing products, payment types, bank accounts */
export function invalidateOrderCaches() {
  try {
    localStorage.removeItem(CACHE_KEY_PRODUCTS);
    localStorage.removeItem(CACHE_KEY_PT);
    localStorage.removeItem(CACHE_KEY_BA);
    localStorage.removeItem(CACHE_KEY_FORMATS);
    localStorage.removeItem(CACHE_KEY_GROUPS);
    localStorage.removeItem(CACHE_KEY_INSTALLMENTS);
  } catch { /* */ }
}

function readOrderCache(key: string) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL) { localStorage.removeItem(key); return null; }
    return parsed.data;
  } catch { return null; }
}
function writeOrderCache(key: string, data: (ProductRecord | NamedEntity)[]) {
  try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* */ }
}

export function CreateOrderDialog({ customerId, leadId, products: propProducts, paymentTypes: propPaymentTypes = [] }: CreateOrderDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Self-loading data with cache (merge with props if provided)
  const [loadedProducts, setLoadedProducts] = useState<ProductRecord[]>(propProducts);
  const [loadedPaymentTypes, setLoadedPaymentTypes] = useState<NamedEntity[]>(propPaymentTypes);
  const [bankAccounts, setBankAccounts] = useState<NamedEntity[]>([]);
  const [orderFormats, setOrderFormats] = useState<NamedEntity[]>([]);
  const [productGroups, setProductGroups] = useState<NamedEntity[]>([]);
  const [paymentInstallments, setPaymentInstallments] = useState<NamedEntity[]>([]);

  useEffect(() => {
    if (!open) return;
    // Products
    if (loadedProducts.length === 0) {
      const cached = readOrderCache(CACHE_KEY_PRODUCTS);
      if (cached) { setLoadedProducts(cached); }
      else {
        api.get<{ data: ProductRecord[] }>('/products').then(r => {
          const mapped = (r.data || []).map((p) => ({ ...p, id: String(p.id) }));
          setLoadedProducts(mapped);
          writeOrderCache(CACHE_KEY_PRODUCTS, mapped);
        }).catch(() => {});
      }
    }
    // Payment types
    if (loadedPaymentTypes.length === 0) {
      const cached = readOrderCache(CACHE_KEY_PT);
      if (cached) { setLoadedPaymentTypes(cached); }
      else {
        api.get<{ data: NamedEntity[] }>('/payment-types').then(r => {
          const mapped = (r.data || []).map((pt) => ({ ...pt, id: String(pt.id) }));
          setLoadedPaymentTypes(mapped);
          writeOrderCache(CACHE_KEY_PT, mapped);
        }).catch(() => {});
      }
    }
    // Bank accounts
    if (bankAccounts.length === 0) {
      const cached = readOrderCache(CACHE_KEY_BA);
      if (cached) { setBankAccounts(cached); }
      else {
        api.get<{ data: NamedEntity[] }>('/bank-accounts').then(r => {
          const mapped = (r.data || []).map((ba) => ({ id: String(ba.id), name: ba.name }));
          setBankAccounts(mapped);
          writeOrderCache(CACHE_KEY_BA, mapped);
        }).catch(() => {});
      }
    }
    // Order formats
    if (orderFormats.length === 0) {
      const cached = readOrderCache(CACHE_KEY_FORMATS);
      if (cached) { setOrderFormats(cached); }
      else {
        api.get<{ data: NamedEntity[] }>('/order-formats').then(r => {
          const mapped = (r.data || []).map((f) => ({ id: String(f.id), name: f.name }));
          setOrderFormats(mapped);
          writeOrderCache(CACHE_KEY_FORMATS, mapped);
        }).catch(() => {});
      }
    }
    // Product groups
    if (productGroups.length === 0) {
      const cached = readOrderCache(CACHE_KEY_GROUPS);
      if (cached) { setProductGroups(cached); }
      else {
        api.get<{ data: NamedEntity[] }>('/product-groups').then(r => {
          const mapped = (r.data || []).map((g) => ({ id: String(g.id), name: g.name }));
          setProductGroups(mapped);
          writeOrderCache(CACHE_KEY_GROUPS, mapped);
        }).catch(() => {});
      }
    }
    // Payment installments
    if (paymentInstallments.length === 0) {
      const cached = readOrderCache(CACHE_KEY_INSTALLMENTS);
      if (cached) { setPaymentInstallments(cached); }
      else {
        api.get<{ data: NamedEntity[] }>('/payment-installments').then(r => {
          const mapped = (r.data || []).map((i) => ({ id: String(i.id), name: i.name }));
          setPaymentInstallments(mapped);
          writeOrderCache(CACHE_KEY_INSTALLMENTS, mapped);
        }).catch(() => {});
      }
    }
  }, [open]);

  // Order fields
  const [productId, setProductId] = useState('');
  const [notes, setNotes] = useState('');
  const [formatId, setFormatId] = useState('');
  const [productGroupId, setProductGroupId] = useState('');
  const [stt, setStt] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [taxCode, setTaxCode] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [vatEmail, setVatEmail] = useState('');

  // Payment fields
  const [paymentTypeId, setPaymentTypeId] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [transferContent, setTransferContent] = useState('');
  const [transferDate, setTransferDate] = useState('');
  const [installmentId, setInstallmentId] = useState('');

  const products = loadedProducts;
  const paymentTypes = loadedPaymentTypes;
  const selectedProduct = products.find(p => p.id === productId);
  const price = selectedProduct ? Number(selectedProduct.price) : 0;
  const vatRate = selectedProduct?.vatRate || 0;
  const vatAmount = Math.round(price * vatRate / 100);
  const totalAmount = price + vatAmount;

  // VAT on payment amount: vatAmount = amount * vatRate / 100
  const pmtAmountNum = Number(paymentAmount) || totalAmount;
  const pmtVatAmount = vatRate > 0 ? Math.round(pmtAmountNum * vatRate / 100) : 0;

  function resetAndClose() {
    setOpen(false);
    setProductId(''); setNotes(''); setFormatId(''); setProductGroupId('');
    setStt(''); setCourseCode('');
    setCompanyName(''); setTaxCode(''); setContactPerson('');
    setCustomerName(''); setCustomerPhone(''); setAddress(''); setVatEmail('');
    setPaymentTypeId(''); setBankAccountId(''); setPaymentAmount('');
    setTransferContent(''); setTransferDate(''); setInstallmentId('');
  }

  async function handleSubmit() {
    if (!productId) { toast.error('Vui lòng chọn sản phẩm'); return; }
    setSubmitting(true);
    try {
      // Step 1: Create order
      const orderBody: Record<string, unknown> = { productId, amount: price };
      if (customerId) orderBody.customerId = customerId;
      if (leadId) orderBody.leadId = leadId;
      if (notes) orderBody.notes = notes;
      if (formatId) orderBody.formatId = formatId;
      if (productGroupId) orderBody.productGroupId = productGroupId;
      if (stt) orderBody.stt = stt;
      if (courseCode) orderBody.courseCode = courseCode;
      if (companyName) orderBody.companyName = companyName;
      if (taxCode) orderBody.taxCode = taxCode;
      if (contactPerson) orderBody.contactPerson = contactPerson;
      if (customerName) orderBody.customerName = customerName;
      if (customerPhone) orderBody.customerPhone = customerPhone;
      if (address) orderBody.address = address;
      if (vatEmail) orderBody.vatEmail = vatEmail;

      const orderRes = await api.post<{ data: { id: string; totalAmount: number } }>('/orders', orderBody);
      const order = orderRes.data;

      // Step 2: Create payment
      const pmtAmount = Number(paymentAmount) || Number(order.totalAmount || totalAmount);
      const pmtBody: Record<string, unknown> = { orderId: order.id, amount: pmtAmount };
      if (paymentTypeId) pmtBody.paymentTypeId = paymentTypeId;
      if (bankAccountId) pmtBody.bankAccountId = bankAccountId;
      if (transferContent) pmtBody.transferContent = transferContent;
      if (transferDate) pmtBody.transferDate = transferDate;
      if (installmentId) pmtBody.installmentId = installmentId;
      if (vatRate > 0) pmtBody.vatAmount = pmtVatAmount;

      await api.post('/payments', pmtBody);

      toast.success('Đã tạo đơn hàng + thanh toán');
      resetAndClose();
      router.refresh();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi tạo đơn hàng');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />Tạo đơn hàng
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Tạo đơn hàng + thanh toán</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* Product selection */}
            <FormField label="Sản phẩm" required>
              <Select value={productId} onValueChange={v => { setProductId(v); setPaymentAmount(''); }}>
                <SelectTrigger><SelectValue placeholder="Chọn sản phẩm" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name} — {formatVND(Number(p.price))}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            {/* Price summary */}
            {selectedProduct && (
              <div className="rounded-lg bg-gray-50 p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Giá</span><span className="font-medium">{formatVND(price)}</span></div>
                {vatRate > 0 && <div className="flex justify-between"><span className="text-gray-500">VAT ({vatRate}%)</span><span>{formatVND(vatAmount)}</span></div>}
                <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold"><span>Tổng</span><span className="text-sky-600">{formatVND(totalAmount)}</span></div>
              </div>
            )}

            {/* Customer info */}
            <div className="border-t border-gray-200 pt-3">
              <p className="text-sm font-semibold text-gray-700 mb-3">Thông tin khách hàng</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Tên khách">
                  <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Họ tên" />
                </FormField>
                <FormField label="SĐT khách">
                  <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="0912345678" />
                </FormField>
                <FormField label="Tên công ty">
                  <Input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Công ty ABC" />
                </FormField>
                <FormField label="Mã số thuế">
                  <Input value={taxCode} onChange={e => setTaxCode(e.target.value)} placeholder="0123456789" />
                </FormField>
                <FormField label="Người liên hệ">
                  <Input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="Tên người LH" />
                </FormField>
                <FormField label="Địa chỉ">
                  <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Địa chỉ" />
                </FormField>
                <FormField label="Mail nhận VAT" className="col-span-2">
                  <Input value={vatEmail} onChange={e => setVatEmail(e.target.value)} placeholder="email@example.com" type="email" />
                </FormField>
              </div>
            </div>

            {/* Order details */}
            <div className="border-t border-gray-200 pt-3">
              <p className="text-sm font-semibold text-gray-700 mb-3">Chi tiết đơn hàng</p>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Hình thức">
                  <Select value={formatId} onValueChange={setFormatId}>
                    <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                    <SelectContent>
                      {orderFormats.map(f => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Nhóm sản phẩm">
                  <Select value={productGroupId} onValueChange={setProductGroupId}>
                    <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                    <SelectContent>
                      {productGroups.map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="STT">
                  <Input value={stt} onChange={e => setStt(e.target.value)} placeholder="VD: 1, 2, 3..." />
                </FormField>
                <FormField label="Mã khoá">
                  <Input value={courseCode} onChange={e => setCourseCode(e.target.value)} placeholder="VD: KH001" />
                </FormField>
              </div>
            </div>

            {/* Payment section */}
            <div className="border-t border-gray-200 pt-3">
              <p className="text-sm font-semibold text-gray-700 mb-3">Thanh toán</p>
              <div className="grid grid-cols-2 gap-3">
                {paymentTypes.length > 0 && (
                  <FormField label="Hình thức CK">
                    <Select value={paymentTypeId} onValueChange={setPaymentTypeId}>
                      <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                      <SelectContent>
                        {paymentTypes.map(pt => <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
                {bankAccounts.length > 0 && (
                  <FormField label="Tài khoản NH">
                    <Select value={bankAccountId} onValueChange={setBankAccountId}>
                      <SelectTrigger><SelectValue placeholder="Chọn TK" /></SelectTrigger>
                      <SelectContent>
                        {bankAccounts.map(ba => <SelectItem key={ba.id} value={ba.id}>{ba.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
                {paymentInstallments.length > 0 && (
                  <FormField label="Đợt thanh toán">
                    <Select value={installmentId} onValueChange={setInstallmentId}>
                      <SelectTrigger><SelectValue placeholder="Chọn đợt" /></SelectTrigger>
                      <SelectContent>
                        {paymentInstallments.map(i => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
                <FormField label="Số tiền CK">
                  <Input type="number" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)}
                    placeholder={totalAmount > 0 ? `Mặc định: ${formatVND(totalAmount)}` : 'Số tiền'} />
                </FormField>
                <FormField label="Ngày chuyển khoản">
                  <Input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} />
                </FormField>
                {vatRate > 0 && pmtAmountNum > 0 && (
                  <FormField label="Tiền VAT (tính từ số CK)">
                    <Input value={formatVND(pmtVatAmount)} readOnly className="bg-gray-50 text-gray-600" />
                  </FormField>
                )}
              </div>
              <FormField label="Nội dung CK" className="mt-3">
                <Input value={transferContent} onChange={e => setTransferContent(e.target.value)} placeholder="VD: CK LAN 1 KHOA HOC DM" />
              </FormField>
            </div>

            <FormField label="Ghi chú">
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Ghi chú đơn hàng..." rows={2} />
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetAndClose}>Hủy</Button>
            <Button onClick={handleSubmit} disabled={!productId || submitting}>
              {submitting ? 'Đang tạo...' : 'Tạo đơn + thanh toán'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
