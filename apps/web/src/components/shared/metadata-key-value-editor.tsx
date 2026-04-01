'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

interface Props {
  entityType: 'leads' | 'customers';
  entityId: string;
  metadata: Record<string, any> | null;
  canEdit?: boolean;
}

/** Editable key-value metadata display for leads/customers. */
export function MetadataKeyValueEditor({ entityType, entityId, metadata, canEdit = true }: Props) {
  const router = useRouter();
  const entries = Object.entries(metadata || {});
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  async function saveMetadata(updated: Record<string, any>) {
    setSaving(true);
    try {
      await api.patch(`/${entityType}/${entityId}`, { metadata: updated });
      toast.success('Đã lưu thông tin');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Lỗi lưu');
    } finally {
      setSaving(false);
    }
  }

  function handleAdd() {
    if (!newKey.trim()) return;
    const updated = { ...(metadata || {}), [newKey.trim()]: newValue.trim() };
    saveMetadata(updated);
    setAdding(false);
    setNewKey('');
    setNewValue('');
  }

  function handleEdit(key: string) {
    const updated = { ...(metadata || {}), [key]: editValue.trim() };
    saveMetadata(updated);
    setEditingKey(null);
  }

  function handleDelete(key: string) {
    const updated = { ...(metadata || {}) };
    delete updated[key];
    saveMetadata(updated);
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">Thông tin thêm</h3>
        {canEdit && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" />Thêm
          </Button>
        )}
      </div>

      {entries.length === 0 && !adding && (
        <p className="text-sm text-gray-400">Chưa có thông tin thêm</p>
      )}

      <dl className="space-y-2 text-sm">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between group">
            {editingKey === key ? (
              <div className="flex items-center gap-2 flex-1">
                <dt className="text-gray-500 w-32 shrink-0">{key}</dt>
                <input
                  type="text"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
                  autoFocus
                />
                <button onClick={() => handleEdit(key)} className="text-green-600 hover:text-green-700"><Check className="h-4 w-4" /></button>
                <button onClick={() => setEditingKey(null)} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <>
                <div className="flex gap-2">
                  <dt className="text-gray-500">{key}</dt>
                  <dd className="text-gray-700">{String(value)}</dd>
                </div>
                {canEdit && (
                  <div className="hidden group-hover:flex gap-1">
                    <button onClick={() => { setEditingKey(key); setEditValue(String(value)); }} className="text-gray-400 hover:text-sky-600"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => handleDelete(key)} className="text-gray-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </dl>

      {/* Add new row */}
      {adding && (
        <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2">
          <input
            type="text"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            placeholder="Tên trường"
            className="w-32 rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
            autoFocus
          />
          <input
            type="text"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            placeholder="Giá trị"
            className="flex-1 rounded border border-gray-200 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <button onClick={handleAdd} disabled={saving} className="text-green-600 hover:text-green-700"><Check className="h-4 w-4" /></button>
          <button onClick={() => { setAdding(false); setNewKey(''); setNewValue(''); }} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}
