'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Users, UserCheck, ShoppingCart, Package,
  Phone, Settings, Upload, Waves, ChevronLeft, ChevronRight, ChevronDown,
  UserCog, CheckSquare, Zap, Inbox, RotateCcw, User, Building2, CreditCard, X,
  BarChart3, DollarSign, UsersRound, ContactRound, Activity, PhoneOutgoing,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { useState, useEffect } from 'react';
import { useMobileSidebar } from '@/components/layout/mobile-sidebar-provider';

interface NavChild {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
  /** Static children (role-filtered via child.roles) */
  children?: NavChild[];
  /** Role-specific children (legacy pattern for Leads) */
  childRoles?: string[];
  childrenByRole?: Record<string, NavChild[]>;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Trang chủ', href: '/dashboard', icon: LayoutDashboard,
    children: [
      { label: 'Tổng quát', href: '/dashboard', icon: BarChart3 },
      { label: 'Doanh thu', href: '/dashboard/revenue', icon: DollarSign },
      { label: 'Nhân viên', href: '/dashboard/employees', icon: UsersRound, roles: ['SUPER_ADMIN', 'MANAGER'] },
      { label: 'Khách hàng', href: '/dashboard/customers', icon: ContactRound },
    ],
  },
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
  { label: 'Phân SĐT', href: '/user-phones', icon: PhoneOutgoing, roles: ['SUPER_ADMIN'] },
  { label: 'Đối soát CK', href: '/payments', icon: CreditCard, roles: ['SUPER_ADMIN', 'MANAGER'] },
  { label: 'Phân phối AI', href: '/settings/distribution', icon: Zap, roles: ['SUPER_ADMIN', 'MANAGER'] },
  { label: 'Cài đặt', href: '/settings', icon: Settings, roles: ['SUPER_ADMIN', 'MANAGER'] },
  { label: 'Trace hệ thống', href: '/trace', icon: Activity, roles: ['SUPER_ADMIN'] },
];

// Paths that belong to collapsible groups
const DASHBOARD_CHILD_PATHS = ['/dashboard', '/dashboard/revenue', '/dashboard/employees', '/dashboard/customers'];
const LEADS_CHILD_PATHS = ['/leads', '/floating', '/leads/pool', '/leads/dept'];

export function AppSidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { open: mobileOpen, close: closeMobile } = useMobileSidebar();
  const [collapsed, setCollapsed] = useState(false);

  const isDashboardActive = DASHBOARD_CHILD_PATHS.some(p => pathname === p || (p !== '/dashboard' && pathname.startsWith(p)));
  const isLeadsActive = LEADS_CHILD_PATHS.some(p => pathname.startsWith(p));

  const [dashboardOpen, setDashboardOpen] = useState(isDashboardActive);
  const [leadsOpen, setLeadsOpen] = useState(isLeadsActive);

  useEffect(() => { closeMobile(); }, [pathname, closeMobile]);

  const role = user?.role || '';
  const visibleItems = NAV_ITEMS.filter((item) => {
    if (!item.roles || item.roles.length === 0) return true;
    return user && item.roles.includes(user.role);
  });

  function renderNavLink(item: { label: string; href: string; icon: React.ElementType }, indent = false) {
    const isExactMatch = pathname === item.href;
    const isPrefixMatch = item.href !== '/dashboard' && item.href !== '/leads' && pathname.startsWith(item.href);
    const active = isExactMatch || isPrefixMatch;
    const showLabel = mobileOpen || !collapsed;

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
          active
            ? 'bg-sky-50 text-sky-600 shadow-[0_2px_8px_-2px_rgba(14,165,233,0.15)]'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          !mobileOpen && collapsed && 'justify-center px-2',
          indent && showLabel && 'pl-10',
        )}
        title={!showLabel ? item.label : undefined}
      >
        {active && (
          <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-gradient-to-b from-sky-500 to-cyan-500" />
        )}
        <item.icon size={indent ? 16 : 20} className={cn(active && 'text-sky-600')} />
        {showLabel && <span>{item.label}</span>}
      </Link>
    );
  }

  /** Render a collapsible group (Dashboard or Leads) */
  function renderCollapsible(
    item: NavItem,
    children: NavChild[],
    isOpen: boolean,
    toggle: () => void,
    isGroupActive: boolean,
  ) {
    const showLabel = mobileOpen || !collapsed;
    if (!showLabel) return renderNavLink(item);

    return (
      <div key={item.href}>
        <button
          onClick={toggle}
          className={cn(
            'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200',
            isGroupActive ? 'text-sky-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
          )}
        >
          <item.icon size={20} />
          <span className="flex-1 text-left">{item.label}</span>
          <ChevronDown size={16} className={cn('transition-transform', isOpen && 'rotate-180')} />
        </button>
        {isOpen && (
          <div className="mt-0.5 space-y-0.5">
            {children.map(child => renderNavLink(child, true))}
          </div>
        )}
      </div>
    );
  }

  const navContent = (
    <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
      {visibleItems.map((item) => {
        // Dashboard dropdown (new)
        if (item.children) {
          const visibleChildren = item.children.filter(c => !c.roles || c.roles.includes(role));
          return renderCollapsible(item, visibleChildren, dashboardOpen, () => setDashboardOpen(!dashboardOpen), isDashboardActive);
        }

        // Leads dropdown (legacy childrenByRole pattern)
        const roleChildren = item.childrenByRole?.[role];
        const showChildren = roleChildren && item.childRoles?.includes(role);
        if (showChildren && (mobileOpen || !collapsed)) {
          return renderCollapsible(item, roleChildren, leadsOpen, () => setLeadsOpen(!leadsOpen), isLeadsActive);
        }

        return renderNavLink(item);
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className={cn(
        'hidden lg:flex flex-col border-r border-slate-200/80 bg-white transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
      )}>
        <div className="flex h-14 items-center justify-between border-b border-slate-200/80 px-4">
          {!collapsed && <span className="text-lg font-extrabold text-gradient">VeloCRM</span>}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
        {navContent}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={closeMobile} />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white shadow-xl animate-in slide-in-from-left duration-200">
            <div className="flex h-14 items-center justify-between border-b border-slate-200/80 px-4">
              <span className="text-lg font-extrabold text-gradient">VeloCRM</span>
              <button
                onClick={closeMobile}
                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            {navContent}
          </aside>
        </div>
      )}
    </>
  );
}
