import { serverFetch } from '@/lib/auth';
import { StatusBadge } from '@/components/shared/status-badge';
import { ActivityTimelineWithFilterTabs } from '@/components/shared/activity-timeline-with-filter-tabs';
import { LeadActions } from '@/components/leads/lead-actions';
import { CreateOrderDialog } from '@/components/orders/create-order-dialog';
import { formatDate } from '@/lib/utils';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';

/** Lead detail page: info + actions + timeline + labels. */
export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let lead: any;

  try {
    const result = await serverFetch<{ data: any }>(`/leads/${id}`);
    lead = result.data;
  } catch {
    notFound();
  }

  // Fetch supporting data in parallel
  let activities: any[] = [];
  let users: any[] = [];
  let departments: any[] = [];
  let labels: any[] = [];
  let products: any[] = [];

  try {
    [activities, users, departments, labels, products] = await Promise.all([
      serverFetch<{ data: any[] }>(`/leads/${id}/activities`).then(r => r.data).catch(() => []),
      serverFetch<{ data: any[] }>('/users').then(r => r.data).catch(() => []),
      serverFetch<{ data: any[] }>('/departments').then(r => r.data).catch(() => []),
      serverFetch<{ data: any[] }>('/labels').then(r => r.data).catch(() => []),
      serverFetch<{ data: any[] }>('/products').then(r => r.data).catch(() => []),
    ]);
  } catch { /* partial ok */ }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{lead.name}</h1>
          <p className="text-gray-500">{lead.phone}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={lead.status} />
          <Link href={`/leads/${id}/edit`}>
            <Button variant="outline" size="sm"><Pencil className="h-4 w-4 mr-1" />Sửa</Button>
          </Link>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <LeadActions lead={lead} users={users} departments={departments} labels={labels} />
        {lead.customerId && (
          <CreateOrderDialog customerId={lead.customerId} leadId={lead.id} products={products} />
        )}
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

        {/* Timeline with filter tabs */}
        <div className="lg:col-span-2">
          <ActivityTimelineWithFilterTabs activities={activities} />
        </div>
      </div>
    </div>
  );
}
