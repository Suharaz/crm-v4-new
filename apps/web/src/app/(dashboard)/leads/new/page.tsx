import { serverFetch } from '@/lib/auth';
import { LeadForm } from '@/components/leads/lead-form';

/** Create new lead page. */
export default async function CreateLeadPage() {
  let sources: any[] = [];
  let products: any[] = [];

  try {
    [sources, products] = await Promise.all([
      serverFetch<{ data: any[] }>('/lead-sources').then(r => r.data),
      serverFetch<{ data: any[] }>('/products').then(r => r.data),
    ]);
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Tạo lead mới</h1>
      <LeadForm sources={sources} products={products} />
    </div>
  );
}
