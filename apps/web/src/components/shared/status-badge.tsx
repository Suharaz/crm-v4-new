import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  // Lead statuses
  POOL: 'bg-sky-100 text-sky-700',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_PROGRESS: 'bg-amber-100 text-amber-700',
  CONVERTED: 'bg-emerald-100 text-emerald-700',
  LOST: 'bg-red-100 text-red-700',
  FLOATING: 'bg-violet-100 text-violet-700',
  // Customer statuses
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  INACTIVE: 'bg-gray-100 text-gray-500',
  // Order statuses
  PENDING: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  REFUNDED: 'bg-red-100 text-red-700',
  // Payment statuses
  VERIFIED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  POOL: 'Kho',
  ASSIGNED: 'Đã gán',
  IN_PROGRESS: 'Đang xử lý',
  CONVERTED: 'Đã chuyển đổi',
  LOST: 'Mất',
  FLOATING: 'Thả nổi',
  ACTIVE: 'Hoạt động',
  INACTIVE: 'Ngừng',
  PENDING: 'Chờ xử lý',
  CONFIRMED: 'Xác nhận',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Hủy',
  REFUNDED: 'Hoàn tiền',
  VERIFIED: 'Đã xác minh',
  REJECTED: 'Từ chối',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      STATUS_STYLES[status] || 'bg-gray-100 text-gray-600',
    )}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}
