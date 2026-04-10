'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
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

export function SettingsPageClient({ departments, levels, sources, paymentTypes, bankAccounts, orderFormats, productGroups, paymentInstallments, labels, users, apiKeys, aiSettings }: SettingsPageClientProps) {
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
        <TabsTrigger value="payment-installments">Lần CK</TabsTrigger>
        <TabsTrigger value="order-formats">Hình thức</TabsTrigger>
        <TabsTrigger value="product-groups">Nhóm SP</TabsTrigger>
        <TabsTrigger value="bank-accounts">TK Ngân hàng</TabsTrigger>
        <TabsTrigger value="labels">Nhãn</TabsTrigger>
        <TabsTrigger value="teams">Teams</TabsTrigger>
        {canEdit && <TabsTrigger value="api-keys">API Keys</TabsTrigger>}
        {canEdit && <TabsTrigger value="ai">AI</TabsTrigger>}
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
      <TabsContent value="payment-installments">
        <PaymentInstallmentSettings data={paymentInstallments} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="order-formats">
        <OrderFormatSettings data={orderFormats} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="product-groups">
        <ProductGroupSettings data={productGroups} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="bank-accounts">
        <BankAccountSettings data={bankAccounts} canEdit={canEdit} />
      </TabsContent>
      <TabsContent value="labels">
        <LabelSettings data={labels as unknown as SettingsItem[]} canEdit={canEditLabels} />
      </TabsContent>
      <TabsContent value="teams">
        {/* UserRecord.departmentId is string|null|undefined; local User expects string|undefined — safe cast */}
        <TeamManagementWithLeaderSelect departments={departments} users={users as { id: string; name: string; departmentId?: string }[]} canEdit={canEdit} />
      </TabsContent>
      {canEdit && (
        <TabsContent value="api-keys">
          {/* ApiKeySettings has its own local ApiKeyItem type; passing as unknown[] is safe here */}
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <ApiKeySettings apiKeys={apiKeys as any[]} />
        </TabsContent>
      )}
      {canEdit && (
        <TabsContent value="ai">
          <AiPromptSettings initialSettings={aiSettings || {}} />
        </TabsContent>
      )}
    </Tabs>
  );
}
