# Phase 02 - Backend Services

## Context Links

- Plan: [plan.md](plan.md) | Phase 01: [phase-01-schema-and-migration.md](phase-01-schema-and-migration.md)
- Schema (mới): `Lead.labelId BigInt?`, no `LeadLabel`, `RecallConfig.autoLabelId BigInt?`

## Overview

- **Priority:** High (blocks API + FE)
- **Status:** Pending
- Cập nhật mọi nơi đọc/ghi `leadLabel` sang dùng `lead.labelId` trực tiếp.

## Key Insights

- 4 module ảnh hưởng: `labels`, `leads`, `import`, `recall-config`.
- Recall conflict rule: **skip-if-exists** - `if (lead.labelId !== null) return;` cho mỗi lead trước khi gắn auto label.
- CSV import: lấy nhãn đầu, log warning vào job `failedRows` hoặc summary message.

## Requirements

- `attachToLead(leadId, labelId | null)` - set/replace/null
- Không còn `detachFromLead(leadId, labelId)` riêng (bỏ hoặc alias = set null)
- `recall-config.service` chỉ gắn auto label nếu `lead.label_id IS NULL`
- `import.processor` lấy phần tử [0] của mảng labels parse được, append warning

## Related Code Files

**Modify:**
- `apps/api/src/modules/labels/labels.service.ts:133-140` - replace attach/detach Lead
- `apps/api/src/modules/leads/leads.service.ts` - 5 chỗ:
  - `:340` - sau create lead
  - `:559`, `:610` - transfer/recall flows (`tx.leadLabel.updateMany`)
  - `:766` - bulk recall
- `apps/api/src/modules/import/import.processor.ts:281-303` - parse + take [0]
- `apps/api/src/modules/recall-config/recall-config.service.ts`:
  - `:46`, `:53`, `:63` - DTO type `autoLabelIds: bigint[]` → `autoLabelId: bigint | null`
  - `:188`, `:217-222` - skip-if-exists logic for leads
  - `:239`, `:267-271` - customer flow chuyển từ array sang single (consistent UX)

**Read for context:**
- `apps/api/src/modules/leads/leads.service.ts` (full) - hiểu transaction patterns
- `apps/api/src/modules/recall-config/recall-config.service.ts` (full)

## Architecture

```
labels.service.attachToLead(leadId, labelId | null)
  └─> prisma.lead.update({ where: { id: leadId }, data: { labelId } })

recall-config._recallLeads (skip-if-exists):
  for chunk of leads where label_id IS NULL:
    update lead: status=FLOATING, label_id=config.autoLabelId
  for chunk of leads where label_id IS NOT NULL:
    update lead: status=FLOATING (giữ nguyên label_id)

import.processor:
  labels = parseLabelsCol(row.labels)  // ['VIP', 'Hot']
  if (labels.length > 1) job.warnings.push(`Row ${i}: kept "${labels[0]}", dropped: ${labels.slice(1)}`)
  lead.labelId = resolveLabelId(labels[0])
```

## Implementation Steps

### 1. `labels.service.ts`

```typescript
// Replace attachToLead + detachFromLead with single setter
async setLeadLabel(leadId: bigint, labelId: bigint | null) {
  await this.prisma.lead.update({
    where: { id: leadId },
    data: { labelId },
  });
}
// Keep attachToCustomer / detachFromCustomer unchanged
```

### 2. `leads.service.ts`

Tìm tất cả `leadLabel.createMany`, `leadLabel.updateMany` → thay bằng `lead.update({ labelId })` hoặc bulk `lead.updateMany({ where, data: { labelId } })`.

**Đặc biệt** `:340` (post-create attach) - nếu DTO tạo lead có `labelId`, set ngay trong `lead.create()` thay vì attach sau.

### 3. `import.processor.ts:281-303`

```typescript
const labelStrs = parseLabelsCol(row.labels); // existing parser
let labelId: bigint | null = null;
if (labelStrs.length > 0) {
  labelId = resolvedLabelMap.get(labelStrs[0]) ?? null;
  if (labelStrs.length > 1) {
    job.summary.warnings.push(
      `Row ${rowIdx}: only first label "${labelStrs[0]}" applied; ignored: ${labelStrs.slice(1).join(', ')}`,
    );
  }
}
// In lead.create: { ..., labelId }
```

Bỏ vòng `prisma.leadLabel.createMany`.

### 4. `recall-config.service.ts`

**DTO + storage:**
```typescript
// type RecallConfigData
autoLabelId?: bigint | null
```

**`_recallLeads` (line ~217):**
```typescript
const chunkLeads = await tx.lead.findMany({
  where: { ...recallWhere, deletedAt: null },
  select: { id: true, assignedUserId: true, departmentId: true, labelId: true },
  take: CHUNK_SIZE,
});

const leadIdsAll = chunkLeads.map(l => l.id);
await tx.lead.updateMany({
  where: { id: { in: leadIdsAll } },
  data: { status: LeadStatus.FLOATING, departmentId: null, assignedUserId: null },
});

// Skip-if-exists: chỉ gắn label cho lead chưa có nhãn
if (config.autoLabelId) {
  const idsWithoutLabel = chunkLeads.filter(l => l.labelId === null).map(l => l.id);
  if (idsWithoutLabel.length > 0) {
    await tx.lead.updateMany({
      where: { id: { in: idsWithoutLabel } },
      data: { labelId: config.autoLabelId },
    });
  }
}
```

**`_recallCustomers`:** customer vẫn multi-label → giữ logic `customerLabel.createMany` nhưng chỉ với 1 labelId (mảng → single, wrap thành `[autoLabelId]` khi attach).

## Todo List

- [ ] Refactor `labels.service.ts` - `setLeadLabel(leadId, labelId | null)`
- [ ] Cập nhật `leads.service.ts` - 5 call sites
- [ ] Cập nhật `import.processor.ts` - parse + take [0] + warning
- [ ] Cập nhật `recall-config.service.ts` - DTO singular, skip-if-exists, customer wrap
- [ ] `pnpm --filter @crm/api build` - không TS error
- [ ] Code review pass nội bộ (đọc lại diff)

## Success Criteria

- `pnpm --filter @crm/api build` pass
- Unit test (nếu có) cho recall service: lead có labelId không bị đè
- Manual test: create lead → set label → đổi label → API replace đúng

## Risk Assessment

- **Risk:** Bỏ sót call site dùng `leadLabel`. **Mitigation:** Grep `leadLabel` cuối phase, đảm bảo 0 hit ngoài comment.
- **Risk:** Transaction lock leads bảng lớn khi recall. **Mitigation:** giữ CHUNK_SIZE=500, không thay đổi batching.

## Security Considerations

- IDOR: `setLeadLabel` phải gọi qua controller có guard (`OwnershipGuard` / role check)
- Không log labelId trong production (không phải PII nhưng giữ minimal logging)

## Next Steps

→ Phase 03: cập nhật controller DTO + API contract.
