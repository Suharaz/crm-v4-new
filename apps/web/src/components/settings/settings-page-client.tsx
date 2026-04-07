'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DepartmentSettings } from '@/components/settings/department-settings';
import { EmployeeLevelSettings } from '@/components/settings/employee-level-settings';
import { LeadSourceSettings } from '@/components/settings/lead-source-settings';
import { PaymentTypeSettings } from '@/components/settings/payment-type-settings';
import { BankAccountSettings } from '@/components/settings/bank-account-settings';
import { LabelSettings } from '@/components/settings/label-settings';
import { TeamManagementWithLeaderSelect } from '@/components/settings/team-management-with-leader-select';
import { ApiKeySettings } from '@/components/settings/api-key-settings';
import { useAuth } from '@/providers/auth-provider';

interface SettingsPageClientProps {
  departments: any[];
  levels: any[];
  sources: any[];
  paymentTypes: any[];
  bankAccounts: any[];
  labels: any[];
  users: any[];
  apiKeys: any[];
}

export function SettingsPageClient({ departments, levels, sources, paymentTypes, bankAccounts, labels, users, apiKeys }: SettingsPageClientProps) {
  const { user } = useAuth();
  const canEdit = user?.role === 'SUPER_ADMIN';
  const canEditLabels = user?.role === 'SUPER_ADMIN' || user?.role === 'MANAGER';

  return (
    <Tabs defaultValue="departments" className="w-full">
      <TabsList className="flex-wrap">
        <TabsTrigger value="departments">Phòng ban</TabsTrigger>
        <TabsTrigger value="levels">Cấp bậc</TabsTrigger>
        <TabsTrigger value="sources">Nguồn lead</TabsTrigger>
        <TabsTrigger value="payment-types">Thanh toán</TabsTrigger>
        <TabsTrigger value="bank-accounts">TK Ngân hàng</TabsTrigger>
        <TabsTrigger value="labels">Nhãn</TabsTrigger>
        <TabsTrigger value="teams">Teams</TabsTrigger>
        {canEdit && <TabsTrigger value="api-keys">API Keys</TabsTrigger>}
      </TabsList>

      <TabsContent value="departments">
        <DepartmentSettings data={departments} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="levels">
        <EmployeeLevelSettings data={levels} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="sources">
        <LeadSourceSettings data={sources} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="payment-types">
        <PaymentTypeSettings data={paymentTypes} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="bank-accounts">
        <BankAccountSettings data={bankAccounts} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="labels">
        <LabelSettings data={labels} canEdit={canEditLabels} />
      </TabsContent>
      <TabsContent value="teams">
        <TeamManagementWithLeaderSelect departments={departments} users={users} canEdit={canEdit} />
      </TabsContent>
      {canEdit && (
        <TabsContent value="api-keys">
          <ApiKeySettings apiKeys={apiKeys} />
        </TabsContent>
      )}
    </Tabs>
  );
}
