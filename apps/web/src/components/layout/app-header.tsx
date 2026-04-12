'use client';

import { useAuth } from '@/providers/auth-provider';
import { LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchBar } from '@/components/layout/search-bar';
import { NotificationBell } from '@/components/layout/notification-bell';

export function AppHeader() {
  const { user, logout } = useAuth();

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200/80 bg-white px-6">
      <SearchBar />

      {/* User menu */}
      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="flex items-center gap-2 text-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-white shadow-[0_2px_8px_-2px_rgba(14,165,233,0.4)]">
            <User size={16} />
          </div>
          <div className="hidden sm:block">
            <div className="font-semibold text-slate-700">{user?.name}</div>
            <div className="text-xs text-slate-400">{user?.role === 'SUPER_ADMIN' ? 'Quản trị viên' : user?.role === 'MANAGER' ? 'Quản lý' : 'Nhân viên'}</div>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={logout} title="Đăng xuất">
          <LogOut size={18} />
        </Button>
      </div>
    </header>
  );
}
