'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useFormAction } from '@/hooks/use-form-action';
import { Pencil, UserX } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  MANAGER: 'Quản lý',
  USER: 'Nhân viên',
};

interface UserTableProps {
  users: any[];
}

export function UserTable({ users }: UserTableProps) {
  const { execute, isLoading } = useFormAction({ successMessage: 'Đã vô hiệu hóa nhân viên' });

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-500">Họ tên</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Email</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Vai trò</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Phòng ban</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Cấp bậc</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Trạng thái</th>
            <th className="px-4 py-3 text-right font-medium text-gray-500">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {users.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Không có nhân viên nào</td></tr>
          ) : users.map((u: any) => (
            <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
              <td className="px-4 py-3 text-gray-600">{u.email}</td>
              <td className="px-4 py-3">
                <Badge variant={u.role === 'SUPER_ADMIN' ? 'destructive' : u.role === 'MANAGER' ? 'default' : 'secondary'}>
                  {ROLE_LABELS[u.role] || u.role}
                </Badge>
              </td>
              <td className="px-4 py-3 text-gray-600">{u.department?.name || '—'}</td>
              <td className="px-4 py-3 text-gray-600">{u.employeeLevel?.name || '—'}</td>
              <td className="px-4 py-3">
                <Badge variant={u.status === 'ACTIVE' ? 'success' : 'secondary'}>
                  {u.status === 'ACTIVE' ? 'Hoạt động' : 'Vô hiệu hóa'}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <div className="flex justify-end gap-1">
                  <Link href={`/users/${u.id}/edit`}>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Pencil className="h-3.5 w-3.5 text-gray-400" />
                    </Button>
                  </Link>
                  {u.status === 'ACTIVE' && (
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <UserX className="h-3.5 w-3.5 text-red-400" />
                        </Button>
                      }
                      title="Vô hiệu hóa nhân viên"
                      description={`Bạn có chắc muốn vô hiệu hóa "${u.name}"? Leads/customers sẽ được chuyển về kho phòng ban.`}
                      confirmLabel="Vô hiệu hóa"
                      onConfirm={() => execute('delete', `/users/${u.id}`)}
                      isLoading={isLoading}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
