import { serverFetch } from '@/lib/auth';
import { StatusBadge } from '@/components/shared/status-badge';
import { ActivityTimelineWithFilterTabs } from '@/components/shared/activity-timeline-with-filter-tabs';
import { CustomerActions } from '@/components/customers/customer-actions';
import { CreateOrderDialog } from '@/components/orders/create-order-dialog';
import { MetadataKeyValueEditor } from '@/components/shared/metadata-key-value-editor';
import { formatDate, formatVND } from '@/lib/utils';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';

/** Customer detail: info + actions + leads + orders + timeline. */
export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let customer: any;

  try {
    const result = await serverFetch<{ data: any }>(`/customers/${id}`);
    customer = result.data;
  } catch {
    notFound();
  }

  let activities: any[] = [];
  let departments: any[] = [];
  let labels: any[] = [];
  let products: any[] = [];
  let paymentTypes: any[] = [];

  try {
    [activities, departments, labels, products, paymentTypes] = await Promise.all([
      serverFetch<{ data: any[] }>(`/customers/${id}/activities`).then(r => r.data).catch(() => []),
      serverFetch<{ data: any[] }>('/departments').then(r => r.data).catch(() => []),
      serverFetch<{ data: any[] }>('/labels').then(r => r.data).catch(() => []),
      serverFetch<{ data: any[] }>('/products').then(r => r.data).catch(() => []),
      serverFetch<{ data: any[] }>('/payment-types').then(r => r.data).catch(() => []),
    ]);
  } catch { /* partial ok */ }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
          <p className="text-gray-500">{customer.phone}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={customer.status} />
          <Link href={`/customers/${id}/edit`}>
            <Button variant="outline" size="sm"><Pencil className="h-4 w-4 mr-1" />Sửa</Button>
          </Link>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <CustomerActions customer={customer} departments={departments} labels={labels} />
        <CreateOrderDialog customerId={customer.id} products={products} paymentTypes={paymentTypes} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Info */}
        <div className="space-y-4 lg:col-span-1">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 font-semibold text-gray-900">Thông tin</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Email</dt><dd className="text-gray-700">{customer.email || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Nhân viên</dt><dd className="text-gray-700">{customer.assignedUser?.name || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Phòng ban</dt><dd className="text-gray-700">{customer.assignedDepartment?.name || '—'}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Ngày tạo</dt><dd className="text-gray-700">{formatDate(customer.createdAt)}</dd></div>
              {customer.companyName && (
                <div className="flex justify-between"><dt className="text-gray-500">Công ty</dt><dd className="text-gray-700">{customer.companyName}</dd></div>
              )}
            </dl>
          </div>

          {/* Description */}
          {(customer.shortDescription || customer.description) && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="mb-3 font-semibold text-gray-900">Mô tả</h3>
              {customer.shortDescription && (
                <p className="text-sm text-gray-700 font-medium">{customer.shortDescription}</p>
              )}
              {customer.description && (
                <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{customer.description}</p>
              )}
            </div>
          )}

          {/* Social links */}
          {(customer.facebookUrl || customer.instagramUrl || customer.zaloUrl || customer.linkedinUrl) && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="mb-3 font-semibold text-gray-900">Mạng xã hội</h3>
              <dl className="space-y-2 text-sm">
                {customer.facebookUrl && (
                  <div className="flex justify-between"><dt className="text-gray-500">Facebook</dt><dd><a href={customer.facebookUrl} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">Xem</a></dd></div>
                )}
                {customer.instagramUrl && (
                  <div className="flex justify-between"><dt className="text-gray-500">Instagram</dt><dd><a href={customer.instagramUrl} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">Xem</a></dd></div>
                )}
                {customer.zaloUrl && (
                  <div className="flex justify-between"><dt className="text-gray-500">Zalo</dt><dd><a href={customer.zaloUrl} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">Xem</a></dd></div>
                )}
                {customer.linkedinUrl && (
                  <div className="flex justify-between"><dt className="text-gray-500">LinkedIn</dt><dd><a href={customer.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-sky-600 hover:underline">Xem</a></dd></div>
                )}
              </dl>
            </div>
          )}

          {/* Labels */}
          {customer.labels?.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="mb-3 font-semibold text-gray-900">Nhãn</h3>
              <div className="flex flex-wrap gap-1.5">
                {customer.labels.map((cl: any) => (
                  <span key={cl.label.id} className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: cl.label.color }}>
                    {cl.label.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Leads */}
          {customer.leads?.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="mb-3 font-semibold text-gray-900">Leads ({customer.leads.length})</h3>
              <div className="space-y-2">
                {customer.leads.map((l: any) => (
                  <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center justify-between rounded-lg p-2 hover:bg-gray-50">
                    <StatusBadge status={l.status} />
                    <span className="text-xs text-gray-400">{formatDate(l.createdAt)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <MetadataKeyValueEditor entityType="customers" entityId={id} metadata={customer.metadata} />
        </div>

        {/* Orders + Timeline */}
        <div className="space-y-6 lg:col-span-2">
          {customer.orders?.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="mb-3 font-semibold text-gray-900">Đơn hàng ({customer.orders.length})</h3>
              <div className="space-y-2">
                {customer.orders.map((o: any) => (
                  <Link key={o.id} href={`/orders/${o.id}`} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:bg-gray-50">
                    <div>
                      <StatusBadge status={o.status} />
                      <span className="ml-2 text-sm text-gray-600">{formatVND(Number(o.totalAmount))}</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(o.createdAt)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          <ActivityTimelineWithFilterTabs activities={activities} />
        </div>
      </div>
    </div>
  );
}
