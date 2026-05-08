# Phase 03: Refactor Call-Logs Match Logic

**Priority:** P0 (core feature - thay đổi behavior chính)
**Status:** Done
**Effort:** 2h
**Depends on:** Phase 02

## Context Links

- Plan: [plan.md](./plan.md)
- Phase 02: [phase-02-backend-api.md](./phase-02-backend-api.md)
- File chính sửa: `apps/api/src/modules/call-logs/call-logs.service.ts`
- Logic match cũ: `call-logs.service.ts:64-91` (current version)
- AI summary trigger: `apps/api/src/modules/ai-summary/ai-summary.service.ts`

## Overview

Thay đổi thứ tự match cuộc gọi: thêm bước MATCH USER qua `user_phones` chạy ĐẦU TIÊN. Sau đó vẫn match LEAD/CUSTOMER để gắn timeline. Định nghĩa lại UNMATCHED.

## Key Insights

- User phải được set sớm (từ `user_phones` lookup) → fallback dùng `lead.assignedUserId`/`customer.assignedUserId` chỉ khi `user_phones` không có
- Activity timeline vẫn chỉ tạo khi có `matchedEntityId` (lead/customer) - không có entity thì không có timeline
- `match_status` logic mới: AUTO_MATCHED nếu match được user HOẶC entity; UNMATCHED chỉ khi cả 2 đều null
- Backward compatible: data cũ vẫn match đúng (vì `user_phones` rỗng thì fall back logic cũ)

## Requirements

### Functional - Match Flow Mới

```
1. Normalize phone
2. Match user qua UserPhonesService.findUserByPhone(phone)
   → matchedUserId (có thể null)
3. Match LEAD theo phone (giữ filter assignedUserId IS NOT NULL)
   → matchedEntityType=LEAD, matchedEntityId=lead.id
   → nếu matchedUserId vẫn null → fallback dùng lead.assignedUserId
4. Nếu không có lead → match CUSTOMER (số chính + số phụ)
   → matchedEntityType=CUSTOMER, matchedEntityId=customer.id
   → nếu matchedUserId vẫn null → fallback dùng customer.assignedUserId
5. Compute match_status:
   - matchedUserId != null OR matchedEntityId != null → AUTO_MATCHED
   - cả 2 đều null → UNMATCHED
6. Lưu callLog với 4 fields (matchedUserId, matchedEntityType, matchedEntityId, matchStatus)
7. Tạo Activity nếu có matchedEntityId (giống cũ - cần entity để gắn timeline)
8. Auto IN_PROGRESS lead trigger (giữ nguyên)
9. Fire-and-forget AI summary trigger (giữ nguyên)
```

### Non-functional
- Không thêm round trip DB không cần thiết - 1 query lookup user_phones là đủ
- Không thay đổi response shape của ingest endpoint (frontend không cần update)

## Architecture

### Diff trên ingest()

**Trước (call-logs.service.ts:50-149):**
```typescript
// match lead → match customer → set matchStatus
```

**Sau:**
```typescript
async ingest(data) {
  // ... dedup check + normalize phone (giữ nguyên) ...

  let matchedEntityType = null;
  let matchedEntityId = null;
  let matchedUserId = null;

  // Step 1 [MỚI]: match user qua user_phones
  const userMatch = await this.userPhonesService.findUserByPhone(phone);
  if (userMatch) {
    matchedUserId = userMatch.userId;
  }

  // Step 2: match lead (giữ filter cũ)
  const lead = await this.prisma.lead.findFirst({
    where: { phone, deletedAt: null, assignedUserId: { not: null } },
    select: { id: true, assignedUserId: true },
    orderBy: { updatedAt: 'desc' },
  });
  if (lead) {
    matchedEntityType = 'LEAD';
    matchedEntityId = lead.id;
    if (!matchedUserId) matchedUserId = lead.assignedUserId; // fallback
  } else {
    // Step 3: match customer
    const customer = await this.customerPhonesService.findCustomerByAnyPhone(phone);
    if (customer) {
      matchedEntityType = 'CUSTOMER';
      matchedEntityId = customer.id;
      if (!matchedUserId) matchedUserId = customer.assignedUserId; // fallback
    }
  }

  // Step 4 [MỚI]: status logic
  const matchStatus = (matchedUserId || matchedEntityId) ? 'AUTO_MATCHED' : 'UNMATCHED';

  // Step 5: tạo call_log (giữ nguyên - matchedUserId đã có ở trên)
  const callLog = await this.prisma.callLog.create({ data: {...} });

  // Step 6: tạo Activity nếu có entity (giữ nguyên)
  if (matchedEntityType && matchedEntityId && matchedUserId) {
    await this.prisma.activity.create({...});
    // auto IN_PROGRESS giữ nguyên
  }

  // Step 7: AI summary trigger (giữ nguyên)
  this.aiSummary.triggerFromCall(...).catch(() => {});

  return callLog;
}
```

