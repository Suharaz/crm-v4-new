'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { invalidatePreviewCache } from '@/components/shared/entity-quick-preview-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/shared/form-field';
import { useFormAction } from '@/hooks/use-form-action';
import { leadSchema, parseZodErrors } from '@/lib/zod-form-validation-schemas';
import { api } from '@/lib/api-client';

interface LeadFormProps {
  lead?: any;
  sources: any[];
  products: any[];
}

/** Create/edit form for leads. */
export function LeadForm({ lead, sources, products }: LeadFormProps) {
  const router = useRouter();
  const isEdit = !!lead;
  const { execute, isLoading, error } = useFormAction({
    successMessage: isEdit ? 'Đã cập nhật lead' : 'Đã tạo lead',
    onSuccess: () => router.push('/leads'),
  });

  const [form, setForm] = useState({
    phone: lead?.phone || '',
    name: lead?.name || '',
    email: lead?.email || '',
    sourceId: lead?.sourceId || '',
    productId: lead?.productId || '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [metadataRows, setMetadataRows] = useState<{ key: string; value: string }[]>(
    lead?.metadata ? Object.entries(lead.metadata).map(([k, v]) => ({ key: k, value: String(v) })) : []
  );
  const [phoneDuplicate, setPhoneDuplicate] = useState<{ name: string; phone: string; diffs?: string[] } | null>(null);

  // Auto-fill from existing customer when phone matches
  useEffect(() => {
    if (isEdit || form.phone.length < 10) { setPhoneDuplicate(null); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ data: any[] }>(`/customers/search?phone=${form.phone}`);
        const match = res.data?.[0];
        if (match) {
          // Auto-fill empty fields from customer data
          setForm(prev => ({
            ...prev,
            name: prev.name || match.name || '',
            email: prev.email || match.email || '',
          }));
          // Warn if user entered different info
          const diffs: string[] = [];
          if (form.name && match.name && form.name !== match.name) diffs.push(`Tên: ${match.name}`);
          if (form.email && match.email && form.email !== match.email) diffs.push(`Email: ${match.email}`);
          setPhoneDuplicate({ name: match.name, phone: match.phone, diffs });
        } else {
          setPhoneDuplicate(null);
        }
      } catch { setPhoneDuplicate(null); }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.phone, isEdit]);

  function update(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: '' }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = leadSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(parseZodErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    const body: Record<string, any> = {
      phone: form.phone,
      name: form.name,
    };
    if (form.email) body.email = form.email;
    if (form.sourceId) body.sourceId = form.sourceId;
    if (form.productId) body.productId = form.productId;
    // Metadata from key-value rows
    const meta: Record<string, string> = {};
    metadataRows.forEach(r => { if (r.key.trim() && r.value.trim()) meta[r.key.trim()] = r.value.trim(); });
    if (Object.keys(meta).length > 0) body.metadata = meta;

    if (isEdit) {
      await execute('patch', `/leads/${lead.id}`, body);
      invalidatePreviewCache('lead', lead.id);
    } else {
      await execute('post', '/leads', body);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">Thông tin lead</h3>

        <FormField label="Số điện thoại" required error={fieldErrors.phone}>
          <Input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="0912345678" />
          {phoneDuplicate && (
            <div className="mt-1 rounded-md bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-700">
              Khách hàng đã có: <span className="font-semibold">{phoneDuplicate.name}</span> — dữ liệu đã tự điền
              {phoneDuplicate.diffs && phoneDuplicate.diffs.length > 0 && (
                <div className="mt-1 text-red-600 font-medium">
                  ⚠ Thông tin khác biệt: {phoneDuplicate.diffs.join(', ')}
                </div>
              )}
            </div>
          )}
        </FormField>

        <FormField label="Họ tên" error={fieldErrors.name}>
          <Input value={form.name} onChange={e => update('name', e.target.value)} placeholder="Nguyễn Văn A" />
        </FormField>

        <FormField label="Email" error={fieldErrors.email}>
          <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="email@example.com" />
        </FormField>

        <FormField label="Nguồn">
          <Select value={form.sourceId} onValueChange={v => update('sourceId', v)}>
            <SelectTrigger><SelectValue placeholder="Chọn nguồn" /></SelectTrigger>
            <SelectContent>
              {sources.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Sản phẩm">
          <Select value={form.productId} onValueChange={v => update('productId', v)}>
            <SelectTrigger><SelectValue placeholder="Chọn sản phẩm" /></SelectTrigger>
            <SelectContent>
              {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      {/* Metadata key-value pairs */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Thông tin thêm</h3>
          <Button type="button" size="sm" variant="outline" onClick={() => setMetadataRows(prev => [...prev, { key: '', value: '' }])}>
            + Thêm trường
          </Button>
        </div>
        {metadataRows.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input
              value={row.key}
              onChange={e => setMetadataRows(prev => prev.map((r, j) => j === i ? { ...r, key: e.target.value } : r))}
              placeholder="Tên trường"
              className="w-40"
            />
            <Input
              value={row.value}
              onChange={e => setMetadataRows(prev => prev.map((r, j) => j === i ? { ...r, value: e.target.value } : r))}
              placeholder="Giá trị"
              className="flex-1"
            />
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setMetadataRows(prev => prev.filter((_, j) => j !== i))}>
              <span className="text-red-400">×</span>
            </Button>
          </div>
        ))}
        {metadataRows.length === 0 && <p className="text-sm text-gray-400">Chưa có trường nào. Nhấn "Thêm trường" để bắt đầu.</p>}
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Đang lưu...' : (isEdit ? 'Cập nhật' : 'Tạo lead')}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Hủy</Button>
      </div>
    </form>
  );
}
