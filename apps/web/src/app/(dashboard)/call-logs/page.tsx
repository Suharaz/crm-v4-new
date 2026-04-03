import { serverFetch } from '@/lib/auth';
import { CallLogListClient } from '@/components/call-logs/call-log-list-client';

/** Call logs page with inline expand for conversation details. */
export default async function CallLogsPage() {
  let data: any[] = [];
  try {
    const result = await serverFetch<{ data: any[] }>('/call-logs?limit=50');
    data = result.data;
  } catch { /* empty */ }

  return <CallLogListClient callLogs={data} />;
}
