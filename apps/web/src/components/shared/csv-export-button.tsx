'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface CsvExportButtonProps {
  exportPath: string; // e.g. '/exports/leads'
  label?: string;
}

/** CSV export via auth proxy — fetches blob and triggers download. */
export function CsvExportButton({ exportPath, label = 'Xuất CSV' }: CsvExportButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleExport() {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy${exportPath}`);
      if (!res.ok) throw new Error('Export thất bại');
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition');
      const filename = disposition?.match(/filename="?(.+?)"?$/)?.[1] || 'export.csv';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Không thể xuất file. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
      {label}
    </Button>
  );
}
