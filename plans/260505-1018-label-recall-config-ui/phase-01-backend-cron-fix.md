# Phase 01 — Backend: cron skip nhãn deactivate

## Bối cảnh

`_recallLeadsByLabel` trong `recall-config.service.ts` không filter `label.isActive`. Nếu admin deactivate 1 nhãn nhưng config vẫn `isActive: true`, cron vẫn recall lead có nhãn đó. Edge case.

## Files

- `apps/api/src/modules/recall-config/recall-config.service.ts` (modify)

## Thay đổi

Trong `_recallLeadsByLabel`, query `labelRecallConfig.findMany` thêm join check `label.isActive = true`:

```ts
const configs = await this.prisma.labelRecallConfig.findMany({
  where: { isActive: true, label: { isActive: true } },  // ← thêm label filter
});
```

KISS — chỉ 1 dòng.

## Success Criteria

- [ ] Cron không recall lead theo nhãn `isActive: false`
- [ ] Compile OK

## Test thủ công

(skip — đã có 11 unit test ở `auto-recall-pool-expiry-logic.test.ts`, thay đổi nhỏ này không phá test cũ. Sẽ chạy `pnpm test` ở phase 4)
