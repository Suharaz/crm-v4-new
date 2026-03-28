import { serverFetch } from '@/lib/auth';
import { formatVND } from '@/lib/utils';

/** Products list page. */
export default async function ProductsPage() {
  let data: any[] = [];
  try {
    const result = await serverFetch<{ data: any[] }>('/products');
    data = result.data;
  } catch { /* empty */ }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Sản phẩm</h1>
      <p className="text-sm text-gray-500">Danh sách sản phẩm và dịch vụ</p>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data.length === 0 ? (
          <div className="col-span-full rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">Không có sản phẩm nào</div>
        ) : data.map((p: any) => (
          <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="font-semibold text-gray-900">{p.name}</h3>
            <p className="mt-1 text-sm text-gray-500">{p.category?.name || 'Chưa phân loại'}</p>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-lg font-bold text-sky-600">{formatVND(Number(p.price))}</span>
              {Number(p.vatRate) > 0 && <span className="text-xs text-gray-400">+VAT {p.vatRate}%</span>}
            </div>
            {p.description && <p className="mt-2 text-sm text-gray-600">{p.description}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