### Module Wiring

`CallLogsModule` cần inject `UserPhonesService`:

```typescript
@Module({
  imports: [UserPhonesModule],   // import (UserPhonesModule export service)
  controllers: [CallLogsController],
  providers: [CallLogsService],
})
export class CallLogsModule {}
```

`CallLogsService` constructor:
```typescript
constructor(
  private readonly prisma: PrismaClient,
  private readonly customerPhonesService: CustomerPhonesService,
  private readonly userPhonesService: UserPhonesService,  // <-- ADD
  private readonly aiSummary: AiSummaryService,
) {}
```

## Related Code Files

### Modify
- `apps/api/src/modules/call-logs/call-logs.service.ts` - refactor `ingest()` + inject `UserPhonesService`
- `apps/api/src/modules/call-logs/call-logs.module.ts` - đã import ở phase 02
- `apps/api/test/modules/call-logs/call-logs.service.spec.ts` - thêm 5 test case

### Read (context only)
- `apps/api/src/modules/call-logs/call-logs.service.ts:50-149`
- `apps/api/src/modules/customers/customer-phones.service.ts`
- `apps/api/src/modules/user-phones/user-phones.service.ts` (vừa tạo phase 02)

### Create
- (none - chỉ sửa)

### Delete
- (none)

## Implementation Steps

1. Đọc lại `call-logs.service.ts:50-149` để nắm chính xác current behavior.
2. Inject `UserPhonesService` vào constructor `CallLogsService`.
3. Refactor block match (line 64-91 trong code cũ) theo flow 4-step ở Architecture section.
4. Tính lại `matchStatus` theo rule mới (line 5).
5. KHÔNG thay đổi: dedup logic, normalize, prisma.create, activity creation, IN_PROGRESS trigger, AI summary trigger.
6. Run `pnpm build` và `pnpm typecheck` - đảm bảo compile pass.
7. Update test file `call-logs.service.spec.ts`:
   - Test 1: phone trong user_phones + có lead match → matchedUserId từ user_phones (không phải lead.assignedUserId)
   - Test 2: phone trong user_phones + KHÔNG có entity → matchStatus=AUTO_MATCHED, matchedUserId set, entity=null
   - Test 3: phone KHÔNG trong user_phones + có lead → matchedUserId fallback dùng lead.assignedUserId (backward compat)
   - Test 4: phone KHÔNG trong user_phones + có customer (số phụ) → matchedUserId fallback dùng customer.assignedUserId
   - Test 5: phone không match đâu cả → matchStatus=UNMATCHED, tất cả null
8. Run `pnpm test --filter=call-logs` - 5 test pass.
9. Manual e2e: tạo user_phones cho user X qua API phase 02, ingest cuộc gọi → verify activity + matched_user_id đúng.
10. Test backward compat: xóa user_phones, ingest cuộc gọi → behavior y như trước (matched_user_id từ lead.assignedUserId).

## Todo List

- [x] Inject UserPhonesService vào CallLogsService
- [x] Refactor block match (4 step)
- [x] Tính matchStatus theo rule mới
- [x] Build + typecheck pass
- [x] Thêm 5 unit test
- [x] Run test pass
- [x] Manual e2e test với user_phones có data
- [x] Manual e2e test backward compat (user_phones rỗng)

## Success Criteria

- 5 unit test pass
- Backward compat: với DB không có row `user_phones` nào, behavior 100% như version cũ
- Forward: số trong `user_phones` của user A + lead phụ trách bởi user B → activity gắn vào lead, NHƯNG `matched_user_id` = A (theo user_phones)
- AI summary trigger vẫn chạy đúng (>60s phân tích call, >120s phân tích customer)
- Performance: thêm 1 query lookup, < 5ms (có index)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Quên fallback → cuộc gọi đến lead nhưng không có user_phones bị mất matched_user_id | Test case 3 + 4 specifically cover backward compat |
| Activity gắn vào lead nhưng userId khác lead.assignedUserId gây confuse | Đây là behavior cố ý theo yêu cầu user. Note rõ trong commit message + business-flows.md |
| Race: user_phones bị transfer giữa lúc match | Edge case rất hiếm, accept eventual consistency |

## Security Considerations

- `findUserByPhone` không leak data: chỉ return `{userId, userPhoneId}`, không expose gì khác
- Webhook endpoint vẫn yêu cầu API key auth (giữ nguyên existing guard)
- Audit log: ingest event vẫn được log qua `AuditLogInterceptor`

## Next Steps

- Phase 04: UI admin để super admin quản lý `user_phones`
- Sau cả 4 phases: update docs (`business-flows.md`, `data-model.md`, `project-changelog.md`)
- Future enhancement (out of scope plan này): hiển thị badge "Số này thuộc Sale X" trong UI customer detail
