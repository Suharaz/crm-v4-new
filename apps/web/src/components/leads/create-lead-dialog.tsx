'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SourceCombobox } from '@/components/ui/source-combobox';
import { FormField } from '@/components/shared/form-field';
import { api } from '@/lib/api-client';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { NamedEntity } from '@/types/entities';

interface CreateLeadDialogProps {
  /** @deprecated SourceCombobox tự fetch + cache 24h. Prop giữ lại để không break parent pages. */
  sources?: { id: string; name: string }[];
  products?: { id: string; name: string }[];
}

/** Popup dialog for quick lead creation. Sources fetched + cached qua SourceCombobox. */
export function CreateLeadDialog({ products: initialProducts }: CreateLeadDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Lazy-load products if not provided. Sources xử lý qua SourceCombobox (cache 24h).
  const [products, setProducts] = useState(initialProducts || []);

  useEffect(() => {
    if (!open) return;
    if (products.length === 0) {
      api.get<{ data: NamedEntity[] }>('/products').then(r => setProducts((r.data || []).map((p) => ({ id: String(p.id), name: p.name })))).catch(() => {});
    }
  }, [open, products.length]);

  const [form, setForm] = useState({ phone: '', name: '', email: '', sourceId: '', productId: '', note: '' });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [phoneDuplicate, setPhoneDuplicate] = useState<{ name: string; phone: string } | null>(null);

  // Auto-fill from existing customer when phone matches
  useEffect(() => {
    if (form.phone.length < 10) { setPhoneDuplicate(null); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ data: { name: string; phone: string; email?: string }[] }>(`/customers/search?phone=${form.phone}`);
        const match = res.data?.[0];
        if (match) {
          setForm(prev => ({ ...prev, name: prev.name || match.name || '', email: prev.email || match.email || '' }));
          setPhoneDuplicate({ name: match.name, phone: match.phone });
        } else {
          setPhoneDuplicate(null);
        }
      } catch { setPhoneDuplicate(null); }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.phone]);

  function update(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: '' }));
  }

  function resetAndClose() {
    setOpen(false);
    setForm({ phone: '', name: '', email: '', sourceId: '', productId: '', note: '' });
    setFieldErrors({});
    setPhoneDuplicate(null);
  }

  async function handleSubmit() {
    // Validate phone
    if (!form.phone || !/^\+?\d{8,14}$/.test(form.phone)) {
      setFieldErrors({ phone: 'SĐT không hợp lệ (8-14 chữ số, có thể bắt đầu bằng + hoặc 0)' });
      return;
    }
    // Validate note length (defense in depth - HTML maxLength + backend đã chặn 2000)
    const trimmedNote = form.note.trim();
    if (trimmedNote.length > 2000) {
      setFieldErrors({ note: 'Note tối đa 2000 ký tự' });
      return;
    }
    setFieldErrors({});
    setSubmitting(true);
    try {
      const body: Record<string, string> = { phone: form.phone };
      if (form.name) body.name = form.name;
      if (form.email) body.email = form.email;
      if (form.sourceId) body.sourceId = form.sourceId;
      if (form.productId) body.productId = form.productId;
      // Skip note nếu rỗng sau trim - tránh tạo activity rỗng + tiết kiệm payload
      if (trimmedNote) body.note = trimmedNote;

      await api.post('/leads', body);
      toast.success('Đã tạo lead');
      resetAndClose();
      router.refresh();
    } catch (err: unknown) {
      toast.error((err as { message?: string }).message || 'Lỗi tạo lead');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4 mr-1" />Tạo Lead
      </Button>
      <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Tạo lead mới</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <FormField label="Số điện thoại" required error={fieldErrors.phone}>
              <Input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="0912345678" autoFocus />
              {phoneDuplicate && (
                <p className="mt-1 text-xs text-sky-600">
                  KH đã có: <span className="font-semibold">{phoneDuplicate.name}</span> - dữ liệu đã tự điền
                </p>
              )}
            </FormField>

            <FormField label="Họ tên">
              <Input value={form.name} onChange={e => update('name', e.target.value)} placeholder="Nguyễn Văn A" />
            </FormField>

            <FormField label="Email">
              <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="email@example.com" />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Nguồn">
                <SourceCombobox
                  value={form.sourceId}
                  onChange={(v) => update('sourceId', v)}
                  placeholder="Chọn"
                />
              </FormField>

              <FormField label="Sản phẩm">
                <Select value={form.productId} onValueChange={v => update('productId', v)}>
                  <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                  <SelectContent>
                    {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <FormField label="Ghi chú ban đầu" error={fieldErrors.note}>
              <Textarea
                value={form.note}
                onChange={e => update('note', e.target.value)}
                placeholder="VD: Khách hẹn gọi lại 3h chiều..."
                rows={3}
                maxLength={2000}
                className="resize-y max-h-40"
              />
              <div className={`mt-1 text-xs text-right ${form.note.length > 2000 ? 'text-red-500' : 'text-slate-400'}`}>
                {form.note.length}/2000
              </div>
            </FormField>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={resetAndClose}>Hủy</Button>
            <Button onClick={handleSubmit} disabled={!form.phone || submitting}>
              {submitting ? 'Đang tạo...' : 'Tạo lead'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
