'use client';

interface DashboardStats {
  newLeads: number;
  inProgress: number;
  converted: number;
  monthlyRevenue: number;
  totalCustomers: number;
  totalOrders: number;
  pendingPayments: number;
  overdueTask: number;
}

interface Props {
  stats: DashboardStats | null;
}

function formatVND(value: number): string {
  return new Intl.NumberFormat('vi-VN').format(value) + ' ₫';
}

function fmt(value: number | undefined | null): string {
  if (value == null) return '--';
  return new Intl.NumberFormat('vi-VN').format(value);
}

interface KpiCardProps {
  title: string;
  value: string;
  subtitle: string;
  iconBg: string;
  iconText: string;
  valueColor?: string;
  icon: React.ReactNode;
}

function KpiCard({ title, value, subtitle, iconBg, iconText, valueColor = 'text-gray-900', icon }: KpiCardProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">{title}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg} ${iconText} text-lg`}>
          {icon}
        </span>
      </div>
      <div className={`mt-2 text-2xl font-bold ${valueColor}`}>{value}</div>
      <div className="mt-1 text-xs text-gray-400">{subtitle}</div>
    </div>
  );
}

export function DashboardKpiStatsGrid({ stats }: Props) {
  const cards: KpiCardProps[] = [
    {
      title: 'Leads mới',
      value: fmt(stats?.newLeads),
      subtitle: 'Đang trong kho',
      iconBg: 'bg-sky-100',
      iconText: 'text-sky-600',
      icon: '📥',
    },
    {
      title: 'Đang xử lý',
      value: fmt(stats?.inProgress),
      subtitle: 'Leads đang tiến hành',
      iconBg: 'bg-yellow-100',
      iconText: 'text-yellow-600',
      icon: '⚙️',
    },
    {
      title: 'Đã chuyển đổi',
      value: fmt(stats?.converted),
      subtitle: 'Tháng này',
      iconBg: 'bg-green-100',
      iconText: 'text-green-600',
      icon: '✅',
    },
    {
      title: 'Doanh thu tháng',
      value: stats ? formatVND(stats.monthlyRevenue) : '--',
      subtitle: 'Thanh toán đã xác nhận',
      iconBg: 'bg-purple-100',
      iconText: 'text-purple-600',
      icon: '💰',
    },
    {
      title: 'Khách hàng',
      value: fmt(stats?.totalCustomers),
      subtitle: 'Đang hoạt động',
      iconBg: 'bg-indigo-100',
      iconText: 'text-indigo-600',
      icon: '👥',
    },
    {
      title: 'Đơn hàng tháng',
      value: fmt(stats?.totalOrders),
      subtitle: 'Tháng này',
      iconBg: 'bg-teal-100',
      iconText: 'text-teal-600',
      icon: '🛒',
    },
    {
      title: 'Thanh toán chờ',
      value: fmt(stats?.pendingPayments),
      subtitle: 'Chờ xác nhận',
      iconBg: 'bg-orange-100',
      iconText: 'text-orange-600',
      valueColor: stats?.pendingPayments ? 'text-orange-600' : 'text-gray-900',
      icon: '⏳',
    },
    {
      title: 'Công việc quá hạn',
      value: fmt(stats?.overdueTask),
      subtitle: 'Cần xử lý ngay',
      iconBg: 'bg-red-100',
      iconText: 'text-red-600',
      valueColor: stats?.overdueTask ? 'text-red-600' : 'text-gray-900',
      icon: '🔔',
    },
  ];

  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => (
        <KpiCard key={card.title} {...card} />
      ))}
    </div>
  );
}
