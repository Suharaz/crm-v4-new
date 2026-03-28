'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { api } from '@/lib/api-client';
import { Plus, CheckCircle2, XCircle, Circle, Clock } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';

interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  dueDate?: string;
  entityType?: string;
  entityId?: string;
  assignedTo?: string;
  createdAt: string;
}

type FilterTab = 'ALL' | 'PENDING' | 'COMPLETED' | 'CANCELLED';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Đang chờ',
  COMPLETED: 'Hoàn thành',
  CANCELLED: 'Đã hủy',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-sky-100 text-sky-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const TAB_LABELS: { value: FilterTab; label: string }[] = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'PENDING', label: 'Đang chờ' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'CANCELLED', label: 'Đã hủy' },
];

export function TaskListClient({ initialTasks }: { initialTasks: Task[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [activeTab, setActiveTab] = useState<FilterTab>('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', dueDate: '' });
  const [submitting, setSubmitting] = useState(false);

  const filtered = activeTab === 'ALL' ? tasks : tasks.filter(t => t.status === activeTab);

  async function handleCreate() {
    if (!form.title.trim()) {
      toast.error('Vui lòng nhập tiêu đề công việc');
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, string> = { title: form.title.trim() };
      if (form.description) body.description = form.description;
      if (form.dueDate) body.dueDate = new Date(form.dueDate).toISOString();
      const created = await api.post<Task>('/tasks', body);
      setTasks(prev => [created, ...prev]);
      setForm({ title: '', description: '', dueDate: '' });
      setDialogOpen(false);
      toast.success('Đã tạo công việc');
    } catch (err: any) {
      toast.error(err.message || 'Lỗi tạo công việc');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleComplete(id: string) {
    try {
      await api.post(`/tasks/${id}/complete`);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'COMPLETED' } : t));
      toast.success('Đã hoàn thành công việc');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi cập nhật');
    }
  }

  async function handleCancel(id: string) {
    try {
      await api.post(`/tasks/${id}/cancel`);
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'CANCELLED' } : t));
      toast.success('Đã hủy công việc');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi hủy công việc');
    }
  }

  return (
    <div>
      {/* Filter tabs + create button */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {TAB_LABELS.map(tab => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? 'bg-white text-sky-600 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />Tạo công việc</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Tạo công việc mới</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <label className="text-sm font-medium text-gray-700">Tiêu đề *</label>
                <Input
                  className="mt-1"
                  placeholder="Nhập tiêu đề công việc..."
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Mô tả</label>
                <Input
                  className="mt-1"
                  placeholder="Mô tả chi tiết (tùy chọn)"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Hạn hoàn thành</label>
                <Input
                  type="datetime-local"
                  className="mt-1"
                  value={form.dueDate}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
                <Button onClick={handleCreate} disabled={submitting}>
                  {submitting ? 'Đang tạo...' : 'Tạo công việc'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Task list */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">
            Không có công việc nào
          </div>
        ) : (
          filtered.map(task => (
            <div
              key={task.id}
              className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm flex items-start justify-between gap-4"
            >
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <div className="mt-0.5 shrink-0">
                  {task.status === 'COMPLETED' ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : task.status === 'CANCELLED' ? (
                    <XCircle className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Circle className="h-5 w-5 text-sky-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium text-gray-900 truncate ${task.status === 'COMPLETED' ? 'line-through text-gray-400' : ''}`}>
                    {task.title}
                  </p>
                  {task.description && (
                    <p className="text-sm text-gray-500 truncate">{task.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    {task.dueDate && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(task.dueDate)}
                      </span>
                    )}
                    {task.entityType && (
                      <span className="text-sky-500">{task.entityType} #{task.entityId}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[task.status]}`}>
                  {STATUS_LABEL[task.status]}
                </span>
                {task.status === 'PENDING' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-green-600 border-green-200 hover:bg-green-50"
                      onClick={() => handleComplete(task.id)}
                    >
                      Hoàn thành
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs text-red-500 border-red-200 hover:bg-red-50"
                      onClick={() => handleCancel(task.id)}
                    >
                      Hủy
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
