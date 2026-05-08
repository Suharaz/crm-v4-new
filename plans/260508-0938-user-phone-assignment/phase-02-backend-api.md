# Phase 02: Backend API - User Phones Module

**Priority:** P0 (blocks phase 03 + 04)
**Status:** Done
**Effort:** 4h
**Depends on:** Phase 01

## Context Links

- Plan: [plan.md](./plan.md)
- Phase 01: [phase-01-database-schema.md](./phase-01-database-schema.md)
- Existing module template: `apps/api/src/modules/customers/` (controller + service + repository pattern)
- Existing similar module: `apps/api/src/modules/customer-phones/` (alt phone CRUD)
- Phone normalization util: `packages/utils/src/phone-normalizer.ts`
- BigInt serialization: `apps/api/src/common/interceptors/`
- Roles guard pattern: `apps/api/src/common/guards/roles.guard.ts`

## Overview

Tạo module `user-phones` với CRUD endpoints. Tất cả endpoints chỉ super admin truy cập được. Hỗ trợ: list (filter theo userId/phone), tạo đơn lẻ, transfer (chuyển giữa users + ghi history), soft delete + ghi history, bulk import từ array.

## Key Insights

- Pattern bám sát `customer-phones.service.ts` và `customers.service.ts`
- Phone normalize ở DTO level (`@Transform`) trước khi lookup/insert
- Validate phone hợp lệ qua `isValidVNPhone` từ `@crm/utils`
- Transfer = transaction: insert history + update userPhone trong cùng tx
- Bulk import: validate hết rồi mới insert (no partial commit). Trả về kết quả per-row (success/skip/fail)

## Requirements

### Functional
- `GET /admin/user-phones` - list với filter `userId`, `phone`, pagination cursor
- `GET /admin/user-phones/by-user/:userId` - list số của 1 user
- `POST /admin/user-phones` - tạo 1 mapping phone↔user
- `PATCH /admin/user-phones/:id/transfer` - chuyển sang user khác (body: `newUserId`, `note?`)
- `DELETE /admin/user-phones/:id` - soft delete + ghi history
- `POST /admin/user-phones/bulk` - tạo hàng loạt (body: `[{phone, userId, note?}]`)
- `GET /admin/user-phones/:id/history` - xem lịch sử của 1 mapping
- Internal API (cho call-logs.service): `findUserByPhone(phone)` - return `{userId, userPhoneId} | null`

### Non-functional
- BigInt → string serialization (qua interceptor có sẵn)
- Validation error 400 format chuẩn
- Audit log cho create/transfer/delete (qua existing `AuditLogInterceptor`)

## Architecture

### Module Structure

```
apps/api/src/modules/user-phones/
├── user-phones.module.ts
├── user-phones.controller.ts
├── user-phones.service.ts
├── user-phones.repository.ts
├── dto/
│   ├── create-user-phone.dto.ts
│   ├── transfer-user-phone.dto.ts
│   ├── bulk-create-user-phone.dto.ts
│   └── list-user-phones.dto.ts
└── user-phones.types.ts
```

### Controller Endpoints

```typescript
@Controller('admin/user-phones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class UserPhonesController {
  @Get()                                  list(@Query() dto: ListUserPhonesDto)
  @Get('by-user/:userId')                 listByUser(@Param('userId', ParseBigIntPipe) userId: bigint)
  @Get(':id/history')                     getHistory(@Param('id', ParseBigIntPipe) id: bigint)
  @Post()                                 create(@Body() dto: CreateUserPhoneDto, @CurrentUser() me: User)
  @Post('bulk')                           bulkCreate(@Body() dto: BulkCreateUserPhoneDto, @CurrentUser() me: User)
  @Patch(':id/transfer')                  transfer(@Param('id', ParseBigIntPipe) id, @Body() dto: TransferUserPhoneDto, @CurrentUser() me)
  @Delete(':id')                          remove(@Param('id', ParseBigIntPipe) id, @CurrentUser() me)
}
```

### Service Methods

```typescript
class UserPhonesService {
  async list(filter)                          // pagination cursor
  async listByUser(userId: bigint)
  async getHistory(userPhoneId: bigint)
  async create(phone, userId, assignedBy, note?) // throws ConflictException nếu phone đã tồn tại active
  async bulkCreate(items[], assignedBy)        // trả {created[], skipped[], failed[]}
  async transfer(id, newUserId, changedBy, note?) // tx: insert history + update userId
  async remove(id, changedBy)                  // tx: insert history (DELETED) + soft delete

  // Internal - exported for call-logs.service injection
  async findUserByPhone(phone: string): Promise<{userId: bigint, userPhoneId: bigint} | null>
}
```

### DTOs (key fields + validation)

**CreateUserPhoneDto:**
- `phone: string` - `@IsString @Transform(normalizePhone) @Matches(/^0\d{9,10}$/)`
- `userId: string` - `@IsString` (BigInt as string from JSON)
- `note?: string` - `@IsOptional @IsString @MaxLength(500)`

**TransferUserPhoneDto:**
- `newUserId: string`
- `note?: string`

**BulkCreateUserPhoneDto:**
- `items: CreateUserPhoneDto[]` - `@ValidateNested({each: true}) @ArrayMaxSize(500)`

**ListUserPhonesDto:**
- `userId?: string`, `phone?: string`, `cursor?: string`, `limit?: number = 20`

### Internal API for Call-Logs

`UserPhonesService.findUserByPhone()` được dùng trong phase 03 để match cuộc gọi:

