/** Import data page — placeholder for CSV import UI. */
export default function ImportPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Nhập dữ liệu</h1>
      <p className="text-sm text-gray-500">Import leads và khách hàng từ file CSV</p>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-8 text-center">
          <div className="text-4xl text-gray-300">📥</div>
          <h3 className="mt-3 font-semibold text-gray-700">Import Leads</h3>
          <p className="mt-1 text-sm text-gray-400">Upload file CSV chứa danh sách leads</p>
          <p className="mt-4 text-xs text-gray-400">Hỗ trợ: .csv, tối đa 10MB, 10.000+ dòng</p>
        </div>

        <div className="rounded-xl border-2 border-dashed border-gray-300 bg-white p-8 text-center">
          <div className="text-4xl text-gray-300">📥</div>
          <h3 className="mt-3 font-semibold text-gray-700">Import Khách hàng</h3>
          <p className="mt-1 text-sm text-gray-400">Upload file CSV chứa danh sách khách hàng</p>
          <p className="mt-4 text-xs text-gray-400">Hỗ trợ: .csv, tối đa 10MB, 10.000+ dòng</p>
        </div>
      </div>
    </div>
  );
}
