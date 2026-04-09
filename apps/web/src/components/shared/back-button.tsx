'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';

/** Navigate back to previous page in browser history. */
export function BackButton() {
  const router = useRouter();
  return (
    <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-1 text-gray-500 hover:text-gray-700 -ml-2">
      <ArrowLeft className="h-4 w-4" />
      Quay lại
    </Button>
  );
}