```typescript
async findUserByPhone(phone: string): Promise<{userId: bigint, userPhoneId: bigint} | null> {
  const normalized = normalizePhone(phone);
  const row = await this.prisma.userPhone.findFirst({
    where: { phone: normalized, deletedAt: null },
    select: { id: true, userId: true },
  });
  if (!row) return null;
  return { userId: row.userId, userPhoneId: row.id };
}
```

Export `UserPhonesService` trong `UserPhonesModule` để `CallLogsModule` import được.

## Related Code Files

### Modify
- `apps/api/src/app.module.ts` - register `UserPhonesModule`
- `apps/api/src/modules/call-logs/call-logs.module.ts` - import `UserPhonesModule` (chuẩn bị cho phase 03)
- `packages/types/src/index.ts` - export DTO types
- `packages/types/src/user-phone.types.ts` - shared DTO interfaces (CREATE)

### Create
- `apps/api/src/modules/user-phones/user-phones.module.ts`
- `apps/api/src/modules/user-phones/user-phones.controller.ts`
- `apps/api/src/modules/user-phones/user-phones.service.ts`
- `apps/api/src/modules/user-phones/user-phones.repository.ts`
- `apps/api/src/modules/user-phones/dto/create-user-phone.dto.ts`
- `apps/api/src/modules/user-phones/dto/transfer-user-phone.dto.ts`
- `apps/api/src/modules/user-phones/dto/bulk-create-user-phone.dto.ts`
- `apps/api/src/modules/user-phones/dto/list-user-phones.dto.ts`
- `apps/api/src/modules/user-phones/user-phones.types.ts`
- `packages/types/src/user-phone.types.ts`
- Tests: `apps/api/test/modules/user-phones/user-phones.service.spec.ts`

### Delete
- (none)

## Implementation Steps

1. Đọc code mẫu: `customer-phones.service.ts`, `customer-phones.controller.ts`, `customers.controller.ts` để bám pattern.
2. Tạo file types `packages/types/src/user-phone.types.ts` với interface `UserPhoneDto`, `UserPhoneHistoryDto`.
3. Tạo 4 DTO files với class-validator decorators.
4. Tạo `user-phones.repository.ts` - wrap Prisma queries (list/findById/findByPhone/create/update/softDelete/createHistory).
5. Tạo `user-phones.service.ts` với 7 method (list, listByUser, getHistory, create, bulkCreate, transfer, remove) + 1 internal `findUserByPhone`.
6. Tạo `user-phones.controller.ts` với 7 endpoints + guards `JwtAuthGuard`, `RolesGuard`, decorator `@Roles('SUPER_ADMIN')`.
7. Tạo `user-phones.module.ts` - providers + exports `UserPhonesService`.
8. Register vào `app.module.ts`.
9. Update `call-logs.module.ts` import `UserPhonesModule` (chỉ import, chưa dùng - phase 03 mới wire).
10. Viết unit test cho service: 8 case (create OK, create duplicate fail, transfer ghi history, delete ghi history, bulk all-OK, bulk partial fail, findUserByPhone match, findUserByPhone miss).
11. Chạy `pnpm test` - pass.
12. Manual test qua Postman/curl: tạo SĐT, transfer, xem history, soft delete, re-create lại số đã xóa cho user khác.

## Todo List

- [x] Tạo types/dto interfaces
- [x] Tạo CreateUserPhoneDto + validation
- [x] Tạo TransferUserPhoneDto + validation
- [x] Tạo BulkCreateUserPhoneDto + validation
- [x] Tạo ListUserPhonesDto
- [x] Tạo repository
- [x] Tạo service với 7 public method
- [x] Tạo internal findUserByPhone
- [x] Tạo controller với guards SUPER_ADMIN
- [x] Tạo module + export service
- [x] Register app.module
- [x] Update call-logs.module imports
- [x] Viết unit test 8 case
- [x] Manual test 5 flow (create, dup, transfer, delete, bulk)

## Success Criteria

- 7 endpoints chạy đúng spec, super admin only
- Validation reject phone sai format (test với `abc123`, `0123` - quá ngắn)
- Transfer ghi đúng row vào `user_phone_history` với reason=TRANSFERRED
- Delete ghi history với reason=DELETED, soft delete row chính
- Bulk import 100 row trong < 1s; partial fail trả về breakdown rõ ràng
- Re-create số đã soft-delete cho user KHÁC: OK
- Re-create số đang active: 409 Conflict
- `findUserByPhone()` lookup < 5ms (có index `idx_user_phones_phone_active`)

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Bulk import gây timeout | Cap 500 items/request (validation), nếu cần nhiều hơn → split client side |
| Race condition khi 2 admin transfer cùng row | Dùng `prisma.$transaction` + version field hoặc `SELECT FOR UPDATE` (Postgres advisory lock) |
| User bị xóa nhưng vẫn là `assigned_by` của row | FK constraint chặn - hoặc set ON DELETE RESTRICT (default Prisma) |
| Phone format Excel ăn số 0 ở đầu | Đã có `normalizePhone` xử lý, test edge case |

## Security Considerations

- Endpoint `/admin/*` BẮT BUỘC `@Roles('SUPER_ADMIN')` - test với role USER → 403
- Audit log: log đầy đủ create/transfer/delete actions (qua `AuditLogInterceptor` có sẵn)
- Rate limit: dùng existing throttler config 100 req/min cho admin routes
- Internal `findUserByPhone` KHÔNG expose qua HTTP - chỉ inject qua DI

## Next Steps

- Phase 03: refactor `call-logs.service.ts` dùng `UserPhonesService.findUserByPhone()` 
- Phase 04: build UI `/admin/user-phones` consume các endpoint này
