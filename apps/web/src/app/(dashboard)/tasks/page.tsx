import { serverFetch } from '@/lib/auth';
import { TaskListClient } from '@/components/tasks/tasks-management-list-with-create-dialog';

/** Tasks management page — shows user's tasks with create/complete/cancel actions. */
export default async function TasksPage() {
  let data: any[] = [];
  try {
    const result = await serverFetch<{ data: any[] }>('/tasks');
    data = result.data;
  } catch { /* empty list on error */ }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Công việc</h1>
        <p className="text-sm text-gray-500">Quản lý và theo dõi công việc của bạn</p>
      </div>
      <TaskListClient initialTasks={data} />
    </div>
  );
}
