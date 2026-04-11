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
  /** Legacy cursor support — renders simple "load more" button */
  nextCursor?: string | null;
}

/** Numbered pagination with page size selector (saved to localStorage). */
export function PaginationControls({ total, page, limit, totalPages, nextCursor }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Page size from localStorage
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  useEffect(() => {
    const saved = localStorage.getItem(PAGE_SIZE_KEY);
    if (saved && PAGE_SIZES.includes(Number(saved))) {
      setPageSize(Number(saved));
      // Sync URL if limit differs from saved
      const urlLimit = searchParams.get('limit');
      if (!urlLimit || Number(urlLimit) !== Number(saved)) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('limit', saved);
        params.set('page', '1');
        router.replace(`?${params.toString()}`);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Legacy cursor mode
  if (nextCursor && !total) {
    return (
      <div className="mt-4 flex justify-center">
        <Button variant="outline" onClick={() => {
          const params = new URLSearchParams(searchParams.toString());
          params.set('cursor', nextCursor);
          router.push(`?${params.toString()}`);
        }}>
          Tải thêm
        </Button>
      </div>
    );
  }

  // No pagination needed
  if (!total || !totalPages || totalPages <= 1) return null;

  const currentPage = page ?? 1;
  const currentLimit = limit ?? pageSize;

  function goToPage(p: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(p));
    params.set('limit', String(currentLimit));
    params.delete('cursor');
    router.push(`?${params.toString()}`);
  }

  function changePageSize(size: string) {
    const num = Number(size);
    setPageSize(num);
    localStorage.setItem(PAGE_SIZE_KEY, size);
    const params = new URLSearchParams(searchParams.toString());
    params.set('limit', size);
    params.set('page', '1');
    params.delete('cursor');
    router.push(`?${params.toString()}`);
  }

  // Generate page numbers with ellipsis
  function getPageNumbers(): (number | '...')[] {
    const pages: (number | '...')[] = [];
    if (totalPages! <= 7) {
      for (let i = 1; i <= totalPages!; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages! - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages! - 2) pages.push('...');
      pages.push(totalPages!);
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

      {/* Right: page numbers */}
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

        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages!} onClick={() => goToPage(currentPage + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages!} onClick={() => goToPage(totalPages!)}>
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
