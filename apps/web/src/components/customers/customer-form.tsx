'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { invalidatePreviewCache } from '@/components/shared/entity-quick-preview-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/shared/form-field';
import { useFormAction } from '@/hooks/use-form-action';
import { customerSchema, parseZodErrors } from '@/lib/zod-form-validation-schemas';
import { useAuth } from '@/providers/auth-provider';

interface CustomerFormProps {
  customer?: any;
  departments: any[];
  users: any[];
}

/** Create/edit form for customers. */
export function CustomerForm({ customer, departments, users }: CustomerFormProps) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const isEdit = !!customer;
  const canEditPhone = !isEdit || ['SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role || '');
  const { execute, isLoading, error } = useFormAction({
    successMessage: isEdit ? 'Đã cập nhật khách hàng' : 'Đã tạo khách hàng',
    onSuccess: () => router.push('/customers'),
  });

  const [form, setForm] = useState({
    phone: customer?.phone || '',
    name: customer?.name || '',
    email: customer?.email || '',
    companyName: customer?.companyName || '',
    facebookUrl: customer?.facebookUrl || '',
    instagramUrl: customer?.instagramUrl || '',
    zaloPhone: customer?.zaloPhone || '',
    linkedinUrl: customer?.linkedinUrl || '',
    assignedUserId: customer?.assignedUserId || '',
    assignedDepartmentId: customer?.assignedDepartmentId || '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [metadataRows, setMetadataRows] = useState<{ key: string; value: string }[]>(
    customer?.metadata ? Object.entries(customer.metadata).map(([k, v]) => ({ key: k, value: String(v) })) : []
  );

  function update(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) setFieldErrors(prev => ({ ...prev, [key]: '' }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = customerSchema.safeParse(form);
    if (!parsed.success) {
      setFieldErrors(parseZodErrors(parsed.error));
      return;
    }
    setFieldErrors({});
    const body: Record<string, any> = { phone: form.phone, name: form.name };
    if (form.email) body.email = form.email;
    if (form.companyName) body.companyName = form.companyName;
    if (form.facebookUrl) body.facebookUrl = form.facebookUrl;
    if (form.instagramUrl) body.instagramUrl = form.instagramUrl;
    if (form.zaloPhone) body.zaloPhone = form.zaloPhone;
    if (form.linkedinUrl) body.linkedinUrl = form.linkedinUrl;
    if (form.assignedUserId) body.assignedUserId = form.assignedUserId;
    if (form.assignedDepartmentId) body.assignedDepartmentId = form.assignedDepartmentId;
    const meta: Record<string, string> = {};
    metadataRows.forEach(r => { if (r.key.trim() && r.value.trim()) meta[r.key.trim()] = r.value.trim(); });
    if (Object.keys(meta).length > 0) body.metadata = meta;

    if (isEdit) {
      await execute('patch', `/customers/${customer.id}`, body);
      invalidatePreviewCache('customer', customer.id);
    } else {
      await execute('post', '/customers', body);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">Thông tin khách hàng</h3>

        <FormField label="Số điện thoại" required error={fieldErrors.phone}>
          <Input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="0912345678" readOnly={!canEditPhone} className={!canEditPhone ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''} />
          {!canEditPhone && <p className="text-xs text-gray-400 mt-0.5">Chỉ quản lý mới được sửa SĐT</p>}
        </FormField>

        <FormField label="Họ tên" required error={fieldErrors.name}>
          <Input value={form.name} onChange={e => update('name', e.target.value)} placeholder="Nguyễn Văn A" />
        </FormField>

        <FormField label="Email" error={fieldErrors.email}>
          <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="email@example.com" />
        </FormField>

        <FormField label="Phòng ban">
          <Select value={form.assignedDepartmentId} onValueChange={v => update('assignedDepartmentId', v)}>
            <SelectTrigger><SelectValue placeholder="Chọn phòng ban" /></SelectTrigger>
            <SelectContent>
              {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Nhân viên phụ trách">
          <Select value={form.assignedUserId} onValueChange={v => update('assignedUserId', v)}>
            <SelectTrigger><SelectValue placeholder="Chọn nhân viên" /></SelectTrigger>
            <SelectContent>
              {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </FormField>
      </div>

      {/* Company + Social links */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
        <h3 className="font-semibold text-gray-900">Công ty & Mạng xã hội</h3>

        <FormField label="Tên công ty" error={fieldErrors.companyName}>
          <Input value={form.companyName} onChange={e => update('companyName', e.target.value)} placeholder="Công ty ABC" />
        </FormField>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Facebook" error={fieldErrors.facebookUrl}>
            <Input value={form.facebookUrl} onChange={e => update('facebookUrl', e.target.value)} placeholder="https://facebook.com/..." />
          </FormField>
          <FormField label="Instagram" error={fieldErrors.instagramUrl}>
            <Input value={form.instagramUrl} onChange={e => update('instagramUrl', e.target.value)} placeholder="https://instagram.com/..." />
          </FormField>
          <FormField label="Zalo" error={fieldErrors.zaloPhone}>
            <Input value={form.zaloPhone} onChange={e => update('zaloPhone', e.target.value)} placeholder="0912345678" />
          </FormField>
          <FormField label="LinkedIn" error={fieldErrors.linkedinUrl}>
            <Input value={form.linkedinUrl} onChange={e => update('linkedinUrl', e.target.value)} placeholder="https://linkedin.com/in/..." />
          </FormField>
        </div>
      </div>

      {/* Metadata */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Thông tin thêm</h3>
          <Button type="button" size="sm" variant="outline" onClick={() => setMetadataRows(prev => [...prev, { key: '', value: '' }])}>
            + Thêm trường
          </Button>
        </div>
        {metadataRows.map((row, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Input value={row.key} onChange={e => setMetadataRows(prev => prev.map((r, j) => j === i ? { ...r, key: e.target.value } : r))} placeholder="Tên trường" className="w-40" />
            <Input value={row.value} onChange={e => setMetadataRows(prev => prev.map((r, j) => j === i ? { ...r, value: e.target.value } : r))} placeholder="Giá trị" className="flex-1" />
            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => setMetadataRows(prev => prev.filter((_, j) => j !== i))}>
              <span className="text-red-400">×</span>
            </Button>
          </div>
        ))}
        {metadataRows.length === 0 && <p className="text-sm text-gray-400">Nhấn "Thêm trường" để thêm thông tin tùy chỉnh.</p>}
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Đang lưu...' : (isEdit ? 'Cập nhật' : 'Tạo khách hàng')}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>Hủy</Button>
      </div>
    </form>
  );
}
