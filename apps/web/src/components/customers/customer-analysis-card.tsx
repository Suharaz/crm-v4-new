'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api-client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface Props {
  customerId: string;
  shortDescription?: string | null;
  description?: string | null;
}

/** Card showing customer AI analysis: short desc + expandable full desc + analyze button. */
export function CustomerAnalysisCard({ customerId, shortDescription, description }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const hasAnalysis = shortDescription || description;

  async function handleAnalyze() {
    setAnalyzing(true);
    try {
      await api.post(`/customers/${customerId}/analyze`, {});
      toast.success('Phân tích hoàn tất');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi phân tích');
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">Phân tích khách hàng</h3>
        {hasAnalysis && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-gray-400 hover:text-sky-600"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        )}
      </div>

      {hasAnalysis ? (
        <>
          {shortDescription && (
            <p className="text-sm text-gray-700">{shortDescription}</p>
          )}

          {description && (
            <>
              {expanded && (
                <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">{description}</p>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-7 px-2 text-xs text-sky-600 hover:text-sky-700"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <><ChevronUp className="h-3.5 w-3.5 mr-1" />Thu gọn</>
                ) : (
                  <><ChevronDown className="h-3.5 w-3.5 mr-1" />Xem phân tích chi tiết</>
                )}
              </Button>
            </>
          )}

          {!description && shortDescription && (
            <p className="mt-2 text-xs text-gray-400 italic">Chưa có phân tích chi tiết</p>
          )}
        </>
      ) : (
        <div className="flex flex-col items-center py-4 text-center">
          <Sparkles className="h-8 w-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-400 mb-3">Chưa có phân tích cụ thể</p>
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={handleAnalyze}
            disabled={analyzing}
          >
            {analyzing ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />Đang phân tích...</>
            ) : (
              'Phân tích ngay'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
