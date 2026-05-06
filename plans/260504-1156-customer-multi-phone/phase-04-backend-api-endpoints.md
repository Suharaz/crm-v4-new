# Phase 04 - Backend API Endpoints

**Priority:** High
**Status:** ⬜ Pending
**Estimate:** 2h
**Depends on:** Phase 02

## Context

Expose CRUD số phụ qua REST endpoints để FE dùng. Theo QĐ 5: **chỉ MANAGER+ được sửa**.

## Requirements

### Functional
- `GET    /customers/:id/phones` - list số phụ (mọi role có quyền xem customer).
- `POST   /customers/:id/phones` - thêm (MANAGER+).
- `PATCH  /customers/:id/phones/:phoneId` - sửa (MANAGER+).
- `DELETE /customers/:id/phones/:phoneId` - soft delete (MANAGER+).

### Non-functional
- Tuân `@crm/api-design` conventions: REST resource pattern, status code đúng, BigInt serialize string.
- Validation qua DTO (`class-validator`).
- Roles guard sẵn có trong codebase.

## Architecture

```
Client
  │
  ▼
CustomersController (mở rộng, không tạo controller mới)
  │
  ├─ phonesList()       → CustomerPhonesService.listPhones()
  ├─ addPhone()         → CustomerPhonesService.addPhone()
  ├─ updatePhone()      → CustomerPhonesService.updatePhone()
  └─ deletePhone()      → CustomerPhonesService.softDeletePhone()
       │
       (with @Roles(MANAGER, SUPER_ADMIN) on add/update/delete)
```

## Related Code Files

### Read for context
- `apps/api/src/modules/customers/customers.controller.ts` - pattern existing endpoints, decorator usage
- `apps/api/src/common/decorators/roles.decorator.ts` (hoặc tương đương) - `@Roles()` decorator
- `apps/api/src/common/guards/roles.guard.ts` - guard

### Modify
- `apps/api/src/modules/customers/customers.controller.ts` - thêm 4 endpoints.

## Implementation Steps

### Step 1: Inject service vào controller

```typescript
constructor(
  private readonly customersService: CustomersService,
  private readonly customerPhonesService: CustomerPhonesService,  // mới
) {}
```

### Step 2: Thêm 4 method vào `CustomersController`

```typescript
@Get(':id/phones')
async listPhones(
  @Param('id', ParseBigIntPipe) id: bigint,
  @CurrentUser() user: CurrentUserPayload,
) {
  // Kiểm tra user có quyền xem customer này không (re-use existing service method)
  await this.customersService.findOne(id, user);  // throw nếu không có quyền
  return this.customerPhonesService.listPhones(id);
}

@Post(':id/phones')
@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
async addPhone(
  @Param('id', ParseBigIntPipe) id: bigint,
  @Body() dto: AddCustomerPhoneDto,
  @CurrentUser() user: CurrentUserPayload,
) {
  return this.customerPhonesService.addPhone(id, dto, user.id);
}

@Patch(':id/phones/:phoneId')
@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
async updatePhone(
  @Param('id', ParseBigIntPipe) id: bigint,
  @Param('phoneId', ParseBigIntPipe) phoneId: bigint,
  @Body() dto: UpdateCustomerPhoneDto,
) {
  return this.customerPhonesService.updatePhone(phoneId, dto);
}

@Delete(':id/phones/:phoneId')
@Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN)
@HttpCode(204)
async deletePhone(
  @Param('phoneId', ParseBigIntPipe) phoneId: bigint,
) {
  await this.customerPhonesService.softDeletePhone(phoneId);
}
```

> **Decorator chính xác** dựa vào pattern hiện có - đọc file controller trước để copy đúng style.

### Step 3: Customer detail response include `phones`

Mở rộng `findOne` (trong `customers.service.ts`) để include số phụ active. Hoặc thêm endpoint riêng `GET /customers/:id/phones` (đã có) - tùy lựa chọn.

> **Khuyến nghị:** Thêm `phones: { where: { deletedAt: null } }` vào select của `findOne`. Tiết kiệm round-trip cho FE detail page (không gọi 2 API).

### Step 4: Cập nhật `@crm/types` nếu có

Nếu monorepo có `packages/types/src/customer.ts` define `CustomerResponse` → thêm `phones?: CustomerPhone[]`. Nếu chưa có DTO chung → bỏ qua.

### Step 5: Manual API test với Postman/curl

```bash
# Thêm số phụ (MANAGER token)
curl -X POST http://localhost:3010/api/v1/customers/1/phones \
  -H "Authorization: Bearer <manager-token>" \
  -H "Content-Type: application/json" \
  -d '{"phone": "0902222222", "label": "Vợ"}'

# Sale token → 403
curl -X POST http://localhost:3010/api/v1/customers/1/phones \
  -H "Authorization: Bearer <sale-token>" \
  -d '{"phone": "0903333333"}'

# List
curl http://localhost:3010/api/v1/customers/1/phones \
  -H "Authorization: Bearer <token>"
```

## Todo List

- [ ] Inject `CustomerPhonesService` vào controller
- [ ] Thêm `GET /customers/:id/phones`
- [ ] Thêm `POST /customers/:id/phones` với `@Roles`
- [ ] Thêm `PATCH /customers/:id/phones/:phoneId` với `@Roles`
- [ ] Thêm `DELETE /customers/:id/phones/:phoneId` với `@Roles`
- [ ] (Optional) Mở rộng `findOne` include `phones` để FE 1 round-trip
- [ ] Cập nhật `@crm/types` nếu cần
- [ ] Manual API test 4 endpoints với 2 role (MANAGER, SALE)

## Success Criteria

- [ ] 4 endpoints hoạt động đúng status code (200/201/204/403/404).
- [ ] Sale (USER role) bị 403 khi POST/PATCH/DELETE.
- [ ] Manager+ pass 4 endpoints.
- [ ] BigInt serialize đúng thành string trong response.
- [ ] Build + lint pass.

## Risk

| Risk | Mitigation |
|---|---|
| Roles decorator viết sai → guard không trigger | Test với cả 2 role thực tế |
| `ParseBigIntPipe` chưa có trong project | Check codebase, dùng `ParseIntPipe` + cast hoặc custom pipe đã có |
| FE đang dùng `findOne` payload cũ → break khi thêm `phones` field | Field optional, FE TS sẽ pass - verify build FE sau khi đổi DTO |

## Security

- `@Roles(MANAGER, SUPER_ADMIN)` cho 3 mutating endpoints.
- GET endpoint vẫn check `findOne` permission để đảm bảo user không xem được số phụ của customer họ không có quyền.
- BigInt serialize → không leak primary key as number.

## Next Steps

- Phase 05 - UI cho FE.
