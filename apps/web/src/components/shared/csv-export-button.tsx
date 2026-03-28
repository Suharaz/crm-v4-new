'use client';

import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010/api/v1';

interface CsvExportButtonProps {
  exportPath: string; // e.g. '/exports/leads'
  label?: string;
}

/** Reusable CSV export button — opens export endpoint in new tab to trigger file download. */
export function CsvExportButton({ exportPath, label = 'Xuất CSV' }: CsvExportButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => window.open(`${API_BASE}${exportPath}`, '_blank')}
    >
      <Download className="h-4 w-4 mr-1" />
      {label}
    </Button>
  );
}
