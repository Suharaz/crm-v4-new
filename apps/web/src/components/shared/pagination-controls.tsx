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

/** Numbered pagination with page size selector (saved to localStorage). */
export function PaginationControls({ total, page, limit, totalPages }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Resolve effective limit: URL param > localStorage > default
  const [resolvedLimit, setResolvedLimit] = useState(limit ?? DEFAULT_PAGE_SIZE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(PAGE_SIZE_KEY);
    const savedNum = saved && PAGE_SIZES.includes(Number(saved)) ? Number(saved) : DEFAULT_PAGE_SIZE;
    setResolvedLimit(limit ?? savedNum);
    setHydrated(true);

    // First visit: no limit in URL → redirect with saved limit so backend uses correct value
    if (!searchParams.has('limit') && savedNum !== DEFAULT_PAGE_SIZE) {
      const params = new URLSearchParams(searchParams.toString());
      params.set('limit', String(savedNum));
      router.replace(`?${params.toString()}`);
    }
  }, []);

  if (total == null) return null;

  const currentPage = page ?? 1;
  const currentLimit = limit ?? resolvedLimit;
  const actualTotalPages = totalPages ?? Math.max(1, Math.ceil(total / currentLimit));

  function navigate(p: number, newLimit?: number) {
    const lim = newLimit ?? currentLimit;
    const params = new URLSearchParams(searchParams.toString());
    // Always include limit so backend receives consistent value
    params.set('limit', String(lim));
    if (p > 1) {
      params.set('page', String(p));
    } else {
      params.delete('page');
    }
    params.delete('cursor');
    router.push(`?${params.toString()}`);
  }

  function changePageSize(size: string) {
    const num = Number(size);
    setResolvedLimit(num);
    localStorage.setItem(PAGE_SIZE_KEY, size);
    navigate(1, num);
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
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span>Tổng {total.toLocaleString('vi-VN')} kết quả</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs">Hiển thị</span>
          <Select value={hydrated ? String(currentLimit) : String(DEFAULT_PAGE_SIZE)} onValueChange={changePageSize}>
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
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => navigate(1)}>
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => navigate(currentPage - 1)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>

        {getPageNumbers().map((p, i) =>
          p === '...' ? (
            <span key={`dot-${i}`} className="px-1 text-slate-400">…</span>
          ) : (
            <Button
              key={p}
              variant={p === currentPage ? 'default' : 'ghost'}
              size="icon"
              className={`h-8 w-8 text-xs ${p === currentPage ? 'bg-sky-500 text-white hover:bg-sky-600' : ''}`}
              onClick={() => navigate(p)}
            >
              {p}
            </Button>
          )
        )}

        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage >= actualTotalPages} onClick={() => navigate(currentPage + 1)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={currentPage >= actualTotalPages} onClick={() => navigate(actualTotalPages)}>
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
