'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, UserCheck, ShoppingCart, Package,
  Phone, Settings, Upload, Waves, ChevronLeft, ChevronRight, ChevronDown,
  UserCog, CheckSquare, Zap, Inbox, RotateCcw, User, Building2, CreditCard,
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
  /** Roles that see the expandable children. Others see flat link. */
  childRoles?: string[];
  /** Role-specific children menus */
  childrenByRole?: Record<string, NavChild[]>;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Trang chủ', href: '/dashboard', icon: LayoutDashboard },
  {
    label: 'Leads', href: '/leads', icon: Users,
    childRoles: ['MANAGER', 'USER'],
    childrenByRole: {
      MANAGER: [
        { label: 'Chờ phân phối', href: '/leads/pool/new', icon: Inbox },
        { label: 'Zoom', href: '/leads/pool/zoom', icon: RotateCcw },
        { label: 'Kho thả nổi', href: '/floating', icon: Waves },
      ],
      USER: [
        { label: 'My Lead', href: '/leads', icon: User },
        { label: 'Kho phân loại', href: '/leads/dept', icon: Building2 },
        { label: 'Thả nổi', href: '/floating', icon: Waves },
      ],
    },
  },
  { label: 'Khách hàng', href: '/customers', icon: UserCheck },
  { label: 'Đơn hàng', href: '/orders', icon: ShoppingCart },
  { label: 'Sản phẩm', href: '/products', icon: Package },
  { label: 'Phân tích cuộc gọi', href: '/call-logs', icon: Phone },
  { label: 'Công việc', href: '/tasks', icon: CheckSquare },
  { label: 'Nhập dữ liệu', href: '/import', icon: Upload, roles: ['SUPER_ADMIN', 'MANAGER'] },
  { label: 'Quản lý NV', href: '/users', icon: UserCog, roles: ['SUPER_ADMIN'] },
  { label: 'Đối soát CK', href: '/payments', icon: CreditCard, roles: ['SUPER_ADMIN', 'MANAGER'] },
  { label: 'Phân phối AI', href: '/settings/distribution', icon: Zap, roles: ['SUPER_ADMIN', 'MANAGER'] },
  { label: 'Cài đặt', href: '/settings', icon: Settings, roles: ['SUPER_ADMIN', 'MANAGER'] },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  // Auto-expand Leads group if current path is a child route
  const leadsChildPaths = ['/leads', '/floating', '/leads/pool', '/leads/dept'];
  const isLeadsActive = leadsChildPaths.some(p => pathname.startsWith(p));
  const [leadsOpen, setLeadsOpen] = useState(isLeadsActive);

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.roles || item.roles.length === 0) return true;
    return user && item.roles.includes(user.role);
  });

  function renderNavLink(item: { label: string; href: string; icon: React.ElementType }, indent = false) {
    const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href) && item.href !== '/leads');
    const isExactLeads = item.href === '/leads' && pathname === '/leads';
    const active = item.href === '/leads' ? isExactLeads : isActive;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
          active
            ? 'bg-indigo-50 text-indigo-600 shadow-[0_2px_8px_-2px_rgba(79,70,229,0.15)]'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          collapsed && 'justify-center px-2',
          indent && !collapsed && 'pl-10',
        )}
        title={collapsed ? item.label : undefined}
      >
        {active && (
          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-indigo-600 to-violet-600" />
        )}
        <item.icon size={indent ? 16 : 20} className={cn(active && 'text-indigo-600')} />
        {!collapsed && <span>{item.label}</span>}
      </Link>
    );
  }

  return (
    <aside className={cn(
      'flex flex-col border-r border-slate-200/80 bg-white transition-all duration-200',
      collapsed ? 'w-16' : 'w-60',
    )}>
      {/* Logo */}
      <div className="flex h-14 items-center justify-between border-b border-slate-200/80 px-4">
        {!collapsed && <span className="text-lg font-extrabold text-gradient">VeloCRM</span>}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-2">
        {visibleItems.map((item) => {
          const role = user?.role || '';
          const roleChildren = item.childrenByRole?.[role];
          const showChildren = roleChildren && item.childRoles?.includes(role);

          // Expandable group (only for matching roles, non-collapsed)
          if (showChildren && !collapsed) {
            return (
              <div key={item.href}>
                <button
                  onClick={() => setLeadsOpen(!leadsOpen)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                    isLeadsActive
                      ? 'text-indigo-600'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <item.icon size={20} />
                  <span className="flex-1 text-left">{item.label}</span>
                  <ChevronDown size={16} className={cn('transition-transform', leadsOpen && 'rotate-180')} />
                </button>
                {leadsOpen && (
                  <div className="mt-0.5 space-y-0.5">
                    {roleChildren.map(child => renderNavLink(child, true))}
                  </div>
                )}
              </div>
            );
          }

          // Regular nav item (flat link)
          return renderNavLink(item);
        })}
      </nav>
    </aside>
  );
}
