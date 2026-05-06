# Phase 03 - Backend API Contract

## Context Links

- Plan: [plan.md](plan.md) | Phase 02: [phase-02-backend-services.md](phase-02-backend-services.md)

## Overview

- **Priority:** High (blocks FE)
- **Status:** Pending
- Đổi DTO endpoint label cho Lead từ `labelIds: string[]` → `labelId: string | null`. Update response shape.

## Requirements

- `PATCH /api/v1/leads/:id/label` - body `{ labelId: string | null }`
- Lead response include: `label: { id, name, color } | null`
- Customer endpoint **giữ nguyên** `labelIds: string[]`

## Related Code Files

**Modify:**
- `apps/api/src/modules/leads/leads.controller.ts:201-205`
- `apps/api/src/modules/leads/dto/*.ts` - Lead response DTO + update DTO
- `packages/types/src/lead.ts` (nếu shared types có Lead.labels) - đổi sang `label`

**Read for context:**
- `apps/api/src/modules/customers/customers.controller.ts:103-107` - customer pattern không đổi
- `apps/api/src/modules/leads/leads.service.ts` - đảm bảo Prisma include `label: true`

## Architecture

```
Request:  PATCH /leads/:id/label  { labelId: "5" | null }
Service:  setLeadLabel(id, labelId ? BigInt(labelId) : null)
Response: { id, ..., labelId, label: { id, name, color } | null }
```

## Implementation Steps

### 1. Update controller

```typescript
// leads.controller.ts
@Patch(':id/label')
async setLabel(
  @Param('id', ParseBigIntPipe) id: bigint,
  @Body() body: { labelId: string | null },
) {
  const labelId = body.labelId ? BigInt(body.labelId) : null;
  await this.labelsService.setLeadLabel(id, labelId);
  return { ok: true };
}
```

Bỏ endpoint cũ `attachLabels` nếu chỉ Lead dùng. Customer giữ nguyên ở `customers.controller`.

### 2. Update Prisma include

Mọi `leads.service.ts` find query đang `include: { labels: { include: { label: true } } }` → đổi thành `include: { label: true }`.

### 3. Response shape

```typescript
type LeadResponseDto = {
  id: string;
  // ... existing fields
  labelId: string | null;
  label: { id: string; name: string; color: string } | null;
};
```

Bỏ field `labels: Array<{ ... }>` cũ.

### 4. BC consideration

**Decision:** Không có BC layer (clean break). FE và BE deploy cùng lúc.
- Tag commit migration là `BREAKING_CHANGE` để rõ ràng.
- Nếu có client bên ngoài (3rd-party API key dùng) → cần check `apps/api/src/modules/external/*` (nếu có) - flag riêng.

## Todo List

- [ ] Sửa `leads.controller.ts` endpoint label
- [ ] Update Prisma include cho mọi lead query
- [ ] Cập nhật `LeadResponseDto`
- [ ] Update `packages/types/src/lead.ts` (nếu có)
- [ ] `pnpm --filter @crm/api build` pass
- [ ] Manual test endpoint qua curl/Postman

## Success Criteria

- `curl PATCH /api/v1/leads/123/label -d '{"labelId":"5"}'` → set thành công
- `curl PATCH /api/v1/leads/123/label -d '{"labelId":null}'` → unset
- Lead detail response có `label: {...} | null`, không còn `labels: [...]`

## Risk Assessment

- **Risk:** External API client (nếu có) vỡ. **Mitigation:** Grep `external|api-key|3rd-party` trong API source; nếu có handler nào dùng `labels[]` thì xử lý thêm.

## Next Steps

→ Phase 04 + 05: cập nhật FE types, components.
