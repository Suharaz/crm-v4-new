'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2 } from 'lucide-react';
import { invalidatePreviewCache } from '@/components/shared/entity-quick-preview-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField } from '@/components/shared/form-field';
import { LeadSecondaryPhonesSection } from '@/components/leads/lead-secondary-phones-section';
import { useFormAction } from '@/hooks/use-form-action';
import { leadSchema, parseZodErrors } from '@/lib/zod-form-validation-schemas';
import { api } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';
import type { LeadRecord, NamedEntity } from '@/types/entities';

interface LeadFormProps {
  lead?: LeadRecord;
  sources: NamedEntity[];
  products: NamedEntity[];
  /**
   * 'page' (default): submit -> router.push('/leads'); render flat layout.
   * 'drawer': submit -> onSuccess; render accordion (sections expand on demand).
   */
  mode?: 'page' | 'drawer';
  /** Gọi sau khi submit thành công (drawer mode). */
  onSuccess?: () => void;
  /**
   * Khi accordion + user expand section cần data chi tiết (source/product/social/metadata),
   * gọi callback này để parent fetch /leads/:id và truyền lại qua `lead` prop. Idempotent.
   */
  onRequestDetail?: () => void;
  /** True khi parent đang fetch detail - section header sẽ hiện spinner. */
  loadingDetail?: boolean;
}

const FIELDS_NEED_DETAIL = ['sourceId', 'productId', 'companyName', 'facebookUrl', 'instagramUrl', 'zaloUrl', 'linkedinUrl'] as const;

