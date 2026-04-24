'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * Schema of a single CSV column — drives both the documentation table and the
 * preview spreadsheet. Keep required columns listed FIRST so the preview shows
 * them leftmost, matching how the backend parser reads.
 */
interface ColumnSpec {
  name: string;
  required: boolean;
  format: string;
  description: string;
}

interface TemplateSpec {
  title: string;
  columns: ColumnSpec[];
  // Sample rows shown as a mini spreadsheet. Length must equal columns.length per row.
  sampleRows: string[][];
}

/** Source of truth for the UI — mirrors the parser logic in import.processor.ts */
const TEMPLATES: Record<'lead' | 'customer', TemplateSpec> = {
  lead: {
    title: 'Mẫu import Leads',
    columns: [
      { name: 'Số điện thoại', required: true, format: '10–11 số VN', description: 'SĐT khách. Tự động chuẩn hoá (VD: +84 → 0)' },
      { name: 'Họ tên', required: false, format: 'Text', description: 'Trống → dùng SĐT làm tên' },
      { name: 'Email', required: false, format: 'Email', description: 'Có thể để trống' },
      { name: 'Nguồn', required: false, format: 'Tên nguồn có trong Settings', description: 'Phải tồn tại sẵn, nếu không → lỗi cả dòng' },
      { name: 'Sản phẩm', required: false, format: 'Tên sản phẩm có trong Settings', description: 'Match theo chuỗi con, phải tồn tại' },
      { name: 'Nhãn', required: false, format: 'Tên nhãn, cách bằng dấu phẩy', description: 'VD: "VIP, Hot". Nhãn lạ → cảnh báo, không fail' },
      { name: 'Ghi chú', required: false, format: 'Text tự do', description: 'Tạo note hiển thị trên timeline của lead' },
    ],
    sampleRows: [
      ['0912345678', 'Nguyễn Văn A', 'a@email.com', 'Facebook Ads', 'Khóa học Sales Pro', 'VIP, Hot', 'Cần tư vấn gấp lúc 14h'],
      ['0987654321', 'Trần Thị B', '', 'Website', '', 'Quan tâm', ''],
      ['0911222333', '', '', 'Cold Call', 'Tư vấn Marketing', '', 'Để lại SĐT sau hội thảo'],
    ],
  },
  customer: {
    title: 'Mẫu import Khách hàng',
    columns: [
      { name: 'Số điện thoại', required: true, format: '10–11 số VN', description: 'SĐT khách' },
      { name: 'Họ tên', required: true, format: 'Text', description: 'Bắt buộc với customer (khác với lead)' },
      { name: 'Email', required: false, format: 'Email', description: '' },
      { name: 'Công ty', required: false, format: 'Text', description: '' },
      { name: 'Facebook', required: false, format: 'URL', description: 'VD: https://facebook.com/a' },
      { name: 'Instagram', required: false, format: 'URL', description: '' },
      { name: 'Zalo', required: false, format: 'URL', description: '' },
      { name: 'LinkedIn', required: false, format: 'URL', description: '' },
      { name: 'Mô tả ngắn', required: false, format: 'Text 1 dòng', description: 'Hiển thị trên list' },
      { name: 'Mô tả', required: false, format: 'Text dài', description: 'Hiển thị ở trang chi tiết' },
      { name: 'Nhãn', required: false, format: 'Tên nhãn, cách bằng dấu phẩy', description: 'Nhãn lạ → cảnh báo, không fail' },
      { name: 'Ghi chú', required: false, format: 'Text tự do', description: 'Tạo note hiển thị trên timeline của khách' },
    ],
    sampleRows: [
      ['0912345678', 'Nguyễn Văn A', 'a@email.com', 'Công ty ABC', 'https://facebook.com/a', '', 'https://zalo.me/0912345678', '', 'Khách VIP', 'Khách thân thiết từ 2024', 'VIP, Quan tâm', 'Ưu tiên gọi trước 9h sáng'],
      ['0987654321', 'Trần Thị B', 'b@email.com', '', '', '', '', '', '', '', '', ''],
      ['0911222333', 'Lê Văn C', '', '', '', '', '', '', 'Khách mới tiếp cận', '', 'Tiềm năng', ''],
    ],
  },
};

interface Props {
  type: 'lead' | 'customer' | null;
  onClose: () => void;
}

export function ImportTemplateDialog({ type, onClose }: Props) {
  const open = type !== null;
  const spec = type ? TEMPLATES[type] : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{spec?.title ?? ''}</DialogTitle>
        </DialogHeader>

        {spec ? (
          <div className="space-y-6">
            {/* Schema table */}
            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-700">Cấu trúc cột</h4>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-medium text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Tên cột</th>
                      <th className="px-3 py-2 w-24">Bắt buộc</th>
                      <th className="px-3 py-2 w-48">Định dạng</th>
                      <th className="px-3 py-2">Mô tả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {spec.columns.map((col) => (
                      <tr key={col.name} className="align-top">
                        <td className="px-3 py-2 font-medium text-slate-800">{col.name}</td>
                        <td className="px-3 py-2">
                          {col.required ? (
                            <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                              Bắt buộc
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                              Tùy chọn
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{col.format}</td>
                        <td className="px-3 py-2 text-slate-600">{col.description || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Preview sheet */}
            <section>
              <h4 className="mb-2 text-sm font-semibold text-slate-700">Ví dụ dữ liệu</h4>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-xs">
                  <thead className="bg-sky-50 text-left font-semibold text-sky-800">
                    <tr>
                      {spec.columns.map((col) => (
                        <th key={col.name} className="whitespace-nowrap px-3 py-2 border-r border-sky-100 last:border-r-0">
                          {col.name}
                          {col.required && <span className="ml-0.5 text-red-500">*</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {spec.sampleRows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-slate-50">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="whitespace-nowrap px-3 py-2 border-r border-slate-100 last:border-r-0 text-slate-700">
                            {cell || <span className="text-slate-300">—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Dấu <span className="font-medium text-red-500">*</span> = cột bắt buộc. Ô trống = không cần điền.
              </p>
            </section>

            {/* Tips */}
            <section className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
              <p className="font-semibold mb-1">Lưu ý</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>File CSV cần có dòng tiêu đề (header) ở dòng đầu tiên. Tên cột có thể dùng tiếng Việt như mẫu trên hoặc tiếng Anh (<code>phone, name, email, source, product, labels, note</code>).</li>
                <li>Cột <code>Nguồn</code> và <code>Sản phẩm</code> cần được tạo trước trong <b>Cài đặt</b>, nếu không sẽ báo lỗi cả dòng.</li>
                <li>Cột <code>Nhãn</code> và <code>Ghi chú</code> tùy chọn — không có cũng không sao.</li>
                <li>File tối đa 10MB, encoding UTF-8.</li>
              </ul>
            </section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
