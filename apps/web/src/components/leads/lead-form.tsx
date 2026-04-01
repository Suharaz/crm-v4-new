'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
  const [phoneDuplicate, setPhoneDuplicate] = useState<{ name: string; phone: string } | null>(null);

  // Check phone duplicate on blur
  useEffect(() => {
    if (isEdit || form.phone.length < 10) { setPhoneDuplicate(null); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ data: any[] }>(`/customers/search?phone=${form.phone}`);
        const match = res.data?.[0];
        if (match && match.name !== form.name) {
          setPhoneDuplicate({ name: match.name, phone: match.phone });
        } else {
          setPhoneDuplicate(null);
        }
      } catch { setPhoneDuplicate(null); }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.phone, form.name, isEdit]);

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

    if (isEdit) {
      await execute('patch', `/leads/${lead.id}`, body);
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
            <div className="mt-1 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              ⚠ SĐT đã tồn tại — <span className="font-semibold">{phoneDuplicate.name}</span> ({phoneDuplicate.phone})
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

      <div className="flex gap-3">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Đang lưu...' : (isEdit ? 'Cập nhật' : 'Tạo lead')}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Hủy</Button>
      </div>
    </form>
  );
}
