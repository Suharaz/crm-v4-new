import { serverFetch } from '@/lib/auth';
import { UserForm } from '@/components/users/user-form';
import { BackButton } from '@/components/shared/back-button';
import { notFound } from 'next/navigation';

/** Edit user page. */
export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let user: any;
  let departments: any[] = [];
  let levels: any[] = [];

  try {
    [user, departments, levels] = await Promise.all([
      serverFetch<{ data: any }>(`/users/${id}`).then(r => r.data),
      serverFetch<{ data: any[] }>('/departments').then(r => r.data),
      serverFetch<{ data: any[] }>('/employee-levels').then(r => r.data),
    ]);
  } catch {
    notFound();
  }

  return (
    <div>
      <BackButton />
      <h1 className="text-2xl font-bold text-gray-900 mb-6 mt-2">Sửa nhân viên: {user.name}</h1>
      <UserForm user={user} departments={departments} levels={levels} />
    </div>
  );
}
