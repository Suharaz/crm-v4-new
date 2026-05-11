'use client';

import Link from 'next/link';

interface Props {
  leadId: string;
  name: string;
}

/**
 * Lead name as a link to /leads/[id].
 * Quick-preview action lives in a separate column (see lead-edit-button.tsx).
 */
export function LeadNameLink({ leadId, name }: Props) {
  return (
    <Link
      href={`/leads/${leadId}`}
      className="font-medium text-slate-900 hover:text-sky-600 hover:underline truncate"
    >
      {name}
    </Link>
  );
}
