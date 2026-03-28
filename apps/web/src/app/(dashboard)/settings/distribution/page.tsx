import { serverFetch } from '@/lib/auth';
import { DistributionAiWeightConfigClient } from '@/components/settings/distribution-ai-weight-config-client';

/** AI distribution config page — weight settings and auto-assign per department. */
export default async function DistributionSettingsPage() {
  let departments: { id: string; name: string }[] = [];
  try {
    const result = await serverFetch<{ data: { id: string; name: string }[] }>('/departments');
    departments = result.data;
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Phân phối AI</h1>
      <p className="text-sm text-gray-500 mb-6">Cấu hình trọng số và phân phối leads tự động theo phòng ban</p>
      <DistributionAiWeightConfigClient departments={departments} />
    </div>
  );
}
