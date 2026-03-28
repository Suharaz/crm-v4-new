'use client';

import { SettingsCrudList } from '@/components/settings/settings-crud-list';

interface EmployeeLevelSettingsProps {
  data: any[];
  canEdit: boolean;
}

export function EmployeeLevelSettings({ data, canEdit }: EmployeeLevelSettingsProps) {
  return (
    <SettingsCrudList
      data={data}
      endpoint="/employee-levels"
      entityName="Cấp bậc"
      canEdit={canEdit}
      fields={[
        { key: 'name', label: 'Tên cấp bậc', required: true, placeholder: 'VD: Nhân viên' },
        { key: 'rank', label: 'Thứ hạng', type: 'number', required: true, placeholder: 'VD: 1' },
      ]}
      renderItem={(item) => (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">{item.name}</span>
          <span className="text-xs text-gray-400">Rank: {item.rank}</span>
        </div>
      )}
    />
  );
}
