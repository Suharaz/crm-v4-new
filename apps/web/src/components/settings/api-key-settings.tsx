'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { FormField } from '@/components/shared/form-field';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { useFormAction } from '@/hooks/use-form-action';
import { api } from '@/lib/api-client';
import { formatDate } from '@/lib/utils';
import { Plus, Copy, Trash2, ToggleLeft, ToggleRight, Key, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix?: string;
  isActive: boolean;
  createdAt?: string;
  lastUsedAt?: string | null;
  creator?: { name: string } | null;
  key?: string;
}

interface ApiKeySettingsProps {
  apiKeys: ApiKeyItem[];
}

export function ApiKeySettings({ apiKeys: initialKeys }: ApiKeySettingsProps) {
  const [keys, setKeys] = useState<ApiKeyItem[]>(initialKeys);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const deleteAction = useFormAction({ successMessage: 'Đã xóa API key' });

  async function handleCreate() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await api.post<{ data: ApiKeyItem }>('/api-keys', { name: name.trim() });
      setNewKey(res.data.key ?? null);
      setKeys(prev => [res.data, ...prev]);
      setName('');
      toast.success('Đã tạo API key');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Lỗi tạo API key');
    }
    setCreating(false);
  }

  async function toggleActive(id: string, isActive: boolean) {
    try {
      await api.patch(`/api-keys/${id}/${isActive ? 'deactivate' : 'activate'}`);
      setKeys(prev => prev.map(k => k.id === id ? { ...k, isActive: !isActive } : k));
      toast.success(isActive ? 'Đã vô hiệu' : 'Đã kích hoạt');
    } catch { /* */ }
  }

  async function handleDelete(id: string) {
    await deleteAction.execute('delete', `/api-keys/${id}`);
    setKeys(prev => prev.filter(k => k.id !== id));
  }

  function copyKey() {
    if (newKey) { navigator.clipboard.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  function closeCreateDialog() {
    setCreateOpen(false);
    setNewKey(null);
    setCopied(false);
    setName('');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Quản lý API key cho tích hợp bên thứ 3</p>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />Tạo API Key
        </Button>
      </div>

      {/* Keys list */}
      {keys.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-gray-400">Chưa có API key nào</div>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
              <Key className="h-4 w-4 text-gray-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{k.name}</span>
                  <code className="text-xs text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{k.keyPrefix}...</code>
                  {!k.isActive && <span className="text-xs text-red-500 font-medium">Vô hiệu</span>}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Tạo {k.createdAt ? formatDate(k.createdAt) : '—'}
                  {k.lastUsedAt && <> · Dùng lần cuối {formatDate(k.lastUsedAt)}</>}
                  {k.creator?.name && <> · bởi {k.creator.name}</>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleActive(String(k.id), k.isActive)}
                  title={k.isActive ? 'Vô hiệu' : 'Kích hoạt'}>
                  {k.isActive ? <ToggleRight className="h-4 w-4 text-emerald-500" /> : <ToggleLeft className="h-4 w-4 text-gray-400" />}
                </Button>
                <ConfirmDialog
                  trigger={<Button variant="ghost" size="icon" className="h-8 w-8"><Trash2 className="h-4 w-4 text-red-400" /></Button>}
                  title="Xóa API Key" description={`Xóa "${k.name}"? Không thể hoàn tác.`}
                  confirmLabel="Xóa" onConfirm={() => handleDelete(String(k.id))} isLoading={deleteAction.isLoading}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={closeCreateDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{newKey ? 'API Key đã tạo' : 'Tạo API Key'}</DialogTitle></DialogHeader>

          {newKey ? (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-800 mb-2">Sao chép key ngay — sẽ không hiện lại!</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-white rounded px-2 py-1.5 border border-amber-200 break-all select-all">{newKey}</code>
                  <Button size="sm" variant="outline" onClick={copyKey}>
                    {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <p>Sử dụng trong header: <code className="bg-gray-100 px-1">x-api-key: {'{key}'}</code></p>
                <p>Endpoints được phép:</p>
                <ul className="list-disc pl-4">
                  <li><code>POST /api/v1/external/leads</code> — Tạo lead</li>
                  <li><code>POST /api/v1/call-logs/ingest</code> — Gửi log cuộc gọi</li>
                  <li><code>POST /api/v1/webhooks/bank-transactions</code> — Webhook ngân hàng</li>
                </ul>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <FormField label="Tên key" required>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="VD: Website lead form, Tổng đài StringeeX" autoFocus />
              </FormField>
            </div>
          )}

          <DialogFooter>
            {newKey ? (
              <Button onClick={closeCreateDialog}>Đóng</Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeCreateDialog}>Hủy</Button>
                <Button onClick={handleCreate} disabled={creating || !name.trim()}>{creating ? 'Đang tạo...' : 'Tạo'}</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