/** Create/edit form for leads. */
export function LeadForm({
  lead, sources, products,
  mode = 'page',
  onSuccess,
  onRequestDetail,
  loadingDetail = false,
}: LeadFormProps) {
  const router = useRouter();
  const { user: currentUser } = useAuth();
  const isEdit = !!lead;
  const isManagerPlus = ['SUPER_ADMIN', 'MANAGER'].includes(currentUser?.role || '');
  const canEditPhone = !isEdit || isManagerPlus;
  const canEditNameSource = !isEdit || isManagerPlus;
  const accordion = mode === 'drawer';

  const { execute, isLoading, error } = useFormAction({
    successMessage: isEdit ? 'Đã cập nhật lead' : 'Đã tạo lead',
    onSuccess: () => {
      if (mode === 'drawer') onSuccess?.();
      else router.push('/leads');
    },
  });

  const [form, setForm] = useState({
    phone: lead?.phone || '',
    name: lead?.name || '',
    email: lead?.email || '',
    sourceId: lead?.sourceId || '',
    productId: lead?.productId || '',
    companyName: lead?.companyName || '',
    facebookUrl: lead?.facebookUrl || '',
    instagramUrl: lead?.instagramUrl || '',
    zaloUrl: lead?.zaloUrl || '',
    linkedinUrl: lead?.linkedinUrl || '',
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [metadataRows, setMetadataRows] = useState<{ key: string; value: string }[]>(
    lead?.metadata ? Object.entries(lead.metadata).map(([k, v]) => ({ key: k, value: String(v) })) : []
  );
  const [phoneDuplicate, setPhoneDuplicate] = useState<{ name: string; phone: string; diffs?: string[] } | null>(null);

  // Track per-field "touched" để khi detail arrives chỉ sync field user chưa chạm.
  const touchedRef = useRef<Set<string>>(new Set());
  const detailSyncedRef = useRef(false);

  // Sync form khi lead prop có thêm detail fields. Chỉ chạy 1 lần khi detail-like data arrives.
  useEffect(() => {
    if (!lead || detailSyncedRef.current) return;
    const hasDetailFields = FIELDS_NEED_DETAIL.some((k) => !!lead[k as keyof LeadRecord]);
    if (!hasDetailFields) return;
    detailSyncedRef.current = true;
    setForm((prev) => {
      const next = { ...prev };
      for (const key of FIELDS_NEED_DETAIL) {
        if (!touchedRef.current.has(key)) {
          next[key] = (lead[key as keyof LeadRecord] as string) || prev[key];
        }
      }
      return next;
    });
    if (lead.metadata && metadataRows.length === 0) {
      setMetadataRows(Object.entries(lead.metadata).map(([k, v]) => ({ key: k, value: String(v) })));
    }
    // metadataRows.length intentionally not tracked - sync only on lead change
  }, [lead]);

  // Auto-fill from existing customer when phone matches (only on CREATE mode)
  useEffect(() => {
    if (isEdit || form.phone.length < 10) { setPhoneDuplicate(null); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ data: { name: string; phone: string; email?: string }[] }>(`/customers/search?phone=${form.phone}`);
        const match = res.data?.[0];
        if (match) {
          setForm(prev => ({
            ...prev,
            name: prev.name || match.name || '',
            email: prev.email || match.email || '',
          }));
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
  }, [form.phone, isEdit, form.name, form.email]);

  function update(key: keyof typeof form, value: string) {
    touchedRef.current.add(key);
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
    const body: Record<string, unknown> = {
      phone: form.phone,
      name: form.name,
    };
    if (form.email) body.email = form.email;
    if (form.sourceId) body.sourceId = form.sourceId;
    if (form.productId) body.productId = form.productId;
    if (form.companyName) body.companyName = form.companyName;
    if (form.facebookUrl) body.facebookUrl = form.facebookUrl;
    if (form.instagramUrl) body.instagramUrl = form.instagramUrl;
    if (form.zaloUrl) body.zaloUrl = form.zaloUrl;
    if (form.linkedinUrl) body.linkedinUrl = form.linkedinUrl;
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

  // ── Sections (re-usable JSX between flat and accordion modes) ───────────

  const basicInfoSection = (
    <div className="space-y-4">
      <FormField label="Số điện thoại" required error={fieldErrors.phone}>
        <Input value={form.phone} onChange={e => update('phone', e.target.value)} placeholder="0912345678" readOnly={!canEditPhone} className={!canEditPhone ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''} />
        {!canEditPhone && <p className="text-xs text-slate-400 mt-0.5">Chỉ quản lý mới được sửa SĐT</p>}
        {phoneDuplicate && (
          <div className="mt-1 rounded-md bg-sky-50 border border-sky-200 px-3 py-2 text-xs text-sky-700">
            Khách hàng đã có: <span className="font-semibold">{phoneDuplicate.name}</span> - dữ liệu đã tự điền
            {phoneDuplicate.diffs && phoneDuplicate.diffs.length > 0 && (
              <div className="mt-1 text-red-600 font-medium">⚠ Thông tin khác biệt: {phoneDuplicate.diffs.join(', ')}</div>
            )}
          </div>
        )}
      </FormField>

      <FormField label="Họ tên" error={fieldErrors.name}>
        <Input
          value={form.name}
          onChange={e => update('name', e.target.value)}
          placeholder="Nguyễn Văn A"
          readOnly={!canEditNameSource}
          className={!canEditNameSource ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}
        />
        {!canEditNameSource && <p className="text-xs text-slate-400 mt-0.5">Chỉ quản lý mới được sửa tên</p>}
      </FormField>

      <FormField label="Email" error={fieldErrors.email}>
        <Input type="email" value={form.email} onChange={e => update('email', e.target.value)} placeholder="email@example.com" />
      </FormField>
    </div>
  );

  const sourceProductSection = (
    <div className="space-y-4">
      <FormField label="Nguồn">
        <Select value={form.sourceId} onValueChange={v => update('sourceId', v)} disabled={!canEditNameSource}>
          <SelectTrigger className={!canEditNameSource ? 'bg-slate-50 text-slate-500 cursor-not-allowed' : ''}>
            <SelectValue placeholder={sources.length === 0 ? 'Đang tải...' : 'Chọn nguồn'} />
          </SelectTrigger>
          <SelectContent>
            {sources.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {!canEditNameSource && <p className="text-xs text-slate-400 mt-0.5">Chỉ quản lý mới được đổi nguồn</p>}
      </FormField>

      <FormField label="Sản phẩm">
        <Select value={form.productId} onValueChange={v => update('productId', v)}>
          <SelectTrigger><SelectValue placeholder={products.length === 0 ? 'Đang tải...' : 'Chọn sản phẩm'} /></SelectTrigger>
          <SelectContent>
            {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </FormField>
    </div>
  );

  const socialSection = (
    <div className="space-y-4">
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
        <FormField label="Zalo" error={fieldErrors.zaloUrl}>
          <Input value={form.zaloUrl} onChange={e => update('zaloUrl', e.target.value)} placeholder="https://zalo.me/..." />
        </FormField>
        <FormField label="LinkedIn" error={fieldErrors.linkedinUrl}>
          <Input value={form.linkedinUrl} onChange={e => update('linkedinUrl', e.target.value)} placeholder="https://linkedin.com/in/..." />
        </FormField>
      </div>
    </div>
  );

  const metadataSection = (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
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
      {metadataRows.length === 0 && <p className="text-sm text-slate-400">Chưa có trường nào. Nhấn "Thêm trường" để bắt đầu.</p>}
    </div>
  );

  const secondaryPhonesSection = isEdit && lead?.id
    ? <LeadSecondaryPhonesSection leadId={lead.id} hasCustomer={!!lead.customerId} />
    : null;

  // ── Render ────────────────────────────────────────────────────────────

  if (!accordion) {
    // Page mode: flat layout (như cũ)
    return (
      <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
        <SectionCard title="Thông tin lead">{basicInfoSection}{sourceProductSection}</SectionCard>
        <SectionCard title="Công ty & Mạng xã hội">{socialSection}</SectionCard>
        {secondaryPhonesSection}
        <SectionCard title="Thông tin thêm">{metadataSection}</SectionCard>
        <div className="flex gap-3">
          <Button type="submit" disabled={isLoading}>
            {isLoading ? 'Đang lưu...' : (isEdit ? 'Cập nhật' : 'Tạo lead')}
          </Button>
          {mode === 'page' && <Button type="button" variant="outline" onClick={() => router.back()}>Hủy</Button>}
        </div>
      </form>
    );
  }

  // Drawer mode: accordion. Section "Liên hệ" mở sẵn; các section khác lazy.
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <CollapsibleSection title="Thông tin liên hệ" defaultOpen>
        {basicInfoSection}
      </CollapsibleSection>

      <CollapsibleSection
        title="Nguồn & Sản phẩm"
        onOpen={onRequestDetail}
        loading={loadingDetail}
      >
        {sourceProductSection}
      </CollapsibleSection>

      <CollapsibleSection
        title="Công ty & Mạng xã hội"
        onOpen={onRequestDetail}
        loading={loadingDetail}
      >
        {socialSection}
      </CollapsibleSection>

      {secondaryPhonesSection && (
        <CollapsibleSection title="Số điện thoại phụ">
          {secondaryPhonesSection}
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title="Thông tin thêm"
        onOpen={onRequestDetail}
        loading={loadingDetail}
      >
        {metadataSection}
      </CollapsibleSection>

      <div className="sticky bottom-0 bg-white pt-3 pb-1 flex gap-3 border-t border-slate-100">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Đang lưu...' : 'Cập nhật'}
        </Button>
      </div>
    </form>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {children}
    </div>
  );
}

/**
 * Collapsible section dùng HTML `<details>` native (zero-dep, accessible).
 * - `onOpen` được gọi 1 lần duy nhất khi section chuyển từ closed -> open (idempotent ở caller).
 * - `loading` toggle spinner cạnh title - dùng khi parent đang fetch dữ liệu cho section.
 */
function CollapsibleSection({
  title, children, defaultOpen, onOpen, loading,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  onOpen?: () => void;
  loading?: boolean;
}) {
  const firedRef = useRef(false);
  return (
    <details
      className="group rounded-xl border border-slate-200 bg-white open:shadow-sm"
      open={defaultOpen}
      onToggle={(e) => {
        const open = (e.currentTarget as HTMLDetailsElement).open;
        if (open && !firedRef.current) {
          firedRef.current = true;
          onOpen?.();
        }
      }}
    >
      <summary className="flex items-center justify-between cursor-pointer select-none px-5 py-3 list-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-900">{title}</span>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform group-open:rotate-180')} />
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}
