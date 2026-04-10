import { serverFetch } from '@/lib/auth';
import { CallLogListClient } from '@/components/call-logs/call-log-list-client';
import type { CallLogRecord } from '@/types/entities';

/** Call logs page with inline expand for conversation details. */
export default async function CallLogsPage() {
  let data: CallLogRecord[] = [];
  try {
    const result = await serverFetch<{ data: CallLogRecord[] }>('/call-logs?limit=50');
    data = result.data;
  } catch { /* empty */ }

  return <CallLogListClient callLogs={data as unknown as Parameters<typeof CallLogListClient>[0]['callLogs']} />;
}
