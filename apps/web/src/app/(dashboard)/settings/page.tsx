import { serverFetch } from '@/lib/auth';

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

  const sections = [
    { title: 'Phòng ban', data: departments, field: 'name' },
    { title: 'Cấp bậc', data: levels, field: 'name' },
    { title: 'Nguồn lead', data: sources, field: 'name' },
    { title: 'Loại thanh toán', data: paymentTypes, field: 'name' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Cài đặt</h1>
      <p className="text-sm text-gray-500">Quản lý cấu hình hệ thống</p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {sections.map((s) => (
          <div key={s.title} className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 font-semibold text-gray-900">{s.title} ({s.data.length})</h3>
            {s.data.length === 0 ? (
              <p className="text-sm text-gray-400">Chưa có dữ liệu</p>
            ) : (
              <div className="space-y-1">
                {s.data.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-gray-50">
                    <span className="text-sm text-gray-700">{item[s.field]}</span>
                    <span className="text-xs text-gray-400">#{item.id}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* Labels with colors */}
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 font-semibold text-gray-900">Nhãn ({labels.length})</h3>
          <div className="flex flex-wrap gap-2">
            {labels.map((l: any) => (
              <span key={l.id} className="rounded-full px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: l.color }}>
                {l.name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
