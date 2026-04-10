'use client';

import { SettingsCrudList } from '@/components/settings/settings-crud-list';
import { invalidateOrderCaches } from '@/components/orders/create-order-dialog';
import type { SettingsItem } from '@/types/entities';

interface BankAccountSettingsProps {
  data: SettingsItem[];
  canEdit: boolean;
}

export function BankAccountSettings({ data, canEdit }: BankAccountSettingsProps) {
  return (
    <SettingsCrudList
      data={data}
      endpoint="/bank-accounts"
      entityName="Tài khoản ngân hàng"
      canEdit={canEdit}
      onMutate={invalidateOrderCaches}
      fields={[
        { key: 'name', label: 'Tên hiển thị', required: true, placeholder: 'VD: VCB 999, MB 123' },
      ]}
    />
  );
}
