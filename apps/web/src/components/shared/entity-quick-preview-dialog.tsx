'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { ExternalLink, Phone, Mail, User, Building, Tag, Calendar, Package, Loader2 } from 'lucide-react';

interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: 'lead' | 'customer';
  entityId: string | null;
}

const CACHE_PREFIX = 'crm_preview_';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/** Read from localStorage with TTL check. */
function readCache(key: string) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.ts > CACHE_TTL) { localStorage.removeItem(CACHE_PREFIX + key); return null; }
    return parsed;
  } catch { return null; }
}

/** Write to localStorage with timestamp. */
function writeCache(key: string, data: any, activities: any[]) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ data, activities, ts: Date.now() })); } catch { /* quota */ }
}

/** Invalidate cache for a specific entity. Call after update/edit. */
export function invalidatePreviewCache(entityType: string, entityId: string) {
  try { localStorage.removeItem(CACHE_PREFIX + `${entityType}:${entityId}`); } catch { /* */ }
}

/** Quick preview dialog for lead/customer — shows key info without page navigation. */
export function EntityQuickPreviewDialog({ open, onOpenChange, entityType, entityId }: PreviewDialogProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    if (!open || !entityId) return;

    const cacheKey = `${entityType}:${entityId}`;
    const cached = readCache(cacheKey);

    if (cached) {
      setData(cached.data);
      setActivities(cached.activities);
      setLoading(false);
      return;
    }

    setLoading(true);
    const endpoint = entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`;
    const activitiesEndpoint = `/${entityType === 'lead' ? 'leads' : 'customers'}/${entityId}/activities`;

    Promise.all([
      api.get<{ data: any }>(endpoint),
      api.get<{ data: any[] }>(activitiesEndpoint).catch(() => ({ data: [] })),
    ])
      .then(([entityRes, actRes]) => {
        const d = entityRes.data;
        const a = actRes.data || [];
        setData(d);
        setActivities(a);
        writeCache(cacheKey, d, a);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, entityId, entityType]);

  const detailUrl = entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`;
  const labels = data?.labels || data?.leadLabels || data?.customerLabels || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0">
        <DialogTitle className="sr-only">
          {entityType === 'lead' ? 'Chi tiết Lead' : 'Chi tiết Khách hàng'}
        </DialogTitle>
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
          </div>
        ) : data ? (
          <div>
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-gray-200 bg-white px-5 py-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-gray-900 truncate">{data.name}</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="h-3.5 w-3.5 text-gray-400" />
                    <a href={`tel:${data.phone}`} className="text-sm text-sky-600 hover:underline">{data.phone}</a>
                  </div>
                </div>
                <StatusBadge status={data.status} />
              </div>
            </div>

            {/* Body */}
            <div className="px-5 py-4 space-y-4">
              {/* Info grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {data.email && (
                  <InfoRow icon={Mail} label="Email" value={data.email} />
                )}
                {data.source?.name && (
                  <InfoRow icon={Tag} label="Nguồn" value={data.source.name} />
                )}
                {data.product?.name && (
                  <InfoRow icon={Package} label="Sản phẩm" value={data.product.name} />
                )}
                {data.assignedUser?.name && (
                  <InfoRow icon={User} label="Nhân viên" value={data.assignedUser.name} />
                )}
                {data.department?.name && (
                  <InfoRow icon={Building} label="Phòng ban" value={data.department.name} />
                )}
                <InfoRow icon={Calendar} label="Ngày tạo" value={formatDate(data.createdAt)} />
              </div>

              {/* Labels */}
              {labels.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Nhãn</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {labels.map((ll: any) => {
                      const label = ll.label || ll;
                      return (
                        <span
                          key={label.id}
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: label.color || '#6b7280' }}
                        >
                          {label.name}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes & Activities */}
              {activities.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">
                    Ghi chú & Hoạt động ({activities.length})
                  </span>
                  <div className="mt-1.5 space-y-1.5 max-h-40 overflow-y-auto">
                    {activities.slice(0, 5).map((a: any) => (
                      <div key={a.id} className="text-xs bg-gray-50 rounded-md px-2.5 py-2 border border-gray-100">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="font-medium text-gray-700">{a.user?.name || '—'}</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-400">{a.type === 'NOTE' ? 'Ghi chú' : a.type === 'CALL' ? 'Cuộc gọi' : a.type}</span>
                          <span className="text-gray-300">·</span>
                          <span className="text-gray-400">{formatDate(a.createdAt)}</span>
                        </div>
                        <p className="text-gray-600 whitespace-pre-line">
                          {a.content?.substring(0, 120)}{a.content?.length > 120 ? '...' : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer — Detail button */}
            <div className="sticky bottom-0 border-t border-gray-200 bg-gray-50 px-5 py-3 flex justify-between items-center">
              <span className="text-xs text-gray-400">
                {entityType === 'lead' ? 'Lead' : 'Khách hàng'} #{entityId}
              </span>
              <Link href={detailUrl} onClick={() => onOpenChange(false)}>
                <Button size="sm">
                  <ExternalLink className="h-4 w-4 mr-1" />Xem chi tiết
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="py-16 text-center text-gray-400">Không tìm thấy dữ liệu</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Single info row for the preview grid */
function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-gray-400">{label}</div>
        <div className="text-gray-900 truncate">{value}</div>
      </div>
    </div>
  );
}
