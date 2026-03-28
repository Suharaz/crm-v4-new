import { serverFetch } from '@/lib/auth';
import { DashboardKpiStatsGrid } from '@/components/dashboard/dashboard-kpi-stats-grid';

export default async function DashboardPage() {
  let stats = null;
  try {
    const result = await serverFetch<{ data: any }>('/dashboard/stats');
    stats = result.data;
  } catch {
    // fallback to null — grid shows "--"
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Trang chủ</h1>
      <p className="mt-1 text-gray-500">Tổng quan hệ thống CRM</p>
      <DashboardKpiStatsGrid stats={stats} />
    </div>
  );
}
