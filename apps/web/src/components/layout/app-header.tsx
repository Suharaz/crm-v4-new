'use client';

import { useAuth } from '@/providers/auth-provider';
import { LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AppHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-6">
      <div />

      {/* User menu */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600">
            <User size={16} />
          </div>
          <div className="hidden sm:block">
            <div className="font-medium text-gray-700">{user?.name}</div>
            <div className="text-xs text-gray-400">{user?.role === 'SUPER_ADMIN' ? 'Quản trị viên' : user?.role === 'MANAGER' ? 'Quản lý' : 'Nhân viên'}</div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={logout} title="Đăng xuất">
          <LogOut size={18} />
        </Button>
      </div>
    </header>
  );
}
