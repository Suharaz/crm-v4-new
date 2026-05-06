# Phase 03 - Update Existing Services

**Priority:** Critical (đụng nhiều file, rủi ro cao)
**Status:** ⬜ Pending
**Estimate:** 3-4h
**Depends on:** Phase 02

## Context

Phase này là **rủi ro nhất** - đụng vào logic dedup/search hiện có ở 4-5 module. Mục tiêu: thay tất cả pattern `prisma.customer.findFirst({ where: { phone } })` bằng helper từ phase 02.

## Requirements

### Functional
- `customers.service.ts` - `searchByPhone`, `create`, `update` đều phải check + match cả số phụ.
- `search.service.ts` - global search phải JOIN `customer_phones` để match.
- `import.processor.ts` - `processLeadRow`, `processCustomerRow` phải findOrCreate dùng helper.
- `third-party-api.controller.ts` - findOrCreate customer dùng helper.
- `call-logs.service.ts` - lookup customer theo phone từ tổng đài → match cả số phụ (NẾU có).

### Non-functional
- KHÔNG break behavior cũ (số chính vẫn match).
- Giữ performance (không thêm N+1).

## Architecture (search-by-phone flow mới)

```
Request: search "0901xxx"
       │
       ▼
findCustomerByAnyPhone(phone)
       │
       ├──→ FIRST: customer.phone = phone? → return customer
       │
       └──→ THEN: customer_phones.phone = phone? → return customer (via FK)
```

## Related Code Files

### Read for context (line numbers từ scout)
- `apps/api/src/modules/customers/customers.service.ts:91-137` - `searchByPhone`, `create`
- `apps/api/src/modules/customers/customers.service.ts:168-210` - `update` (phone field permission line 170)
- `apps/api/src/modules/search/search.service.ts:25-65` - global search
- `apps/api/src/modules/import/import.processor.ts:198-220, 333-360` - CSV import lead/customer
- `apps/api/src/modules/third-party-api/third-party-api.controller.ts:14-67` - POST /third-party/leads
- `apps/api/src/modules/call-logs/call-logs.service.ts` - lookup phone (cần đọc kỹ)

### Modify
- `apps/api/src/modules/customers/customers.service.ts`
- `apps/api/src/modules/search/search.service.ts`
- `apps/api/src/modules/import/import.processor.ts`
- `apps/api/src/modules/third-party-api/third-party-api.controller.ts`
- `apps/api/src/modules/call-logs/call-logs.service.ts` (nếu có lookup phone)
- Module nào cần - import `CustomerPhonesService`.

## Implementation Steps

### Step 1: `customers.service.ts`

#### `searchByPhone` (line 91)

**TRƯỚC:**
```typescript
async searchByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  const data = await this.prisma.customer.findMany({
    where: { phone: normalized, deletedAt: null },
    select: { id: true, phone: true, name: true, email: true, status: true },
    take: 10,
  });
  return data;
}
```

**SAU:**
```typescript
async searchByPhone(phone: string) {
  const normalized = normalizePhone(phone);
  // 1. Match số chính
  const primary = await this.prisma.customer.findMany({
    where: { phone: normalized, deletedAt: null },
    select: { id: true, phone: true, name: true, email: true, status: true },
  });
  // 2. Match số phụ → lấy customerId → lookup
  const altPhones = await this.prisma.customerPhone.findMany({
    where: { phone: normalized, deletedAt: null },
    select: { customerId: true },
  });
  const altIds = altPhones.map(p => p.customerId).filter(id => !primary.some(c => c.id === id));
  const fromAlt = altIds.length
    ? await this.prisma.customer.findMany({
        where: { id: { in: altIds }, deletedAt: null },
        select: { id: true, phone: true, name: true, email: true, status: true },
      })
    : [];
  return [...primary, ...fromAlt].slice(0, 10);
}
```

> Theo QĐ 3A: silent return - không phân biệt match số chính/phụ.

#### `create` (line 135)

**Thay** `prisma.customer.findFirst({ where: { phone, deletedAt: null } })` bằng:

```typescript
await this.customerPhonesService.assertPhoneNotExists(phone);
```

#### `update` (line 168)

**Thay** dedup check bằng:

```typescript
await this.customerPhonesService.assertPhoneNotExists(phone, id);  // exclude chính KH này
```

### Step 2: `search.service.ts`

Global search hiện match `phone: { contains: query }` (line 31, 44, 58). Mở rộng bằng UNION-style:

```typescript
// Customer leg
const customerWhere = {
  deletedAt: null,
  OR: [
    { name: { contains: query, mode: 'insensitive' } },
    { phone: { contains: query } },
    { email: { contains: query, mode: 'insensitive' } },
    { phones: { some: { phone: { contains: query }, deletedAt: null } } }, // mới
  ],
};
```

