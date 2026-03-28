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
      ]}
      renderItem={(item) => (
        <div>
          <span className="text-sm text-gray-700">{item.name}</span>
          {item.description && <span className="ml-2 text-xs text-gray-400">{item.description}</span>}
        </div>
      )}
    />
  );
}
