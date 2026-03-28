import { serverFetch } from '@/lib/auth';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDate, formatDateTime } from '@/lib/utils';
import { notFound } from 'next/navigation';

/** Lead detail page: info + timeline + labels. */
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let lead: any;

  try {
    const result = await serverFetch<{ data: any }>(`/leads/${id}`);
    lead = result.data;
  } catch {
    notFound();
  }

  // Fetch timeline
  let activities: any[] = [];
  try {
    const result = await serverFetch<{ data: any[] }>(`/leads/${id}/activities`);
    activities = result.data;
  } catch { /* empty */ }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lead.name}</h1>
          <p className="text-gray-500">{lead.phone}</p>
        </div>
        <StatusBadge status={lead.status} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Info panel */}
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 font-semibold text-gray-900">Thông tin</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Email</dt>
                <dd className="text-gray-700">{lead.email || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Nguồn</dt>
                <dd className="text-gray-700">{lead.source?.name || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Sản phẩm</dt>
                <dd className="text-gray-700">{lead.product?.name || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Nhân viên</dt>
                <dd className="text-gray-700">{lead.assignedUser?.name || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Phòng ban</dt>
                <dd className="text-gray-700">{lead.department?.name || '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Ngày tạo</dt>
                <dd className="text-gray-700">{formatDate(lead.createdAt)}</dd>
              </div>
            </dl>
          </div>

          {/* Labels */}
          {lead.labels?.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="mb-3 font-semibold text-gray-900">Nhãn</h3>
              <div className="flex flex-wrap gap-1.5">
                {lead.labels.map((ll: any) => (
                  <span key={ll.label.id} className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: ll.label.color }}>
                    {ll.label.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-4 font-semibold text-gray-900">Lịch sử hoạt động</h3>
            {activities.length === 0 ? (
              <p className="text-sm text-gray-400">Chưa có hoạt động nào</p>
            ) : (
              <div className="space-y-3">
                {activities.map((a: any) => (
                  <div key={a.id} className="flex gap-3 border-b border-gray-100 pb-3 last:border-0">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">{a.user?.name}</span>
                        <span className="text-xs text-gray-400">{a.type}</span>
                      </div>
                      {a.content && <p className="mt-0.5 text-sm text-gray-600">{a.content}</p>}
                    </div>
                    <span className="whitespace-nowrap text-xs text-gray-400">{formatDateTime(a.createdAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