> Prisma cho phép filter qua relation `phones: { some: ... }` - chuẩn, không cần raw SQL.

### Step 3: `import.processor.ts`

#### `processLeadRow` (line 198)

**TRƯỚC:** `findFirst({ where: { phone, deletedAt: null } })` → tạo customer mới nếu không tìm thấy.

**SAU:**
```typescript
let customer = phoneCache.get(phone) || null;
if (!customer) {
  const dbCustomer = await this.customerPhonesService.findCustomerByAnyPhone(phone);
  if (dbCustomer) {
    customer = { id: dbCustomer.id };
  } else {
    const newCustomer = await this.prisma.customer.create({
      data: { phone, name, email: row.email || null },
    });
    customer = { id: newCustomer.id };
  }
  phoneCache.set(phone, customer);
}
```

#### `processCustomerRow` (line 333)

**Thay** dedup check bằng:
```typescript
try {
  await this.customerPhonesService.assertPhoneNotExists(phone);
} catch {
  throw new Error(`Trùng khách hàng: SĐT ${phone}`);
}
```

> **Cache implication:** Cache hiện chỉ key bằng số chính. Sau khi customer được tìm qua số phụ, cache lưu `customerId` - vẫn đúng. Nhưng nếu cùng 1 customer có 2 số phụ A, B trong CSV → cache miss lần thứ 2 nếu key là phone string. Chấp nhận N+1 nhỏ trong import (rare case), không tối ưu.

### Step 4: `third-party-api.controller.ts` (line 14-67)

**Thay** `findFirst({ phone })` bằng helper:

```typescript
let customer = await this.customerPhonesService.findCustomerByAnyPhone(phone);
if (!customer) {
  customer = await this.prisma.customer.create({
    data: { phone, name: body.name, email: body.email },
  });
}
```

> Cần inject `CustomerPhonesService` - controller phải import từ `customers.module` (đã export ở phase 02).

### Step 5: `call-logs.service.ts`

Đọc file, tìm chỗ lookup customer theo phone (nếu có). Thay bằng `findCustomerByAnyPhone()`.

### Step 6: Build + smoke test

```bash
pnpm build
pnpm dev
```

Manual smoke test (5 case nhanh):
1. Tạo customer có số chính = `0901111111` → OK.
2. Tạo customer khác có số chính = `0901111111` → 409.
3. Thêm số phụ `0902222222` cho customer A.
4. Tạo customer khác có số chính = `0902222222` → 409 (vì trùng số phụ KH A).
5. Search `0902222222` → trả ra customer A.

## Todo List

- [ ] Update `customers.service.ts:searchByPhone` (UNION 2 query)
- [ ] Update `customers.service.ts:create` (dùng `assertPhoneNotExists`)
- [ ] Update `customers.service.ts:update` (dùng `assertPhoneNotExists` với `excludeCustomerId`)
- [ ] Update `search.service.ts` (Prisma relation filter)
- [ ] Update `import.processor.ts:processLeadRow` (`findCustomerByAnyPhone`)
- [ ] Update `import.processor.ts:processCustomerRow` (`assertPhoneNotExists`)
- [ ] Update `third-party-api.controller.ts` (`findCustomerByAnyPhone`)
- [ ] Check `call-logs.service.ts` - update nếu có lookup phone
- [ ] Inject `CustomerPhonesService` ở các module sử dụng (import module/service)
- [ ] Build pass
- [ ] Smoke test 5 case manual

## Success Criteria

- [ ] Test scenario 1-5 ở Step 6 pass đúng.
- [ ] Không có chỗ nào còn dùng `findFirst({ phone })` cho mục đích dedup/search/findOrCreate (search cả codebase).
- [ ] Build + lint pass.
- [ ] No regression: smoke test các flow cũ (tạo/sửa/xóa customer, import CSV, 3rd party API) vẫn work.

## Risk

| Risk | Mitigation |
|---|---|
| Quên 1 chỗ → có file vẫn dùng dedup cũ → bug ngầm | Sau khi update xong, `Grep "phone.*findFirst"` toàn codebase, kiểm điểm từng hit |
| Race condition trong import song song | Import dùng BullMQ single worker → an toàn |
| Inject CustomerPhonesService gây circular dep | Đảm bảo `CustomerPhonesService` không inject `CustomersService` ngược lại |

## Security

- Không thay đổi access filter - vẫn dùng `buildAccessFilter(user)` ở các service hiện có.
- `searchByPhone` được dùng cho call-log lookup → nên có rate limit như cũ (nếu đã có).

## Next Steps

- Phase 04 - expose CRUD số phụ qua API.
