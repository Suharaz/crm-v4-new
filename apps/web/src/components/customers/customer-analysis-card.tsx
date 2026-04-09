'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface Props {
  customerId: string;
  shortDescription?: string | null;
  description?: string | null;
}

/** Card showing customer analysis: short desc + expandable full desc. */
export function CustomerAnalysisCard({ customerId, shortDescription, description }: Props) {
  const [expanded, setExpanded] = useState(false);
  const hasAnalysis = shortDescription || description;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="mb-3 font-semibold text-gray-900">Phân tích khách hàng</h3>

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
          <Link href={`/customers/${customerId}/edit`}>
            <Button variant="outline" size="sm" className="text-xs">
              Phân tích ngay
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
