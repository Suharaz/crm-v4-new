'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { LeadForm } from '@/components/leads/lead-form';
import { api } from '@/lib/api-client';
import { getLeadSources, getProducts } from '@/lib/api/lead-form-bootstrap-cache';
import { invalidatePreviewCache } from '@/components/shared/entity-quick-preview-dialog';
import type { LeadRecord, NamedEntity } from '@/types/entities';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
}

interface BootstrapData {
  lead: LeadRecord | null;
  sources: NamedEntity[];
  products: NamedEntity[];
}

// Drawer chứa LeadForm đầy đủ. Lazy-fetch lead + sources + products khi open=true.
// onSuccess: đóng Sheet, invalidate preview cache, refresh table qua router.refresh.
export function LeadEditDrawer({ open, onOpenChange, leadId }: Props) {
  const router = useRouter();
  const [boot, setBoot] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !leadId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Lead detail: always fetch (entity-specific). Sources/products: dùng module cache
    // - request 1 lần per app lifetime, thay vì mỗi lần mở drawer.
    Promise.all([
      api.get<{ data: LeadRecord }>(`/leads/${leadId}`),
      getLeadSources().catch(() => [] as NamedEntity[]),
      getProducts().catch(() => [] as NamedEntity[]),
    ])
      .then(([leadRes, sources, products]) => {
        if (cancelled) return;
        setBoot({ lead: leadRes.data, sources, products });
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, leadId]);

  function handleSuccess() {
    invalidatePreviewCache('lead', leadId);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto p-0">
        <div className="p-6">
          <SheetHeader>
            <SheetTitle>Chỉnh sửa lead</SheetTitle>
            <SheetDescription>Cập nhật thông tin lead. Đóng để hủy thay đổi.</SheetDescription>
          </SheetHeader>

          {loading && (
            <div className="flex items-center justify-center py-10 text-slate-400">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Đang tải...</span>
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>
          )}

          {!loading && boot?.lead && (
            <LeadForm
              lead={boot.lead}
              sources={boot.sources}
              products={boot.products}
              mode="drawer"
              onSuccess={handleSuccess}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
