'use client';

import { toast } from 'sonner';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsCrudList } from '@/components/settings/settings-crud-list';
import { invalidateLeadFormBootstrap } from '@/lib/api/lead-form-bootstrap-cache';
import type { SettingsItem } from '@/types/entities';

interface LeadSourceSettingsProps {
  data: SettingsItem[];
  canEdit: boolean;
}

export function LeadSourceSettings({ data, canEdit }: LeadSourceSettingsProps) {
  function handleManualRefresh() {
    invalidateLeadFormBootstrap();
    toast.success('Đã làm mới cache form lead - lần mở drawer kế tiếp sẽ tải data mới');
  }

  return (
    <div className="space-y-3">
      {/* Manual refresh - dùng khi data nguồn/sản phẩm đổi từ tab/thiết bị khác,
          hoặc khi user muốn force reload không đợi TTL 4h hết hạn. */}
      <div className="flex items-center justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleManualRefresh}
          title="Xóa cache nguồn + sản phẩm trên trình duyệt này"
          className="text-slate-600"
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1" />
          Làm mới cache form
        </Button>
      </div>

      <SettingsCrudList
        data={data}
        endpoint="/lead-sources"
        entityName="Nguồn lead"
        canEdit={canEdit}
        // Auto-invalidate cache sau khi CRUD source -> drawer next time tải fresh data
        onMutate={invalidateLeadFormBootstrap}
        fields={[
          { key: 'name', label: 'Tên nguồn', required: true, placeholder: 'VD: Facebook Ads' },
          { key: 'description', label: 'Mô tả', placeholder: 'Mô tả nguồn lead' },
          { key: 'skipPool', label: 'Bỏ qua Kho Mới', type: 'checkbox', placeholder: 'Tự động phân phối AI, không vào pool' },
        ]}
        renderItem={(item) => (
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-700">{item.name}</span>
            {Boolean(item.description) && <span className="text-xs text-slate-400">{String(item.description)}</span>}
            {Boolean(item.skipPool) && <span className="text-xs bg-sky-100 text-sky-700 rounded px-1.5 py-0.5">Auto phân phối</span>}
          </div>
        )}
      />
    </div>
  );
}
