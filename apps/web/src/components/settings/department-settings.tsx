'use client';

import { SettingsCrudList } from '@/components/settings/settings-crud-list';

interface DepartmentSettingsProps {
  data: any[];
  canEdit: boolean;
}

export function DepartmentSettings({ data, canEdit }: DepartmentSettingsProps) {
  return (
    <SettingsCrudList
      data={data}
      endpoint="/departments"
      entityName="Phòng ban"
      canEdit={canEdit}
      fields={[
        { key: 'name', label: 'Tên phòng ban', required: true, placeholder: 'VD: Phòng kinh doanh' },
      ]}
      renderItem={(item) => (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">{item.name}</span>
          {item._count?.users !== undefined && (
            <span className="text-xs text-gray-400">({item._count.users} NV)</span>
          )}
        </div>
      )}
    />
  );
}
