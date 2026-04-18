'use client';

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { BulkDeleteBar } from '@/components/shared/bulk-delete-bar';
import { useBulkSelection } from '@/hooks/use-bulk-selection';
import { useFormAction } from '@/hooks/use-form-action';
import { Pencil, UserX } from 'lucide-react';
import type { UserRecord } from '@/types/entities';
import { cn } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'Super Admin',
  MANAGER: 'Quản lý',
  USER: 'Nhân viên',
};

interface UserTableProps {
  users: UserRecord[];
  /** SA-only bulk delete toggle. */
  enableBulkDelete?: boolean;
  /** Current user id — skip checkbox cho chính mình (không tự deactivate). */
  currentUserId?: string;
}

export function UserTable({ users, enableBulkDelete = false, currentUserId }: UserTableProps) {
  const { execute, isLoading } = useFormAction({ successMessage: 'Đã vô hiệu hóa nhân viên' });
  // Chỉ chọn được các user ACTIVE và không phải chính mình
  const selectableUsers = users.filter((u) => u.status === 'ACTIVE' && String(u.id) !== currentUserId);
  const sel = useBulkSelection(selectableUsers.map((u) => ({ id: String(u.id) })));

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {enableBulkDelete && (
                <th className="w-10 px-3 py-3">
                  <input
                    type="checkbox"
                    aria-label="Chọn tất cả"
                    checked={sel.allSelected}
                    ref={(el) => { if (el) el.indeterminate = sel.someSelected; }}
                    onChange={sel.toggleAll}
                    className="h-4 w-4 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left font-medium text-slate-500">Họ tên</th>
              <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-slate-500">Email</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Vai trò</th>
              <th className="hidden md:table-cell px-4 py-3 text-left font-medium text-slate-500">Phòng ban</th>
              <th className="hidden lg:table-cell px-4 py-3 text-left font-medium text-slate-500">Cấp bậc</th>
              <th className="px-4 py-3 text-left font-medium text-slate-500">Trạng thái</th>
              <th className="px-4 py-3 text-right font-medium text-slate-500">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr><td colSpan={enableBulkDelete ? 8 : 7} className="px-4 py-8 text-center text-slate-400">Không có nhân viên nào</td></tr>
            ) : users.map((u) => {
              const idStr = String(u.id);
              const isSelectable = u.status === 'ACTIVE' && idStr !== currentUserId;
              const isSelected = sel.isSelected(idStr);
              return (
                <tr key={u.id} className={cn('border-b border-slate-50 hover:bg-slate-50', isSelected && 'bg-sky-50')}>
                  {enableBulkDelete && (
                    <td className="w-10 px-3 py-3">
                      {isSelectable ? (
                        <input
                          type="checkbox"
                          aria-label={`Chọn ${u.name}`}
                          checked={isSelected}
                          onChange={() => sel.toggleOne(idStr)}
                          className="h-4 w-4 cursor-pointer rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                        />
                      ) : null}
                    </td>
                  )}
                  <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                  <td className="hidden md:table-cell px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={u.role === 'SUPER_ADMIN' ? 'destructive' : u.role === 'MANAGER' ? 'default' : 'secondary'}>
                      {ROLE_LABELS[u.role] || u.role}
                    </Badge>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-slate-600">{u.department?.name || '—'}</td>
                  <td className="hidden lg:table-cell px-4 py-3 text-slate-600">{u.employeeLevel?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={u.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {u.status === 'ACTIVE' ? 'Hoạt động' : 'Vô hiệu hóa'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Link href={`/users/${u.id}/edit`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Pencil className="h-3.5 w-3.5 text-slate-400" />
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
              );
            })}
          </tbody>
        </table>
      </div>

      {enableBulkDelete && (
        <BulkDeleteBar
          count={sel.count}
          ids={sel.selectedIds}
          endpoint="/users/bulk-delete"
          entityLabel="người dùng"
          hint="Thao tác này sẽ vô hiệu hóa các nhân viên đã chọn. Leads/customers sẽ được chuyển về kho phòng ban."
          onClear={sel.clear}
        />
      )}
    </>
  );
}
