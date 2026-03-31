'use client';

import { SettingsCrudList } from '@/components/settings/settings-crud-list';

interface LeadSourceSettingsProps {
  data: any[];
  canEdit: boolean;
}

export function LeadSourceSettings({ data, canEdit }: LeadSourceSettingsProps) {
  return (
    <SettingsCrudList
      data={data}
      endpoint="/lead-sources"
      entityName="Nguồn lead"
      canEdit={canEdit}
      fields={[
        { key: 'name', label: 'Tên nguồn', required: true, placeholder: 'VD: Facebook Ads' },
        { key: 'description', label: 'Mô tả', placeholder: 'Mô tả nguồn lead' },
        { key: 'skipPool', label: 'Bỏ qua Kho Mới', type: 'checkbox', placeholder: 'Tự động phân phối AI, không vào pool' },
      ]}
      renderItem={(item) => (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">{item.name}</span>
          {item.description && <span className="text-xs text-gray-400">{item.description}</span>}
          {item.skipPool && <span className="text-xs bg-sky-100 text-sky-700 rounded px-1.5 py-0.5">Auto phân phối</span>}
        </div>
      )}
    />
  );
}
