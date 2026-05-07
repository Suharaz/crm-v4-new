'use client';

import { useState } from 'react';
import { AlertCircle, CheckCircle2, Download, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

const API_BASE = '/api/proxy';

export interface PreviewSummary {
  totalRows: number;
  validRows: number;
  errorRows: number;
  sampleErrors: Array<{ row: number; message: string }>;
}

export interface PreviewJob {
  id: string;
  type: string;
  errorFileUrl?: string | null;
  previewSummary?: PreviewSummary | null;
}

interface Props {
  job: PreviewJob | null;
  onConfirm: (job: PreviewJob) => Promise<void>;
  onCancel: (job: PreviewJob) => Promise<void>;
}

export function ImportPreviewDialog({ job, onConfirm, onCancel }: Props) {
  const [pending, setPending] = useState<'confirm' | 'cancel' | null>(null);
  const open = job !== null;
  const summary = job?.previewSummary ?? null;
  const valid = summary?.validRows ?? 0;
  const errors = summary?.errorRows ?? 0;
  const total = summary?.totalRows ?? 0;
  const samples = summary?.sampleErrors ?? [];
  const importDisabled = valid === 0 || pending !== null;

  async function handleConfirm() {
    if (!job) return;
    setPending('confirm');
    try {
      await onConfirm(job);
    } finally {
      setPending(null);
    }
  }

  async function handleCancel() {
    if (!job) return;
    setPending('cancel');
    try {
      await onCancel(job);
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // Block dismissal via outside click - user must choose explicitly.
        if (!o && pending === null && job) {
          handleCancel();
        }
      }}
    >
      <DialogContent
        className="max-w-2xl"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Kết quả kiểm tra file</DialogTitle>
          <DialogDescription>
            File đã được kiểm tra {total} dòng. Hãy xác nhận để tiến hành import {valid} dòng hợp lệ.
          </DialogDescription>
        </DialogHeader>

        {summary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-xs font-medium">Hợp lệ</span>
                </div>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{valid}</p>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-2 text-red-700">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-xs font-medium">Lỗi</span>
                </div>
                <p className="mt-1 text-2xl font-bold text-red-700">{errors}</p>
              </div>
            </div>

            {samples.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-semibold text-slate-700">
                  Ví dụ {samples.length} lỗi đầu tiên
                </h4>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left w-20">Dòng</th>
                        <th className="px-3 py-2 text-left">Lý do</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {samples.map((e) => (
                        <tr key={e.row} className="align-top">
                          <td className="px-3 py-2 text-slate-600">{e.row}</td>
                          <td className="px-3 py-2 text-slate-700">{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {errors > samples.length && job?.errorFileUrl && (
                  <a
                    href={`${API_BASE}/imports/${job.id}/error-file`}
                    download
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline"
                  >
                    <Download className="h-3 w-3" />
                    Tải file lỗi đầy đủ ({errors} dòng)
                  </a>
                )}
              </div>
            )}

            {valid === 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Toàn bộ dòng đều lỗi - không thể import. Hãy sửa file rồi upload lại.
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center py-8 text-slate-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Đang chuẩn bị kết quả...
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={handleCancel} disabled={pending !== null}>
            {pending === 'cancel' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Huỷ
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={importDisabled}
            className="bg-sky-600 text-white hover:bg-sky-700"
          >
            {pending === 'confirm' && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Import {valid} dòng hợp lệ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
