import { serverFetch } from '@/lib/auth';
import { UserForm } from '@/components/users/user-form';
import { BackButton } from '@/components/shared/back-button';
import { notFound } from 'next/navigation';
import type { UserRecord, NamedEntity } from '@/types/entities';

/** Edit user page. */
export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let userData: UserRecord | undefined;
  let departments: NamedEntity[] = [];
  let levels: NamedEntity[] = [];

  try {
    [userData, departments, levels] = await Promise.all([
      serverFetch<{ data: UserRecord }>(`/users/${id}`).then(r => r.data),
      serverFetch<{ data: NamedEntity[] }>('/departments').then(r => r.data),
      serverFetch<{ data: NamedEntity[] }>('/employee-levels').then(r => r.data),
    ]);
  } catch {
    notFound();
  }

  const user = userData as UserRecord;

  return (
    <div>
      <BackButton />
      <h1 className="text-2xl font-bold text-gray-900 mb-6 mt-2">Sửa nhân viên: {user.name}</h1>
      <UserForm user={user} departments={departments} levels={levels} />
    </div>
  );
}
