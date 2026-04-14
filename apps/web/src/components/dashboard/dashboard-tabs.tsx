'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useTabData, type TabKey, type CustomersTabData, type RevenueTabData, type TeamTabData } from './hooks/use-tab-data';
import { TabCustomers } from './tabs/tab-customers';
import { TabRevenue } from './tabs/tab-revenue';
import { TabTeam } from './tabs/tab-team';
import type { RangeKey } from './constants';

interface DashboardTabsProps {
  range: RangeKey;
  isAdmin: boolean;
}

const DEFAULT_TAB: TabKey = 'customers';

export function DashboardTabs({ range, isAdmin }: DashboardTabsProps) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = (searchParams.get('tab') as TabKey) || DEFAULT_TAB;

  const onTabChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === DEFAULT_TAB) {
      params.delete('tab');
    } else {
      params.set('tab', value);
    }
    const qs = params.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  }, [searchParams, router, pathname]);

  // Lazy-load data per tab — only fetches when active
  const customers = useTabData<CustomersTabData>('customers', range, isAdmin, activeTab === 'customers');
  const revenue = useTabData<RevenueTabData>('revenue', range, isAdmin, activeTab === 'revenue');
  const team = useTabData<TeamTabData>('team', range, isAdmin, activeTab === 'team');

  return (
    <Tabs value={activeTab} onValueChange={onTabChange}>
      <TabsList className="w-full justify-start bg-white border border-slate-200 shadow-[0_2px_10px_-2px_rgba(14,165,233,0.06)]">
        <TabsTrigger value="customers" className="gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-50 data-[state=active]:to-cyan-50 data-[state=active]:text-sky-700">
          <span className="hidden sm:inline">📋</span> Khách hàng
        </TabsTrigger>
        <TabsTrigger value="revenue" className="gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-50 data-[state=active]:to-cyan-50 data-[state=active]:text-sky-700">
          <span className="hidden sm:inline">💰</span> Doanh thu
        </TabsTrigger>
        {isAdmin && (
          <TabsTrigger value="team" className="gap-1.5 data-[state=active]:bg-gradient-to-r data-[state=active]:from-sky-50 data-[state=active]:to-cyan-50 data-[state=active]:text-sky-700">
            <span className="hidden sm:inline">👥</span> Nhân viên
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="customers">
        <TabCustomers data={customers.data} loading={customers.loading} isAdmin={isAdmin} />
      </TabsContent>

      <TabsContent value="revenue">
        <TabRevenue data={revenue.data} loading={revenue.loading} isAdmin={isAdmin} />
      </TabsContent>

      {isAdmin && (
        <TabsContent value="team">
          <TabTeam data={team.data} loading={team.loading} />
        </TabsContent>
      )}
    </Tabs>
  );
}
