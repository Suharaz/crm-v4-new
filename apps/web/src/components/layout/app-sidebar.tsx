'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, UserCheck, ShoppingCart, Package,
  Phone, Settings, Upload, Waves, ChevronLeft, ChevronRight, ChevronDown,
  UserCog, CheckSquare, Zap, Inbox, List,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useState } from 'react';

interface NavChild {
  label: string;
  href: string;
  icon: React.ElementType;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
  children?: NavChild[];
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Trang chủ', href: '/', icon: LayoutDashboard },
  {
    label: 'Leads', href: '/leads', icon: Users,
    children: [
      { label: 'Chờ phân phối', href: '/leads/pool/new', icon: Inbox },
      { label: 'Danh sách', href: '/leads', icon: List },
      { label: 'Kho thả nổi', href: '/floating', icon: Waves },
    ],
  },
  { label: 'Khách hàng', href: '/customers', icon: UserCheck },
  { label: 'Đơn hàng', href: '/orders', icon: ShoppingCart },
  { label: 'Sản phẩm', href: '/products', icon: Package },
  { label: 'Cuộc gọi', href: '/call-logs', icon: Phone },
  { label: 'Công việc', href: '/tasks', icon: CheckSquare },
  { label: 'Nhập dữ liệu', href: '/import', icon: Upload, roles: ['SUPER_ADMIN', 'MANAGER'] },
  { label: 'Quản lý NV', href: '/users', icon: UserCog, roles: ['SUPER_ADMIN'] },
  { label: 'Phân phối AI', href: '/settings/distribution', icon: Zap, roles: ['SUPER_ADMIN', 'MANAGER'] },
  { label: 'Cài đặt', href: '/settings', icon: Settings, roles: ['SUPER_ADMIN', 'MANAGER'] },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // Auto-expand Leads group if current path is a child route
  const leadsChildPaths = ['/leads', '/floating', '/leads/pool'];
  const isLeadsActive = leadsChildPaths.some(p => pathname.startsWith(p));
  const [leadsOpen, setLeadsOpen] = useState(isLeadsActive);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.roles || item.roles.length === 0) return true;
    return user && item.roles.includes(user.role);
  });

  function renderNavLink(item: { label: string; href: string; icon: React.ElementType }, indent = false) {
    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href) && item.href !== '/leads');
    // Special case: /leads exact match only (not /leads/pool/new)
    const isExactLeads = item.href === '/leads' && pathname === '/leads';
    const active = item.href === '/leads' ? isExactLeads : isActive;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          active
            ? 'bg-sky-50 text-sky-600'
            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
          collapsed && 'justify-center px-2',
          indent && !collapsed && 'pl-10',
        )}
        title={collapsed ? item.label : undefined}
      >
        <item.icon size={indent ? 16 : 20} />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );
  }

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
          // Expandable group (Leads)
          if (item.children && !collapsed) {
            return (
              <div key={item.href}>
                <button
                  onClick={() => setLeadsOpen(!leadsOpen)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isLeadsActive
                      ? 'text-sky-600'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  <item.icon size={20} />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown size={16} className={cn('transition-transform', leadsOpen && 'rotate-180')} />
                </button>
                {leadsOpen && (
                  <div className="mt-0.5 space-y-0.5">
                    {item.children.map(child => renderNavLink(child, true))}
                  </div>
                )}
              </div>
            );
          }

          // Collapsed mode with children — show just icon
          if (item.children && collapsed) {
            return renderNavLink(item);
          }

          // Regular nav item
          return renderNavLink(item);
        })}
      </nav>
    </aside>
  );
}
