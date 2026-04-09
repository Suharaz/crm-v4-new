import { serverFetch } from '@/lib/auth';
import { LeadForm } from '@/components/leads/lead-form';
import { BackButton } from '@/components/shared/back-button';
import { notFound } from 'next/navigation';

/** Edit lead page. */
export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let lead: any;
  let sources: any[] = [];
  let products: any[] = [];

  try {
    [lead, sources, products] = await Promise.all([
      serverFetch<{ data: any }>(`/leads/${id}`).then(r => r.data),
      serverFetch<{ data: any[] }>('/lead-sources').then(r => r.data),
      serverFetch<{ data: any[] }>('/products').then(r => r.data),
    ]);
  } catch {
    notFound();
  }

  return (
    <div>
      <BackButton />
      <h1 className="text-2xl font-bold text-gray-900 mb-6 mt-2">Sửa lead: {lead.name}</h1>
      <LeadForm lead={lead} sources={sources} products={products} />
    </div>
  );
}
