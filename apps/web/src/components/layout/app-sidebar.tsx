'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, UserCheck, ShoppingCart, Package,
  Phone, Settings, Upload, Waves, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useState } from 'react';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: string[]; // visible only to these roles (empty = all)
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Trang chủ', href: '/', icon: LayoutDashboard },
  { label: 'Leads', href: '/leads', icon: Users },
  { label: 'Kho thả nổi', href: '/floating', icon: Waves },
  { label: 'Khách hàng', href: '/customers', icon: UserCheck },
  { label: 'Đơn hàng', href: '/orders', icon: ShoppingCart },
  { label: 'Sản phẩm', href: '/products', icon: Package },
  { label: 'Cuộc gọi', href: '/call-logs', icon: Phone },
  { label: 'Nhập dữ liệu', href: '/import', icon: Upload, roles: ['SUPER_ADMIN', 'MANAGER'] },
  { label: 'Cài đặt', href: '/settings', icon: Settings, roles: ['SUPER_ADMIN', 'MANAGER'] },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.roles || item.roles.length === 0) return true;
    return user && item.roles.includes(user.role);
  });

  return (
    <aside className={cn(
      'flex flex-col border-r border-gray-200 bg-white transition-all duration-200',
      collapsed ? 'w-16' : 'w-60',
    )}>
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4">
        {!collapsed && <span className="text-lg font-bold text-sky-500">CRM V4</span>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sky-50 text-sky-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                collapsed && 'justify-center px-2',
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={20} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
