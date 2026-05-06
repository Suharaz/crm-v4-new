# Phase 03 - Types + page wiring

## Files

- `apps/web/src/types/entities.ts` (modify)
- `apps/web/src/app/(dashboard)/settings/page.tsx` (modify - thêm fetch `/recall-configs/labels`)
- `apps/web/src/components/settings/settings-page-client.tsx` (modify - prop `labelRecallConfigs` + truyền canEditRecall)

## Types thêm

```ts
export interface LabelEntity {
  id: string;
  name: string;
  color: string;
  category?: string | null;        // ← thêm
  isActive?: boolean;              // ← thêm
}

export interface LabelRecallConfigItem {
  id: string;
  labelId: string;
  days: number;
  isActive: boolean;
  label?: { id: string; name: string; color: string };
}
```

## Page server fetch

```ts
const labelRecallConfigs = await serverFetch<{ data: LabelRecallConfigItem[] }>(
  '/recall-configs/labels'
).then(r => r.data).catch(() => []);  // catch - non-admin user 403
```

## Settings page client

- Prop mới `labelRecallConfigs`
- Tính `canEditRecall = isAdmin` (super admin only)
- Truyền cả 2 xuống `<LabelSettings />`

## Success Criteria

- [ ] Type-check pass
- [ ] Non-admin: page render OK (catch 403, recallConfigs=[])
- [ ] Admin: data hiển thị đúng
