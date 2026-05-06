# Phase 04 — Frontend Types & Data Layer

## Context Links

- Plan: [plan.md](plan.md) | Phase 03 (API): [phase-03-backend-api-contract.md](phase-03-backend-api-contract.md)

## Overview

- **Priority:** Medium
- **Status:** Pending
- Cập nhật type `Lead.labels` → `Lead.label`. Adjust api-client wrapper.

## Related Code Files

**Modify:**
- `apps/web/src/types/entities.ts` — Lead type
- `apps/web/src/lib/api-client.ts` (hoặc helper file gọi label endpoint)

**Read for context:**
- `apps/web/src/types/entities.ts` (full Lead/Customer types)

## Implementation Steps

### 1. `types/entities.ts`

```typescript
// BEFORE:
export type Lead = {
  // ...
  labels?: Label[];
};

// AFTER:
export type Lead = {
  // ...
  labelId?: string | null;
  label?: Label | null;
};

// Customer giữ nguyên multi:
export type Customer = {
  // ...
  labels?: Label[];
};
```

### 2. API client helper

```typescript
// lib/api-client.ts hoặc wrapper
export const setLeadLabel = (leadId: string, labelId: string | null) =>
  apiClient.patch(`/leads/${leadId}/label`, { labelId });
```

Bỏ helper cũ `attachLabelsToLead([])` cho Lead (nếu có).

## Todo List

- [ ] Sửa `Lead` type
- [ ] Thêm helper `setLeadLabel`
- [ ] `pnpm --filter @crm/web build` — không TS error
- [ ] Grep `lead.labels`, `Lead\.labels` — chỉ còn ở comment hoặc legacy đã clean

## Success Criteria

- TypeScript compile pass
- Không còn reference `lead.labels` trên FE (dùng `lead.label` thay thế)

## Risk Assessment

- **Risk:** Optional `labels?` còn rải rác → TS không lỗi nhưng runtime undefined. **Mitigation:** TS strict + grep cẩn thận.

## Next Steps

→ Phase 05: UI components (single-select Select, single badge display).
