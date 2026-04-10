import { serverFetch } from '@/lib/auth';
import { SettingsPageClient } from '@/components/settings/settings-page-client';
import type { LabelEntity, SettingsItem, UserRecord } from '@/types/entities';

/** Settings page — departments, levels, sources, labels, payment types. */
export default async function SettingsPage() {
  let departments: SettingsItem[] = [];
  let levels: SettingsItem[] = [];
  let sources: SettingsItem[] = [];
  let labels: LabelEntity[] = [];
  let paymentTypes: SettingsItem[] = [];
  let bankAccounts: SettingsItem[] = [];
  let users: UserRecord[] = [];
  let apiKeys: SettingsItem[] = [];
  let aiSettings: Record<string, string> = {};

  try {
    [departments, levels, sources, labels, paymentTypes, bankAccounts, users, apiKeys] = await Promise.all([
      serverFetch<{ data: SettingsItem[] }>('/departments').then(r => r.data),
      serverFetch<{ data: SettingsItem[] }>('/employee-levels').then(r => r.data),
      serverFetch<{ data: SettingsItem[] }>('/lead-sources').then(r => r.data),
      serverFetch<{ data: LabelEntity[] }>('/labels').then(r => r.data),
      serverFetch<{ data: SettingsItem[] }>('/payment-types').then(r => r.data),
      serverFetch<{ data: SettingsItem[] }>('/bank-accounts').then(r => r.data).catch(() => []),
      serverFetch<{ data: UserRecord[] }>('/users').then(r => r.data || []).catch(() => []),
      serverFetch<{ data: SettingsItem[] }>('/api-keys').then(r => r.data).catch(() => []),
    ]);
  } catch { /* partial data ok */ }

  try {
    aiSettings = await serverFetch<{ data: Record<string, string> }>('/system-settings').then(r => r.data);
  } catch { /* may fail for non-admin */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Cài đặt</h1>
      <p className="text-sm text-gray-500 mb-6">Quản lý cấu hình hệ thống</p>

      <SettingsPageClient
        departments={departments}
        levels={levels}
        sources={sources}
        paymentTypes={paymentTypes}
        bankAccounts={bankAccounts}
        labels={labels}
        users={users}
        apiKeys={apiKeys}
        aiSettings={aiSettings}
      />
    </div>
  );
}
