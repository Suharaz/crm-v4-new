'use client';

import { useState, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import { Upload, CheckCircle2, XCircle, Loader2, FileText } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010/api/v1';

interface ImportJob {
  id: string;
  type: string;
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  total?: number;
  processed?: number;
  failed?: number;
  createdAt: string;
}

interface UploadZoneProps {
  label: string;
  endpoint: string;
  onJobCreated: (job: ImportJob) => void;
}

function UploadZone({ label, endpoint, onJobCreated }: UploadZoneProps) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    if (!file.name.endsWith('.csv')) {
      toast.error('Chỉ hỗ trợ file CSV');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Lỗi upload' }));
        throw new Error(err.message || `HTTP ${res.status}`);
      }
      const job = await res.json();
      onJobCreated(job);
      toast.success(`Đã upload ${file.name}, đang xử lý...`);
    } catch (err: any) {
      toast.error(err.message || 'Lỗi upload file');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      onClick={() => !uploading && inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        dragging ? 'border-sky-400 bg-sky-50' : 'border-gray-300 bg-white hover:border-sky-300 hover:bg-sky-50/30'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
      />
      <div className="flex flex-col items-center gap-3">
        {uploading ? (
          <Loader2 className="h-10 w-10 animate-spin text-sky-400" />
        ) : (
          <Upload className="h-10 w-10 text-gray-300" />
        )}
        <div>
          <p className="font-semibold text-gray-700">{label}</p>
          <p className="mt-1 text-sm text-gray-400">
            {uploading ? 'Đang upload...' : 'Kéo thả hoặc nhấn để chọn file CSV'}
          </p>
          <p className="mt-2 text-xs text-gray-400">Hỗ trợ: .csv, tối đa 10MB</p>
        </div>
      </div>
    </div>
  );
}

const JOB_STATUS_COLORS: Record<string, string> = {
  PROCESSING: 'bg-sky-100 text-sky-700',
  COMPLETED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-600',
};

const JOB_STATUS_LABELS: Record<string, string> = {
  PROCESSING: 'Đang xử lý',
  COMPLETED: 'Hoàn thành',
  FAILED: 'Thất bại',
};

function JobStatusRow({ job, onUpdate }: { job: ImportJob; onUpdate: (updated: ImportJob) => void }) {
  const polling = job.status === 'PROCESSING';

  // Poll every 3s while processing
  const polledRef = useRef(false);
  const poll = useCallback(async () => {
    if (!polling || polledRef.current) return;
    polledRef.current = true;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/imports/${job.id}/status`, { credentials: 'include' });
        if (res.ok) {
          const updated = await res.json();
          onUpdate(updated);
          if (updated.status !== 'PROCESSING') {
            clearInterval(interval);
            if (updated.status === 'COMPLETED') toast.success(`Import hoàn thành: ${updated.processed} bản ghi`);
            else toast.error(`Import thất bại: ${updated.failed} lỗi`);
          }
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [job.id, polling, onUpdate]);

  // Start polling on mount if processing
  useState(() => { if (polling) poll(); });

  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">
            {job.type === 'leads' ? 'Import Leads' : 'Import Khách hàng'}
          </span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${JOB_STATUS_COLORS[job.status]}`}>
          {job.status === 'PROCESSING' && <Loader2 className="h-3 w-3 animate-spin" />}
          {job.status === 'COMPLETED' && <CheckCircle2 className="h-3 w-3" />}
          {job.status === 'FAILED' && <XCircle className="h-3 w-3" />}
          {JOB_STATUS_LABELS[job.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {job.total != null ? (
          <span>{job.processed ?? 0}/{job.total} <span className="text-red-500">({job.failed ?? 0} lỗi)</span></span>
        ) : '—'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-400">{formatDateTime(job.createdAt)}</td>
    </tr>
  );
}

export function CsvImportPageClient({ initialHistory }: { initialHistory: ImportJob[] }) {
  const [jobs, setJobs] = useState<ImportJob[]>(initialHistory);

  function handleJobCreated(job: ImportJob) {
    setJobs(prev => [job, ...prev]);
  }

  function handleJobUpdate(updated: ImportJob) {
    setJobs(prev => prev.map(j => j.id === updated.id ? updated : j));
  }

  return (
    <div className="space-y-6">
      {/* Upload zones */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <UploadZone
          label="Import Leads"
          endpoint="/imports/leads"
          onJobCreated={handleJobCreated}
        />
        <UploadZone
          label="Import Khách hàng"
          endpoint="/imports/customers"
          onJobCreated={handleJobCreated}
        />
      </div>

      {/* Import history */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-gray-800">Lịch sử import</h2>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          {jobs.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Chưa có lịch sử import</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Loại</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Trạng thái</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Tiến độ</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <JobStatusRow key={job.id} job={job} onUpdate={handleJobUpdate} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
