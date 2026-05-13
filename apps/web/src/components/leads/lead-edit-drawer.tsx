'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  /**
   * Data lead từ row table (partial). Drawer dùng để render section "Liên hệ"
   * ngay lập tức KHÔNG cần fetch. Khi user expand section khác cần thêm field,
   * mới trigger fetch /leads/:id.
   */
  leadRow?: Partial<LeadRecord>;
}

/**
 * Drawer chỉnh sửa lead. Tối ưu request:
 * - Mở drawer: 0 request (data từ row đủ render section "Liên hệ").
 * - User expand section khác: lazy fetch /leads/:id 1 lần (cache trong state).
 * - Sources/Products: lazy + localStorage cache 1d (fetch khi section "Nguồn & Sản phẩm" mở).
 * - SĐT phụ: lazy fetch khi section đó mở + chỉ khi customerId tồn tại.
 */
export function LeadEditDrawer({ open, onOpenChange, leadId, leadRow }: Props) {
  const router = useRouter();
  const [leadDetail, setLeadDetail] = useState<LeadRecord | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sources, setSources] = useState<NamedEntity[]>([]);
  const [products, setProducts] = useState<NamedEntity[]>([]);
  const [detailRequested, setDetailRequested] = useState(false);

  // Reset state khi drawer đóng -> mở lại với lead khác
  useEffect(() => {
    if (!open) {
      setLeadDetail(null);
      setDetailRequested(false);
      setLoadingDetail(false);
      return;
    }
    // Bootstrap sources/products từ cache (localStorage hit -> đồng bộ, miss -> 1 req nền)
    getLeadSources().then(setSources).catch(() => setSources([]));
    getProducts().then(setProducts).catch(() => setProducts([]));
  }, [open, leadId]);

  const handleRequestDetail = useCallback(async () => {
    if (detailRequested) return;
    setDetailRequested(true);
    setLoadingDetail(true);
    try {
      const res = await api.get<{ data: LeadRecord }>(`/leads/${leadId}`);
      setLeadDetail(res.data);
    } catch {
      setDetailRequested(false); // cho phép retry
    } finally {
      setLoadingDetail(false);
    }
  }, [leadId, detailRequested]);

  function handleSuccess() {
    invalidatePreviewCache('lead', leadId);
    onOpenChange(false);
    router.refresh();
  }

  // Merge: leadRow (table row) làm base, override bởi leadDetail khi đã fetch
  const mergedLead: LeadRecord | undefined = (() => {
    if (leadDetail) return { ...(leadRow as LeadRecord), ...leadDetail };
    if (leadRow) return leadRow as LeadRecord;
    return undefined;
  })();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto p-0">
        <div className="p-6">
          <SheetHeader>
            <SheetTitle>Chỉnh sửa lead</SheetTitle>
            <SheetDescription>Mở từng phần để xem/sửa chi tiết.</SheetDescription>
          </SheetHeader>

          {mergedLead ? (
            <LeadForm
              lead={mergedLead}
              sources={sources}
              products={products}
              mode="drawer"
              onSuccess={handleSuccess}
              onRequestDetail={handleRequestDetail}
              loadingDetail={loadingDetail}
            />
          ) : (
            // Fallback: không có leadRow (caller cũ chưa truyền) -> fetch ngay để render
            <FallbackEager leadId={leadId} onLoaded={(l) => setLeadDetail(l)} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Backward compat: nếu caller không truyền leadRow, fetch eager 1 lần để có data render.
// Khuyến nghị: caller cập nhật để truyền leadRow -> bypass branch này.
function FallbackEager({ leadId, onLoaded }: { leadId: string; onLoaded: (l: LeadRecord) => void }) {
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.get<{ data: LeadRecord }>(`/leads/${leadId}`)
      .then((res) => { if (!cancelled) onLoaded(res.data); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Lỗi tải'); });
    return () => { cancelled = true; };
  }, [leadId, onLoaded]);
  if (error) return <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 mt-4">{error}</div>;
  return <p className="text-sm text-slate-400 mt-4">Đang tải...</p>;
}
