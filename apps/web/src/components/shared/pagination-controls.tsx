'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';

interface Props {
  nextCursor?: string | null;
}

export function PaginationControls({ nextCursor }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function loadMore() {
    const params = new URLSearchParams(searchParams.toString());
    if (nextCursor) params.set('cursor', nextCursor);
    router.push(`?${params.toString()}`);
  }

  if (!nextCursor) return null;

  return (
    <div className="mt-4 flex justify-center">
      <Button variant="outline" onClick={loadMore}>
        Tải thêm
      </Button>
    </div>
  );
}
