import { serverFetch } from '@/lib/auth';
import type { UserRecord, ApiListResponse } from '@/types/entities';
import { UserTable } from '@/components/users/user-table';
import { PaginationControls } from '@/components/shared/pagination-controls';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

/** Users management page — SUPER_ADMIN only. */
export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const params = await searchParams;
  const qp = new URLSearchParams(params);
  qp.delete('cursor');
  if (!qp.has('page')) qp.set('page', '1');
  const query = qp.toString();

  let users: UserRecord[] = [];
  let meta: ApiListResponse<UserRecord>['meta'] = {};
  try {
    const result = await serverFetch<ApiListResponse<UserRecord>>(`/users?${query}`);
    users = result.data;
    meta = result.meta;
  } catch { /* empty */ }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý nhân viên</h1>
          <p className="text-sm text-gray-500">Tạo, sửa, phân quyền nhân viên</p>
        </div>
        <Link href="/users/new">
          <Button>
            <Plus className="h-4 w-4 mr-1" />
            Tạo nhân viên
          </Button>
        </Link>
      </div>
      <div className="mt-4">
        <UserTable users={users} />
      </div>
      <PaginationControls total={meta?.total} page={meta?.page} limit={meta?.limit} totalPages={meta?.totalPages} />
    </div>
  );
}
