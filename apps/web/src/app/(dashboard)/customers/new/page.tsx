import { serverFetch } from '@/lib/auth';
import { CustomerForm } from '@/components/customers/customer-form';

/** Create new customer page. */
export default async function CreateCustomerPage() {
  let departments: any[] = [];
  let users: any[] = [];

  try {
    [departments, users] = await Promise.all([
      serverFetch<{ data: any[] }>('/departments').then(r => r.data),
      serverFetch<{ data: any[] }>('/users').then(r => r.data),
    ]);
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Tạo khách hàng mới</h1>
      <CustomerForm departments={departments} users={users} />
    </div>
  );
}
