import { serverFetch } from '@/lib/auth';
import type { CustomerRecord, NamedEntity, LabelEntity, ProductRecord } from '@/types/entities';
import { StatusBadge } from '@/components/shared/status-badge';
import { CustomerActions } from '@/components/customers/customer-actions';
import { CreateOrderDialog } from '@/components/orders/create-order-dialog';
import { CustomerAnalysisCard } from '@/components/customers/customer-analysis-card';
import { CustomerOrderList } from '@/components/customers/customer-order-list';
import { formatDate } from '@/lib/utils';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Pencil } from 'lucide-react';
import { BackButton } from '@/components/shared/back-button';

/* Social icon SVGs — Zalo has no lucide icon so we use inline SVG */
function FacebookIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${active ? 'text-blue-600' : 'text-gray-300'}`} fill="currentColor">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

function InstagramIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${active ? 'text-pink-500' : 'text-gray-300'}`} fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function ZaloIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 48 48" className={`h-5 w-5 ${active ? 'text-blue-500' : 'text-gray-300'}`} fill="currentColor">
      <path d="M24 4C12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20S35.046 4 24 4zm-3.2 28.8h-2.4l6.4-9.6h-4.8v-2.4h7.2v2.4l-6.4 9.6zm10.4 0h-2.4v-12h2.4v12zm-5.6-14.4c-.88 0-1.6-.72-1.6-1.6s.72-1.6 1.6-1.6 1.6.72 1.6 1.6-.72 1.6-1.6 1.6z" />
    </svg>
  );
}

function LinkedInIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-5 w-5 ${active ? 'text-blue-700' : 'text-gray-300'}`} fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

/** Customer detail: info + actions + leads + orders + timeline. */
export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let customerData: CustomerRecord | undefined;

  try {
    const result = await serverFetch<{ data: CustomerRecord }>(`/customers/${id}`);
    customerData = result.data;
  } catch {
    notFound();
  }

  // notFound() throws, so customerData is always defined here
  const customer = customerData as CustomerRecord;

  let departments: NamedEntity[] = [];
  let labels: LabelEntity[] = [];
  let products: ProductRecord[] = [];
  let paymentTypes: NamedEntity[] = [];

  try {
    [departments, labels, products, paymentTypes] = await Promise.all([
      serverFetch<{ data: NamedEntity[] }>('/departments').then(r => r.data).catch(() => []),
      serverFetch<{ data: LabelEntity[] }>('/labels').then(r => r.data).catch(() => []),
      serverFetch<{ data: ProductRecord[] }>('/products').then(r => r.data).catch(() => []),
      serverFetch<{ data: NamedEntity[] }>('/payment-types').then(r => r.data).catch(() => []),
    ]);
  } catch { /* partial ok */ }

  const socialLinks = [
    { key: 'facebook', url: customer.facebookUrl, Icon: FacebookIcon, label: 'Facebook' },
    { key: 'instagram', url: customer.instagramUrl, Icon: InstagramIcon, label: 'Instagram' },
    { key: 'zalo', url: customer.zaloUrl, Icon: ZaloIcon, label: 'Zalo' },
    { key: 'linkedin', url: customer.linkedinUrl, Icon: LinkedInIcon, label: 'LinkedIn' },
  ];

  return (
    <div className="space-y-6">
      <BackButton />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
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
        {/* Left column: Info + Analysis */}
        <div className="space-y-4 lg:col-span-1">
          {/* Info card with labels + social icons */}
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 font-semibold text-gray-900">Thông tin</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">SĐT</dt><dd className="text-gray-700">{customer.phone}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Email</dt><dd className="text-gray-700">{customer.email || '—'}</dd></div>
              {customer.companyName && (
                <div className="flex justify-between"><dt className="text-gray-500">Công ty</dt><dd className="text-gray-700">{customer.companyName}</dd></div>
              )}
              <div className="flex justify-between"><dt className="text-gray-500">Ngày tạo</dt><dd className="text-gray-700">{formatDate(customer.createdAt)}</dd></div>
            </dl>

            {/* Labels */}
            {(customer.labels?.length ?? 0) > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex flex-wrap gap-1.5">
                  {customer.labels!.map((cl) => (
                    <span key={cl.label.id} className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: cl.label.color }}>
                      {cl.label.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Social icons row */}
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-3">
                {socialLinks.map(({ key, url, Icon, label }) =>
                  url ? (
                    <a key={key} href={url} target="_blank" rel="noopener noreferrer" title={label} className="hover:opacity-80 transition-opacity">
                      <Icon active />
                    </a>
                  ) : (
                    <span key={key} title={`${label} — chưa có`} className="cursor-default">
                      <Icon active={false} />
                    </span>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Customer analysis card */}
          <CustomerAnalysisCard
            customerId={id}
            shortDescription={customer.shortDescription}
            description={customer.description}
            aiRating={customer.aiRating}
          />

          {/* Leads */}
          {(customer.leads?.length ?? 0) > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h3 className="mb-3 font-semibold text-gray-900">Leads ({customer.leads!.length})</h3>
              <div className="space-y-2">
                {customer.leads!.map((l) => (
                  <Link key={l.id} href={`/leads/${l.id}`} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 hover:bg-gray-50">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={l.status} />
                        {l.product && (
                          <span className="text-xs text-gray-600">
                            Sản phẩm: <span className="font-medium text-gray-800">{l.product.name}</span>
                          </span>
                        )}
                      </div>
                      {(l.labels?.length ?? 0) > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {l.labels!.map((ll) => (
                            <span key={ll.label.id} className="rounded-full px-1.5 py-0.5 text-[9px] font-medium text-white" style={{ backgroundColor: ll.label.color }}>
                              {ll.label.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{formatDate(l.createdAt)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Orders + Timeline */}
        <div className="space-y-6 lg:col-span-2">
          {(customer.orders?.length ?? 0) > 0 && (
            <CustomerOrderList orders={customer.orders as unknown as Parameters<typeof CustomerOrderList>[0]['orders']} />
          )}

        </div>
      </div>
    </div>
  );
}
