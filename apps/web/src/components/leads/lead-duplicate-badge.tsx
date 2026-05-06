'use client';

import { useState } from 'react';
import { Users2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/shared/status-badge';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';

interface DuplicateLead {
  id: string;
  name: string;
  phone: string;
  status: string;
  createdAt: string;
  product?: { id: string; name: string } | null;
  source?: { id: string; name: string } | null;
  assignedUser?: { id: string; name: string } | null;
  department?: { id: string; name: string } | null;
}

interface DuplicateHistoryItem {
  id: string;
  entityId: string;
  createdAt: string;
  reason?: string | null;
  fromUser?: { id: string; name: string } | null;
  toUser?: { id: string; name: string } | null;
  fromDepartment?: { id: string; name: string } | null;
  toDepartment?: { id: string; name: string } | null;
  assignedByUser?: { id: string; name: string } | null;
}

interface DuplicateResponse {
  data: { phone: string; leads: DuplicateLead[]; history: DuplicateHistoryItem[] };
}

interface Props {
  /** Số lần SĐT này xuất hiện trong DB. Chỉ render badge khi >= 2. */
  count: number;
  phone: string;
  /** ID lead hiện tại — dùng để skip nó trong danh sách "các lead khác". */
  currentLeadId: string;
}

/**
 * Hiển thị icon "2 người" cạnh lead khi SĐT của lead trùng với ≥ 1 lead khác.
 * Click icon → dialog hiển thị các lead trùng + lịch sử phân phối.
 */
export function LeadDuplicateBadge({ count, phone, currentLeadId }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DuplicateResponse['data'] | null>(null);

  if (count < 2) return null;

  async function handleOpen() {
    setOpen(true);
    if (data) return;
    setLoading(true);
    try {
      const res = await api.get<DuplicateResponse>(
        `/leads/duplicates?phone=${encodeURIComponent(phone)}`,
      );
      setData(res.data);
    } catch {
      setData({ phone, leads: [], history: [] });
    }
    setLoading(false);
  }

  const otherLeads = (data?.leads || []).filter(l => l.id !== currentLeadId);

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title={`Trùng SĐT — đã xuất hiện ${count} lần`}
        className="inline-flex items-center justify-center rounded-full bg-amber-100 p-0.5 text-amber-700 hover:bg-amber-200 transition-colors"
      >
        <Users2 className="h-3.5 w-3.5" />
        <span className="ml-0.5 text-[10px] font-bold leading-none pr-1">{count}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Lead trùng SĐT — {phone}</DialogTitle>
          </DialogHeader>

          {loading && (
            <div className="py-8 text-center text-slate-400 text-sm">Đang tải...</div>
          )}

          {!loading && data && (
            <Tabs defaultValue="leads" className="w-full">
              <TabsList>
                <TabsTrigger value="leads">
                  Các lead ({otherLeads.length})
                </TabsTrigger>
                <TabsTrigger value="history">
                  Lịch sử phân phối ({data.history.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="leads" className="mt-3">
                {otherLeads.length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-400">
                    Không có lead trùng nào khác (có thể đã bị xóa).
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Họ tên</th>
                          <th className="px-3 py-2 font-medium">Sản phẩm</th>
                          <th className="px-3 py-2 font-medium">Trạng thái</th>
                          <th className="px-3 py-2 font-medium">Phân cho</th>
                          <th className="px-3 py-2 font-medium">Phòng ban</th>
                          <th className="px-3 py-2 font-medium">Ngày tạo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {otherLeads.map(l => (
                          <tr key={l.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-medium text-slate-800">{l.name}</td>
                            <td className="px-3 py-2 text-slate-600">{l.product?.name || '—'}</td>
                            <td className="px-3 py-2"><StatusBadge status={l.status} /></td>
                            <td className="px-3 py-2 text-slate-600">{l.assignedUser?.name || '—'}</td>
                            <td className="px-3 py-2 text-slate-600">{l.department?.name || '—'}</td>
                            <td className="px-3 py-2 text-slate-400 whitespace-nowrap">
                              {formatDateTime(l.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="history" className="mt-3">
                {data.history.length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-400">
                    Chưa có lịch sử phân phối.
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-medium">Thời gian</th>
                          <th className="px-3 py-2 font-medium">Từ</th>
                          <th className="px-3 py-2 font-medium">Đến</th>
                          <th className="px-3 py-2 font-medium">Người phân</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.history.map(h => (
                          <tr key={h.id} className="border-t border-slate-100">
                            <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                              {formatDateTime(h.createdAt)}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {h.fromUser?.name || h.fromDepartment?.name || 'Kho mới'}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {h.toUser?.name || h.toDepartment?.name || '—'}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {h.assignedByUser?.name || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
