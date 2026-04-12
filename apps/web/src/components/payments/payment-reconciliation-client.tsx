'use client';

import React, { useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { formatDate, formatVND, cn } from '@/lib/utils';
import { CheckCircle, XCircle, Loader2, ChevronDown, ChevronRight, Search, Calendar, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { PaymentRecord, BankTransactionRecord, NamedEntity } from '@/types/entities';

// ─── Import result type ───────────────────────────────────────────────────────
interface ImportResult {
  total: number;
  created: number;
  matched: number;
  newCustomers: number;
  newOrders: number;
  errors: { row: number; phone: string; reason: string }[];
}

// ─── Import Excel Dialog ──────────────────────────────────────────────────────
function ImportExcelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f && !f.name.match(/\.(xlsx|xls)$/i)) {
      toast.error('Chỉ chấp nhận file Excel (.xlsx, .xls)');
      return;
    }
    setFile(f);
    setResult(null);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      // Use fetch directly to handle multipart (api client always sets Content-Type: application/json)
      const res = await fetch('/api/proxy/payments/import', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Lỗi tải lên' }));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setResult(json.data as ImportResult);
      toast.success('Tải lên hoàn tất');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi tải lên');
    } finally {
      setUploading(false);
    }
  }

  function handleDownloadTemplate() {
    window.location.href = '/api/proxy/payments/import-template';
  }

  function handleClose() {
    setFile(null);
    setResult(null);
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Tải lên Excel thanh toán</DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            {/* File picker */}
            <div
              className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-sky-400 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
              {file ? (
                <p className="text-sm font-medium text-slate-700">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-slate-500">Nhấn để chọn file Excel</p>
                  <p className="text-xs text-slate-400 mt-1">Hỗ trợ .xlsx, .xls — tối đa 10MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {/* Template download */}
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="text-xs text-sky-600 hover:underline flex items-center gap-1"
            >
              <Download className="h-3.5 w-3.5" />
              Tải file mẫu Excel
            </button>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={handleClose} disabled={uploading}>
                Huỷ
              </Button>
              <Button
                className="bg-sky-600 hover:bg-sky-700 text-white"
                onClick={handleUpload}
                disabled={!file || uploading}
              >
                {uploading ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Upload className="h-4 w-4 mr-1.5" />}
                Tải lên
              </Button>
            </div>
          </div>
        ) : (
          /* Result summary */
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3">
                <p className="text-xs text-emerald-600 font-medium">Tạo thành công</p>
                <p className="text-2xl font-bold text-emerald-700">{result.created}</p>
                <p className="text-xs text-emerald-500">chờ xác minh</p>
              </div>
              <div className="rounded-lg bg-sky-50 border border-sky-200 p-3">
                <p className="text-xs text-sky-600 font-medium">Đã map NH</p>
                <p className="text-2xl font-bold text-sky-700">{result.matched}</p>
                <p className="text-xs text-sky-500">giao dịch tự động</p>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                <p className="text-xs text-amber-600 font-medium">Khách hàng mới</p>
                <p className="text-2xl font-bold text-amber-700">{result.newCustomers}</p>
                <p className="text-xs text-amber-500">được tạo tự động</p>
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                  <p className="text-xs text-red-600 font-medium">Lỗi</p>
                  <p className="text-2xl font-bold text-red-700">{result.errors.length}</p>
                  <p className="text-xs text-red-500">dòng bị bỏ qua</p>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500">
              Tổng cộng {result.total} dòng · {result.newOrders} đơn hàng mới
            </p>

            {/* Error detail table */}
            {result.errors.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-red-100">
                <table className="w-full text-xs">
                  <thead className="bg-red-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-red-700">Dòng</th>
                      <th className="px-3 py-2 text-left font-medium text-red-700">SĐT</th>
                      <th className="px-3 py-2 text-left font-medium text-red-700">Lý do lỗi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i} className="border-t border-red-100">
                        <td className="px-3 py-1.5 text-slate-600">{e.row}</td>
                        <td className="px-3 py-1.5 text-slate-600">{e.phone || '—'}</td>
                        <td className="px-3 py-1.5 text-red-600">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <Button onClick={handleClose}>Đóng &amp; làm mới</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Order status label map ───────────────────────────────────────────────────
const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING: 'Chờ xử lý', CONFIRMED: 'Xác nhận', CONVERTED: 'Đã chuyển',
  CANCELLED: 'Đã huỷ', REFUNDED: 'Hoàn tiền',
};

// ─── Payment Expand Detail ────────────────────────────────────────────────────
function PaymentExpandDetail({ payment }: { payment: PaymentRecord }) {
  const o = payment.order;
  return (
    <div className="bg-slate-50 border-t border-slate-100 px-4 py-3 text-xs text-slate-700 space-y-3">
      {/* Order info */}
      {o && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
          <div>
            <span className="text-slate-400 block">Đơn hàng</span>
            <span className="font-medium">#{o.id}</span>
            {o.status && (
              <span className={cn('ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                o.status === 'CANCELLED' ? 'bg-red-100 text-red-600' :
                o.status === 'CONVERTED' ? 'bg-emerald-100 text-emerald-700' :
                'bg-amber-100 text-amber-700'
              )}>
                {ORDER_STATUS_LABEL[o.status] ?? o.status}
              </span>
            )}
          </div>
          <div>
            <span className="text-slate-400 block">Tổng đơn</span>
            <span className="font-semibold text-slate-900">{formatVND(Number(o.totalAmount))}</span>
          </div>
          {o.vatEmail && (
            <div>
              <span className="text-slate-400 block">Email VAT</span>
              <span>{o.vatEmail}</span>
            </div>
          )}
          {o.customer && (
            <div>
              <span className="text-slate-400 block">Khách hàng</span>
              <span className="font-medium">{o.customer.name}</span>
              {o.customer.phone && <span className="text-slate-500 ml-1">· {o.customer.phone}</span>}
            </div>
          )}
          {o.product && (
            <div>
              <span className="text-slate-400 block">Sản phẩm</span>
              <span>{o.product.name}</span>
            </div>
          )}
          {o.creator && (
            <div>
              <span className="text-slate-400 block">Sale phụ trách</span>
              <span>{o.creator.name}</span>
            </div>
          )}
          {o.lead && (
            <div>
              <span className="text-slate-400 block">Lead</span>
              <span>{o.lead.name} <span className="text-slate-400">#{o.lead.id}</span></span>
            </div>
          )}
        </div>
      )}
      {/* Payment detail */}
      <div className="border-t border-slate-100 pt-2 grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
        <div>
          <span className="text-slate-400 block">Số tiền thanh toán</span>
          <span className="font-semibold text-slate-900">{formatVND(Number(payment.amount))}</span>
        </div>
        {payment.vatAmount != null && (
          <div>
            <span className="text-slate-400 block">VAT</span>
            <span>{formatVND(Number(payment.vatAmount))}</span>
          </div>
        )}
        {payment.installment && (
          <div>
            <span className="text-slate-400 block">Đợt thanh toán</span>
            <span>{payment.installment.name}</span>
          </div>
        )}
        {payment.transferDate && (
          <div>
            <span className="text-slate-400 block">Ngày chuyển khoản</span>
            <span>{formatDate(payment.transferDate)}</span>
          </div>
        )}
        {payment.transferContent && (
          <div className="col-span-2">
            <span className="text-slate-400 block">Nội dung CK</span>
            <span className="break-all">{payment.transferContent}</span>
          </div>
        )}
        {payment.bankAccount && (
          <div>
            <span className="text-slate-400 block">Tài khoản ngân hàng</span>
            <span>{payment.bankAccount.name}</span>
          </div>
        )}
      </div>
      {/* Auto-match info */}
      {payment.matchedTransaction && (
        <div className="border-t border-slate-100 pt-2">
          <span className="text-slate-400 block mb-1">Giao dịch NH đã match</span>
          <div className="flex flex-wrap gap-4">
            <span>{formatVND(Number(payment.matchedTransaction.amount))}</span>
            <span className="text-slate-600">{payment.matchedTransaction.content}</span>
            {payment.matchedTransaction.transactionTime && (
              <span className="text-slate-400">{formatDate(payment.matchedTransaction.transactionTime)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  pendingPayments: PaymentRecord[];
  unmatchedTx: BankTransactionRecord[];
  verifiedPayments: PaymentRecord[];
  paymentTypes?: NamedEntity[];
}

export function PaymentReconciliationClient({
  pendingPayments: initPending,
  unmatchedTx: initTx,
  verifiedPayments,
  paymentTypes = [],
}: Props) {
  const router = useRouter();
  const { user } = useAuth();
  const isManager = user?.role === 'MANAGER' || user?.role === 'SUPER_ADMIN';

  const [pending, setPending] = useState(initPending);
  const [unmatched, setUnmatched] = useState(initTx);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Expand state
  const [expandedPending, setExpandedPending] = useState<string | null>(null);
  const [expandedVerified, setExpandedVerified] = useState<string | null>(null);

  // Export state
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exporting, setExporting] = useState(false);

  // Import state
  const [importOpen, setImportOpen] = useState(false);

  // Filters (client-side on pending list)
  const [filterSearch, setFilterSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  const canMatch = selectedLeft && selectedRight;

  // ── Filtered pending list ──────────────────────────────────────────────────
  const filteredPending = useMemo(() => {
    return pending.filter((p) => {
      if (filterType && String(p.paymentType?.id) !== filterType) return false;
      if (filterSearch) {
        const term = filterSearch.toLowerCase();
        const inContent = p.transferContent?.toLowerCase().includes(term) ?? false;
        const inCustomer = p.order?.customer?.name?.toLowerCase().includes(term) ?? false;
        if (!inContent && !inCustomer) return false;
      }
      if (filterFrom) {
        const from = new Date(filterFrom);
        if (new Date(p.createdAt) < from) return false;
      }
      if (filterTo) {
        const to = new Date(filterTo + 'T23:59:59');
        if (new Date(p.createdAt) > to) return false;
      }
      return true;
    });
  }, [pending, filterSearch, filterType, filterFrom, filterTo]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function handleMatch() {
    if (!selectedLeft || !selectedRight) return;
    setProcessing(true);
    try {
      await api.post(`/bank-transactions/${selectedRight}/match`, { paymentId: selectedLeft });
      setPending(prev => prev.filter(p => String(p.id) !== selectedLeft));
      setUnmatched(prev => prev.filter(t => String(t.id) !== selectedRight));
      setSelectedLeft(null); setSelectedRight(null);
      toast.success('Đã xác minh thành công');
      router.refresh();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Lỗi xác minh'); }
    setProcessing(false);
  }

  async function handleVerifyOnly() {
    if (!selectedLeft) return;
    setProcessing(true);
    try {
      await api.post(`/payments/${selectedLeft}/verify`);
      setPending(prev => prev.filter(p => String(p.id) !== selectedLeft));
      setSelectedLeft(null);
      toast.success('Đã xác nhận');
      router.refresh();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Lỗi'); }
    setProcessing(false);
  }

  async function handleReject() {
    if (!selectedLeft) return;
    setProcessing(true);
    try {
      await api.post(`/payments/${selectedLeft}/reject`);
      setPending(prev => prev.filter(p => String(p.id) !== selectedLeft));
      setSelectedLeft(null);
      toast.success('Đã từ chối');
      router.refresh();
    } catch (err: unknown) { toast.error(err instanceof Error ? err.message : 'Lỗi'); }
    setProcessing(false);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (exportFrom) params.set('dateFrom', exportFrom);
      if (exportTo) params.set('dateTo', exportTo);
      const qs = params.toString();
      // Use proxy route so auth cookies are forwarded; browser triggers download from Content-Disposition header
      window.location.href = `/api/proxy/payments/export${qs ? '?' + qs : ''}`;
    } catch {
      toast.error('Lỗi tải xuống Excel');
    } finally {
      // Reset after short delay to allow navigation to start
      setTimeout(() => setExporting(false), 1500);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-900">Đối soát thanh toán</h1>
        {isManager && (
          <Button
            size="sm"
            variant="outline"
            className="border-sky-300 text-sky-700 hover:bg-sky-50 h-8 text-xs"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Tải lên Excel
          </Button>
        )}
      </div>
      <p className="text-sm text-slate-500 mb-4">Tick 1 bên trái + 1 bên phải → Xác minh ghép cặp</p>

      <ImportExcelDialog open={importOpen} onClose={() => { setImportOpen(false); router.refresh(); }} />

      <Tabs defaultValue="reconcile">
        <TabsList>
          <TabsTrigger value="reconcile">Chờ xử lý ({pending.length + unmatched.length})</TabsTrigger>
          <TabsTrigger value="verified">Đã xác minh ({verifiedPayments.length})</TabsTrigger>
        </TabsList>

        {/* ── Tab: Chờ xử lý ── */}
        <TabsContent value="reconcile">
          {/* Action bar */}
          <div className="flex items-center gap-3 my-3 min-h-[40px]">
            {processing ? (
              <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
            ) : canMatch ? (
              <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleMatch}>
                <CheckCircle className="h-4 w-4 mr-1" />Xác minh ghép cặp
              </Button>
            ) : selectedLeft && !selectedRight ? (
              <div className="flex gap-2">
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={handleVerifyOnly}>
                  <CheckCircle className="h-4 w-4 mr-1" />Xác nhận (không cần match)
                </Button>
                <Button variant="outline" className="text-red-600 border-red-200" onClick={handleReject}>
                  <XCircle className="h-4 w-4 mr-1" />Từ chối
                </Button>
              </div>
            ) : (
              <span className="text-sm text-slate-400">Chọn khoản thanh toán để xử lý</span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Left: Pending payments */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400" />
                Sale nhập — chờ duyệt ({filteredPending.length}/{pending.length})
              </h3>

              {/* Filter bar */}
              <div className="space-y-2 mb-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    placeholder="Tìm nội dung CK hoặc tên khách..."
                    value={filterSearch}
                    onChange={(e) => setFilterSearch(e.target.value)}
                    className="pl-8 h-8 text-xs"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={filterType} onValueChange={(v) => setFilterType(v === '__all__' ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs flex-1">
                      <SelectValue placeholder="Loại thanh toán" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Tất cả loại</SelectItem>
                      {paymentTypes.map(pt => (
                        <SelectItem key={pt.id} value={pt.id}>{pt.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-1 flex-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <Input
                      type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
                      className="h-8 text-xs px-2"
                    />
                    <span className="text-slate-400 text-xs shrink-0">–</span>
                    <Input
                      type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
                      className="h-8 text-xs px-2"
                    />
                  </div>
                </div>
              </div>

              {filteredPending.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                  {pending.length === 0 ? 'Không có' : 'Không có kết quả phù hợp'}
                </div>
              ) : (
                <div className="space-y-1 max-h-[60vh] overflow-y-auto">
                  {filteredPending.map((p) => {
                    const id = String(p.id);
                    const selected = selectedLeft === id;
                    const expanded = expandedPending === id;
                    return (
                      <div key={id} className={cn('rounded-lg border bg-white transition-all overflow-hidden',
                        selected ? 'border-sky-400 ring-1 ring-sky-400' : 'border-slate-200')}>
                        {/* Main row */}
                        <div className="flex items-start gap-2 px-3 py-2.5">
                          <input
                            type="checkbox" checked={selected}
                            onChange={() => setSelectedLeft(selected ? null : id)}
                            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 shrink-0"
                          />
                          {/* Clickable content area */}
                          <button
                            type="button"
                            className="flex-1 min-w-0 text-left"
                            onClick={() => setExpandedPending(expanded ? null : id)}
                          >
                            <div className="flex items-baseline gap-2 justify-between">
                              <div className="flex items-baseline gap-2">
                                <span className="font-bold text-slate-900">{formatVND(Number(p.amount))}</span>
                                {p.paymentType?.name && (
                                  <span className="text-xs bg-sky-50 text-sky-600 rounded px-1.5 py-0.5">{p.paymentType.name}</span>
                                )}
                              </div>
                              {expanded
                                ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                            </div>
                            <div className="flex flex-wrap gap-x-3 mt-0.5 text-xs text-slate-500">
                              {p.order?.customer?.name && (
                                <span className="font-medium text-slate-700">{p.order.customer.name}</span>
                              )}
                              {p.order?.product?.name && (
                                <span>{p.order.product.name}</span>
                              )}
                              {p.transferDate && (
                                <span>CK: {formatDate(p.transferDate)}</span>
                              )}
                              <span>{formatDate(p.createdAt)}</span>
                            </div>
                            {p.transferContent && (
                              <div className="text-xs text-slate-600 mt-0.5 truncate">{p.transferContent}</div>
                            )}
                          </button>
                        </div>
                        {/* Expandable detail */}
                        {expanded && <PaymentExpandDetail payment={p} />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Unmatched bank transactions */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sky-400" />
                Ngân hàng — chưa match ({unmatched.length})
              </h3>
              {unmatched.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">Tất cả đã match</div>
              ) : (
                <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
                  {unmatched.map((tx) => {
                    const id = String(tx.id);
                    const selected = selectedRight === id;
                    return (
                      <label key={id} className={cn('flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 cursor-pointer transition-all',
                        selected ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400' : 'border-slate-200 hover:border-slate-300')}>
                        <input type="checkbox" checked={selected} onChange={() => setSelectedRight(selected ? null : id)}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="font-bold text-slate-900">{formatVND(Number(tx.amount))}</span>
                            {tx.senderName && <span className="text-xs text-slate-500">{tx.senderName}</span>}
                          </div>
                          <div className="text-xs text-slate-700 mt-0.5">{tx.content}</div>
                          <div className="text-xs text-slate-400">{formatDate(tx.transactionTime)}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Tab: Đã xác minh ── */}
        <TabsContent value="verified">
          {isManager && (
            <div className="flex flex-wrap items-center gap-2 my-3">
              <div className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <Input
                  type="date"
                  value={exportFrom}
                  onChange={(e) => setExportFrom(e.target.value)}
                  className="h-8 text-xs px-2 w-36"
                  placeholder="Từ ngày"
                />
                <span className="text-slate-400 text-xs shrink-0">–</span>
                <Input
                  type="date"
                  value={exportTo}
                  onChange={(e) => setExportTo(e.target.value)}
                  className="h-8 text-xs px-2 w-36"
                  placeholder="Đến ngày"
                />
              </div>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8 text-xs"
                onClick={handleExport}
                disabled={exporting}
              >
                {exporting
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5 mr-1.5" />}
                Tải Excel
              </Button>
            </div>
          )}
          {verifiedPayments.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400 mt-2">Chưa có</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white mt-2">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">#</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500">Số tiền</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Loại</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Khách hàng</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Sản phẩm</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Người tạo</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Ngày CK</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Nguồn</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-500">Xác nhận</th>
                  </tr>
                </thead>
                <tbody>
                  {verifiedPayments.map((p) => {
                    const id = String(p.id);
                    const expanded = expandedVerified === id;
                    return (
                      <React.Fragment key={id}>
                        <tr
                          className={cn('border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition-colors',
                            expanded ? 'bg-sky-50' : '')}
                          onClick={() => setExpandedVerified(expanded ? null : id)}
                        >
                          <td className="px-4 py-3 text-slate-500">
                            <span className="flex items-center gap-1">
                              {expanded
                                ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
                              #{p.id}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatVND(Number(p.amount))}</td>
                          <td className="px-4 py-3 text-slate-600">{p.paymentType?.name || '—'}</td>
                          <td className="px-4 py-3 text-slate-700">{p.order?.customer?.name || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{p.order?.product?.name || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{p.order?.creator?.name || '—'}</td>
                          <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                            {p.transferDate ? formatDate(p.transferDate) : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${p.verifiedSource === 'AUTO' ? 'bg-sky-100 text-sky-700' : 'bg-purple-100 text-purple-700'}`}>
                              {p.verifiedSource === 'AUTO' ? 'Auto' : 'Thủ công'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                            {p.verifiedAt ? formatDate(p.verifiedAt) : '—'}
                            {p.verifier?.name && ` · ${p.verifier.name}`}
                          </td>
                        </tr>
                        {expanded && (
                          <tr className="border-b border-slate-100">
                            <td colSpan={9} className="p-0">
                              <PaymentExpandDetail payment={p} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
