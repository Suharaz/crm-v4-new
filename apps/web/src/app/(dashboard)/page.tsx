/** Dashboard home page — placeholder until Phase 11. */
export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Trang chủ</h1>
      <p className="mt-1 text-gray-500">Tổng quan hệ thống CRM</p>

      {/* KPI cards placeholder */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {['Leads mới', 'Đang xử lý', 'Đã chuyển đổi', 'Doanh thu tháng'].map((title) => (
          <div key={title} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm text-gray-500">{title}</div>
            <div className="mt-1 text-2xl font-bold text-gray-900">--</div>
          </div>
        ))}
      </div>
    </div>
  );
}
