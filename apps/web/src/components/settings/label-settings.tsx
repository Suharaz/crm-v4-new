'use client';

import { SettingsCrudList } from '@/components/settings/settings-crud-list';
import type { SettingsItem } from '@/types/entities';

interface LabelSettingsProps {
  data: SettingsItem[];
  canEdit: boolean;
}

export function LabelSettings({ data, canEdit }: LabelSettingsProps) {
  return (
    <SettingsCrudList
      data={data}
      endpoint="/labels"
      entityName="Nhãn"
      canEdit={canEdit}
      fields={[
        { key: 'name', label: 'Tên nhãn', required: true, placeholder: 'VD: VIP' },
        { key: 'color', label: 'Màu sắc', type: 'color' },
        { key: 'category', label: 'Danh mục', placeholder: 'VD: lead, customer' },
      ]}
      renderItem={(item) => (
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: item.color as string | undefined }} />
          <span className="text-sm text-slate-700">{item.name}</span>
          {Boolean(item.category) && <span className="text-xs text-slate-400">{String(item.category)}</span>}
        </div>
      )}
    />
  );
}
