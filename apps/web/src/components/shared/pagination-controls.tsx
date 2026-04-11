'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { useEffect, useState } from 'react';

const PAGE_SIZE_KEY = 'crm_page_size';
const PAGE_SIZES = [10, 50, 100, 500];
const DEFAULT_PAGE_SIZE = 10;

interface Props {
  total?: number;
  page?: number;
  limit?: number;
  totalPages?: number;
}

/** Read saved page size from localStorage (SSR-safe). */
export function getSavedPageSize(): number {
  if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE;
  const saved = localStorage.getItem(PAGE_SIZE_KEY);
  return saved && PAGE_SIZES.includes(Number(saved)) ? Number(saved) : DEFAULT_PAGE_SIZE;
}

/** Numbered pagination with page size selector (saved to localStorage). */
export function PaginationControls({ total, page, limit, totalPages }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [pageSize, setPageSize] = useState(limit ?? DEFAULT_PAGE_SIZE);
  useEffect(() => {
    const saved = getSavedPageSize();
    setPageSize(saved);
  }, []);

  if (total == null) return null;

  const currentPage = page ?? 1;
  const currentLimit = limit ?? pageSize;
  const actualTotalPages = totalPages ?? Math.max(1, Math.ceil(total / currentLimit));

  /** Navigate to page — only puts `page` in URL if > 1, never puts `limit` in URL. */
  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (p > 1) {
      params.set('page', String(p));
    } else {
      params.delete('page');
    }
    params.delete('limit');
    params.delete('cursor');
    router.push(`?${params.toString()}`);
  }

  function changePageSize(size: string) {
    const num = Number(size);
    setPageSize(num);
    localStorage.setItem(PAGE_SIZE_KEY, size);
    // Go to page 1 with new size — need to force reload since limit changed
    const params = new URLSearchParams(searchParams.toString());
    params.delete('page');
    params.delete('limit');
    params.delete('cursor');
    // Temporarily set limit in URL to trigger server re-fetch with new size
    params.set('limit', size);
    router.push(`?${params.toString()}`);
  }

  // Generate page numbers with ellipsis
  function getPageNumbers(): (number | '...')[] {
    const pages: (number | '...')[] = [];
    if (actualTotalPages <= 7) {
      for (let i = 1; i <= actualTotalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(actualTotalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < actualTotalPages - 2) pages.push('...');
      pages.push(actualTotalPages);
    }
    return pages;
  }

  return (
    <div className="mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
      {/* Left: info + page size */}
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <span>Tổng {total.toLocaleString('vi-VN')} kết quả</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs">Hiển thị</span>
          <Select value={String(currentLimit)} onValueChange={changePageSize}>
            <SelectTrigger className="h-8 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map(s => (
                <SelectItem key={s} value={String(s)}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs">/ trang</span>
        </div>
      </div>

      {/* Right: page numbers — always shown even if only 1 page */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => goToPage(1)}>
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {getPageNumbers().map((p, i) =>
          p === '...' ? (
            <span key={`dot-${i}`} className="px-1 text-gray-400">…</span>
          ) : (
            <Button
              key={p}
              variant={p === currentPage ? 'default' : 'ghost'}
              size="icon"
              className={`h-8 w-8 text-xs ${p === currentPage ? 'bg-sky-500 text-white hover:bg-sky-600' : ''}`}
              onClick={() => goToPage(p)}
            >
              {p}
            </Button>
          )
        )}

        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage >= actualTotalPages} onClick={() => goToPage(currentPage + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage >= actualTotalPages} onClick={() => goToPage(actualTotalPages)}>
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
