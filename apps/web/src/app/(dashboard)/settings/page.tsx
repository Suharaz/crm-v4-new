import { serverFetch } from '@/lib/auth';
import { SettingsPageClient } from '@/components/settings/settings-page-client';

/** Settings page — departments, levels, sources, labels, payment types. */
export default async function SettingsPage() {
  let departments: any[] = [];
  let levels: any[] = [];
  let sources: any[] = [];
  let labels: any[] = [];
  let paymentTypes: any[] = [];
  let bankAccounts: any[] = [];
  let users: any[] = [];
  let apiKeys: any[] = [];
  let aiSettings: Record<string, string> = {};

  try {
    [departments, levels, sources, labels, paymentTypes, bankAccounts, users, apiKeys] = await Promise.all([
      serverFetch<{ data: any[] }>('/departments').then(r => r.data),
      serverFetch<{ data: any[] }>('/employee-levels').then(r => r.data),
      serverFetch<{ data: any[] }>('/lead-sources').then(r => r.data),
      serverFetch<{ data: any[] }>('/labels').then(r => r.data),
      serverFetch<{ data: any[] }>('/payment-types').then(r => r.data),
      serverFetch<{ data: any[] }>('/bank-accounts').then(r => r.data).catch(() => []),
      serverFetch<{ data: any[] }>('/users').then(r => (r.data || []).map((u: any) => ({ id: String(u.id), name: u.name, departmentId: u.departmentId ? String(u.departmentId) : undefined }))).catch(() => []),
      serverFetch<{ data: any[] }>('/api-keys').then(r => r.data).catch(() => []),
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
