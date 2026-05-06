'use client';

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Download, Upload, Loader2, FileSpreadsheet, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

interface BankImportResult {
  total: number;
  imported: number;
  skipped_duplicate: number;
  auto_matched: number;
  errors: { row: number; externalId?: string; reason: string }[];
}

export function BankImportTab() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BankImportResult | null>(null);

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (f && !/\.csv$/i.test(f.name)) {
      toast.error('Chỉ chấp nhận file CSV (.csv)');
      e.target.value = '';
      return;
    }
    setFile(f);
    setResult(null);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/proxy/bank-transactions/import', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Lỗi tải lên' }));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const json = await res.json();
      setResult(json.data as BankImportResult);
      toast.success(`Đã xử lý ${json.data.total} dòng`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi tải lên');
    } finally {
      setUploading(false);
    }
  }

  function handleDownloadTemplate() {
    window.location.href = '/api/proxy/bank-transactions/import/template';
  }

  function handleReset() {
    setFile(null);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="my-4 space-y-4">
      {/* Hướng dẫn - chứa luôn nút tải file mẫu để gom 1 chỗ */}
      <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-4">
        <h3 className="text-sm font-semibold text-sky-900 mb-2">Hướng dẫn import sao kê CSV</h3>
        <ol className="text-xs text-sky-800 space-y-1 list-decimal list-inside">
          <li>Tải file mẫu CSV (UTF-8) - gồm 7 cột chuẩn: Mã giao dịch, Số tiền, Nội dung, Thời gian giao dịch, TK nhận, Tên người gửi, TK người gửi.</li>
          <li>Điền dữ liệu từ file sao kê bank vào template. Cột thừa sẽ bị bỏ qua, cột "Mã giao dịch" để trống sẽ tự sinh hash.</li>
          <li>Upload file - hệ thống tự dedup trùng, tự match với payment PENDING đang chờ.</li>
        </ol>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-900 hover:underline"
        >
          <Download className="h-3.5 w-3.5" />
          Tải file mẫu
        </button>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 flex items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-white px-4 py-2.5 hover:border-sky-300 transition-colors">
          <FileSpreadsheet className="h-5 w-5 text-slate-400" />
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={onPickFile}
            className="flex-1 text-sm text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-sky-50 file:px-3 file:py-1.5 file:text-sky-700 file:cursor-pointer hover:file:bg-sky-100"
          />
        </div>

        <Button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="bg-sky-600 hover:bg-sky-700 text-white gap-2"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          Tải lên
        </Button>
      </div>

      {/* Result panel */}
      {result && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center gap-2 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
            <span className="font-semibold">Hoàn tất - {result.total} dòng đã xử lý</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MetricCard label="Tổng dòng" value={result.total} tone="slate" />
            <MetricCard label="Nhập thành công" value={result.imported} tone="emerald" />
            <MetricCard label="Trùng (bỏ qua)" value={result.skipped_duplicate} tone="amber" />
            <MetricCard label="Auto-match" value={result.auto_matched} tone="sky" />
          </div>

          {result.errors.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-700 mb-1.5">Lỗi ({result.errors.length} dòng):</p>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-red-100">
                <table className="w-full text-xs">
                  <thead className="bg-red-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-red-700">Dòng</th>
                      <th className="px-3 py-1.5 text-left font-medium text-red-700">Mã GD</th>
                      <th className="px-3 py-1.5 text-left font-medium text-red-700">Lý do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((e, i) => (
                      <tr key={i} className="border-t border-red-100">
                        <td className="px-3 py-1.5 text-slate-700">{e.row}</td>
                        <td className="px-3 py-1.5 text-slate-600 font-mono text-[11px]">{e.externalId || '-'}</td>
                        <td className="px-3 py-1.5 text-red-600">{e.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={handleReset}>
              Tải file khác
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'amber' | 'sky' }) {
  const toneClass = {
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    sky: 'bg-sky-50 border-sky-200 text-sky-700',
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="text-2xl font-bold mt-0.5">{value}</p>
    </div>
  );
}
