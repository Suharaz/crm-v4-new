import { serverFetch } from '@/lib/auth';
import { CustomerForm } from '@/components/customers/customer-form';
import { notFound } from 'next/navigation';

/** Edit customer page. */
export default async function EditCustomerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let customer: any;
  let departments: any[] = [];
  let users: any[] = [];

  try {
    [customer, departments, users] = await Promise.all([
      serverFetch<{ data: any }>(`/customers/${id}`).then(r => r.data),
      serverFetch<{ data: any[] }>('/departments').then(r => r.data),
      serverFetch<{ data: any[] }>('/users').then(r => r.data),
    ]);
  } catch {
    notFound();
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Sửa khách hàng: {customer.name}</h1>
      <CustomerForm customer={customer} departments={departments} users={users} />
    </div>
  );
}
