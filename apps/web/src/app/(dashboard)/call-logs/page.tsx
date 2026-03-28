import { serverFetch } from '@/lib/auth';
import { StatusBadge } from '@/components/shared/status-badge';
import { formatDateTime } from '@/lib/utils';

/** Call logs page. */
export default async function CallLogsPage() {
  let data: any[] = [];
  try {
    const result = await serverFetch<{ data: any[] }>('/call-logs');
    data = result.data;
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Cuộc gọi</h1>
      <p className="text-sm text-gray-500">Lịch sử cuộc gọi và ghép nối</p>

      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        {data.length === 0 ? (
          <div className="p-8 text-center text-gray-400">Không có cuộc gọi nào</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">SĐT</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Loại</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Thời lượng</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Ghép nối</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c: any) => (
                <tr key={c.id} className="border-b border-gray-100 hover:bg-gray-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-gray-700">{c.phoneNumber}</td>
                  <td className="px-4 py-3 text-gray-600">{c.callType === 'INCOMING' ? 'Đến' : c.callType === 'OUTGOING' ? 'Đi' : 'Nhỡ'}</td>
                  <td className="px-4 py-3 text-gray-600">{c.duration}s</td>
                  <td className="px-4 py-3"><StatusBadge status={c.matchStatus === 'AUTO_MATCHED' ? 'VERIFIED' : c.matchStatus === 'MANUALLY_MATCHED' ? 'CONFIRMED' : 'PENDING'} /></td>
                  <td className="px-4 py-3 text-gray-400">{formatDateTime(c.callTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
