import { serverFetch } from '@/lib/auth';
import { TaskListClient } from '@/components/tasks/tasks-management-list-with-create-dialog';
import type { TaskRecord } from '@/types/entities';

/** Tasks management page — shows user's tasks with create/complete/cancel actions. */
export default async function TasksPage() {
  let data: TaskRecord[] = [];
  try {
    const result = await serverFetch<{ data: TaskRecord[] }>('/tasks');
    data = result.data;
  } catch { /* empty list on error */ }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Công việc</h1>
        <p className="text-sm text-slate-500">Quản lý và theo dõi công việc của bạn</p>
      </div>
      <TaskListClient initialTasks={data as unknown as Parameters<typeof TaskListClient>[0]['initialTasks']} />
    </div>
  );
}
