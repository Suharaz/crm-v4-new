import { serverFetch } from '@/lib/auth';
import { SettingsPageClient } from '@/components/settings/settings-page-client';

/** Settings page — departments, levels, sources, labels, payment types. */
export default async function SettingsPage() {
  let departments: any[] = [];
  let levels: any[] = [];
  let sources: any[] = [];
  let labels: any[] = [];
  let paymentTypes: any[] = [];

  try {
    [departments, levels, sources, labels, paymentTypes] = await Promise.all([
      serverFetch<{ data: any[] }>('/departments').then(r => r.data),
      serverFetch<{ data: any[] }>('/employee-levels').then(r => r.data),
      serverFetch<{ data: any[] }>('/lead-sources').then(r => r.data),
      serverFetch<{ data: any[] }>('/labels').then(r => r.data),
      serverFetch<{ data: any[] }>('/payment-types').then(r => r.data),
    ]);
  } catch { /* partial data ok */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Cài đặt</h1>
      <p className="text-sm text-gray-500 mb-6">Quản lý cấu hình hệ thống</p>

      <SettingsPageClient
        departments={departments}
        levels={levels}
        sources={sources}
        paymentTypes={paymentTypes}
        labels={labels}
      />
    </div>
  );
}
