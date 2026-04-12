'use client';

import { useState } from 'react';
import { DepartmentSettings } from '@/components/settings/department-settings';
import { EmployeeLevelSettings } from '@/components/settings/employee-level-settings';
import { LeadSourceSettings } from '@/components/settings/lead-source-settings';
import { PaymentTypeSettings } from '@/components/settings/payment-type-settings';
import { BankAccountSettings } from '@/components/settings/bank-account-settings';
import { OrderFormatSettings } from '@/components/settings/order-format-settings';
import { ProductGroupSettings } from '@/components/settings/product-group-settings';
import { PaymentInstallmentSettings } from '@/components/settings/payment-installment-settings';
import { LabelSettings } from '@/components/settings/label-settings';
import { TeamManagementWithLeaderSelect } from '@/components/settings/team-management-with-leader-select';
import { ApiKeySettings } from '@/components/settings/api-key-settings';
import { AiPromptSettings } from '@/components/settings/ai-prompt-settings';
import { useAuth } from '@/providers/auth-provider';
import {
  Building2, GraduationCap, Megaphone, Tag,
  CreditCard, Repeat, FileText, Layers, Landmark,
  Key, Bot, ChevronDown, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SettingsItem, LabelEntity, UserRecord } from '@/types/entities';

interface SettingsPageClientProps {
  departments: SettingsItem[];
  levels: SettingsItem[];
  sources: SettingsItem[];
  paymentTypes: SettingsItem[];
  bankAccounts: SettingsItem[];
  orderFormats: SettingsItem[];
  productGroups: SettingsItem[];
  paymentInstallments: SettingsItem[];
  labels: LabelEntity[];
  users: UserRecord[];
  apiKeys: SettingsItem[];
  aiSettings: Record<string, string>;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
  managerOnly?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'Tổ chức',
    items: [
      { id: 'departments', label: 'Phòng ban & Team', icon: Building2 },
      { id: 'levels', label: 'Cấp bậc', icon: GraduationCap },
    ],
  },
  {
    title: 'Lead & Khách hàng',
    items: [
      { id: 'sources', label: 'Nguồn lead', icon: Megaphone },
      { id: 'labels', label: 'Nhãn', icon: Tag, managerOnly: true },
    ],
  },
  {
    title: 'Đơn hàng & Thanh toán',
    items: [
      { id: 'payment-types', label: 'Loại thanh toán', icon: CreditCard },
      { id: 'payment-installments', label: 'Lần chuyển khoản', icon: Repeat },
      { id: 'order-formats', label: 'Hình thức đơn hàng', icon: FileText },
      { id: 'product-groups', label: 'Nhóm sản phẩm', icon: Layers },
      { id: 'bank-accounts', label: 'Tài khoản ngân hàng', icon: Landmark },
    ],
  },
  {
    title: 'Hệ thống',
    items: [
      { id: 'api-keys', label: 'API Keys', icon: Key, adminOnly: true },
      { id: 'ai', label: 'AI Cấu hình', icon: Bot, adminOnly: true },
    ],
  },
];

export function SettingsPageClient({ departments, levels, sources, paymentTypes, bankAccounts, orderFormats, productGroups, paymentInstallments, labels, users, apiKeys, aiSettings }: SettingsPageClientProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'SUPER_ADMIN';
  const isManager = user?.role === 'MANAGER';
  const canEdit = isAdmin;
  const canEditLabels = isAdmin || isManager;

  const [activeSection, setActiveSection] = useState('departments');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(
    new Set(NAV_GROUPS.map(g => g.title)),
  );

  function toggleGroup(title: string) {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  function isVisible(item: NavItem) {
    if (item.adminOnly && !isAdmin) return false;
    if (item.managerOnly && !isAdmin && !isManager) return false;
    return true;
  }

  function renderContent() {
    switch (activeSection) {
      case 'departments':
        return (
          <div className="space-y-6">
            <DepartmentSettings data={departments} canEdit={canEdit} />
            <div className="border-t border-slate-200 pt-6">
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-sky-500" />
                <h3 className="font-semibold text-slate-900">Teams theo phòng ban</h3>
              </div>
              <TeamManagementWithLeaderSelect
                departments={departments}
                users={users as { id: string; name: string; departmentId?: string }[]}
                canEdit={canEdit}
              />
            </div>
          </div>
        );
      case 'levels':
        return <EmployeeLevelSettings data={levels} canEdit={canEdit} />;
      case 'sources':
        return <LeadSourceSettings data={sources} canEdit={canEdit} />;
      case 'labels':
        return <LabelSettings data={labels as unknown as SettingsItem[]} canEdit={canEditLabels} />;
      case 'payment-types':
        return <PaymentTypeSettings data={paymentTypes} canEdit={canEdit} />;
      case 'payment-installments':
        return <PaymentInstallmentSettings data={paymentInstallments} canEdit={canEdit} />;
      case 'order-formats':
        return <OrderFormatSettings data={orderFormats} canEdit={canEdit} />;
      case 'product-groups':
        return <ProductGroupSettings data={productGroups} canEdit={canEdit} />;
      case 'bank-accounts':
        return <BankAccountSettings data={bankAccounts} canEdit={canEdit} />;
      case 'api-keys':
        /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
        return <ApiKeySettings apiKeys={apiKeys as any[]} />;
      case 'ai':
        return <AiPromptSettings initialSettings={aiSettings || {}} />;
      default:
        return null;
    }
  }

  return (
    <div className="flex gap-6 min-h-[60vh]">
      {/* Sidebar nav */}
      <nav className="hidden md:block w-56 shrink-0 space-y-1">
        {NAV_GROUPS.map((group) => {
          const visibleItems = group.items.filter(isVisible);
          if (visibleItems.length === 0) return null;
          const isExpanded = expandedGroups.has(group.title);

          return (
            <div key={group.title} className="mb-2">
              <button
                onClick={() => toggleGroup(group.title)}
                className="flex w-full items-center justify-between px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors"
              >
                {group.title}
                <ChevronDown size={14} className={cn('transition-transform', isExpanded && 'rotate-180')} />
              </button>
              {isExpanded && (
                <div className="mt-0.5 space-y-0.5">
                  {visibleItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                        activeSection === item.id
                          ? 'bg-sky-50 text-sky-600'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                      )}
                    >
                      <item.icon size={16} className={cn(activeSection === item.id ? 'text-sky-500' : 'text-slate-400')} />
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Mobile select dropdown */}
      <div className="md:hidden w-full">
        <select
          value={activeSection}
          onChange={(e) => setActiveSection(e.target.value)}
          className="mb-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700"
        >
          {NAV_GROUPS.flatMap(g => g.items).filter(isVisible).map(item => (
            <option key={item.id} value={item.id}>{item.label}</option>
          ))}
        </select>
        {renderContent()}
      </div>

      {/* Desktop content */}
      <div className="hidden md:block flex-1 min-w-0">
        {renderContent()}
      </div>
    </div>
  );
}
