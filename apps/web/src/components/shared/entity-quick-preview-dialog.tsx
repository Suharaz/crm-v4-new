'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent } from '@/components/ui/dialog';
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

/** Quick preview dialog for lead/customer — shows key info without page navigation. */
export function EntityQuickPreviewDialog({ open, onOpenChange, entityType, entityId }: PreviewDialogProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !entityId) return;
    setLoading(true);
    setData(null);
    const endpoint = entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`;
    api.get<{ data: any }>(endpoint)
      .then(res => setData(res.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, entityId, entityType]);

  const detailUrl = entityType === 'lead' ? `/leads/${entityId}` : `/customers/${entityId}`;
  const labels = data?.labels || data?.leadLabels || data?.customerLabels || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto p-0">
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

              {/* Recent activities preview */}
              {entityType === 'lead' && data.activities && data.activities.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Hoạt động gần đây</span>
                  <div className="mt-1 space-y-1.5">
                    {data.activities.slice(0, 3).map((a: any) => (
                      <div key={a.id} className="text-xs text-gray-600 bg-gray-50 rounded-md px-2.5 py-1.5">
                        <span className="font-medium">{a.user?.name || '—'}</span>
                        {' — '}
                        {a.content?.substring(0, 80)}{a.content?.length > 80 ? '...' : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes for customer */}
              {entityType === 'customer' && data.notes && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase">Ghi chú</span>
                  <p className="mt-1 text-sm text-gray-600">{data.notes}</p>
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
