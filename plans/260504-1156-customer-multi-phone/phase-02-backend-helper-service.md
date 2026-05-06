# Phase 02 - Backend Helper Service

**Priority:** High
**Status:** ⬜ Pending
**Estimate:** 2-3h
**Depends on:** Phase 01

## Context

Tạo service `CustomerPhonesService` với các method **bắt buộc** dùng chung ở mọi nơi search/dedup. Mục tiêu: **single source of truth** - không lặp logic `findFirst({ phone })` ở nhiều file.

## Requirements

### Functional
- Helper `findCustomerByAnyPhone(phone)` - tìm Customer bằng số chính HOẶC số phụ.
- Helper `assertPhoneNotExists(phone, excludeCustomerId?)` - check trùng cross-table, throw nếu trùng.
- CRUD số phụ: `add`, `update`, `softDelete`, `list` cho 1 customer.
- Mọi input phone phải qua `normalizePhone()` trước.
- Sử dụng transaction khi cần (race condition prevention).

### Non-functional
- Mỗi method <30 lines (theo rule code style).
- Có JSDoc cho từng public method.
- File <200 lines (theo rule project).

## Architecture

```
┌─────────────────────────────────────────────────┐
│        CustomerPhonesService (helper)            │
├─────────────────────────────────────────────────┤
│ + findCustomerByAnyPhone(phone)  → Customer | null│
│ + assertPhoneNotExists(phone, exclude?)          │
│ + addPhone(customerId, dto, createdBy)           │
│ + updatePhone(phoneId, dto)                      │
│ + softDeletePhone(phoneId)                       │
│ + listPhones(customerId)                         │
└─────────────────────────────────────────────────┘
                       │
            ┌──────────┴──────────┐
            ▼                     ▼
   customers.service.ts    import.processor.ts
   search.service.ts       third-party-api.controller.ts
```

## Related Code Files

### Read for context
- `apps/api/src/modules/customers/customers.service.ts` - patterns hiện có (normalizePhone, isValidVNPhone, error format)
- `packages/utils/src/phone-normalizer.ts` - utilities
- `apps/api/src/modules/customers/customers.module.ts` - module structure

### Create
- `apps/api/src/modules/customers/customer-phones.service.ts` - helper service
- `apps/api/src/modules/customers/dto/customer-phone.dto.ts` - DTOs

### Modify
- `apps/api/src/modules/customers/customers.module.ts` - register `CustomerPhonesService` provider, export

## Implementation Steps

### Step 1: Tạo DTOs

File: `apps/api/src/modules/customers/dto/customer-phone.dto.ts`

```typescript
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AddCustomerPhoneDto {
  @IsString()
  phone: string;        // sẽ normalize trong service

  @IsOptional() @IsString() @MaxLength(50)
  label?: string;       // "Vợ", "Thư ký"...

  @IsOptional() @IsString() @MaxLength(255)
  note?: string;
}

export class UpdateCustomerPhoneDto {
  @IsOptional() @IsString()
  phone?: string;

  @IsOptional() @IsString() @MaxLength(50)
  label?: string;

  @IsOptional() @IsString() @MaxLength(255)
  note?: string;
}
```

### Step 2: Tạo `CustomerPhonesService`

File: `apps/api/src/modules/customers/customer-phones.service.ts`

Cấu trúc method (pseudo):

```typescript
@Injectable()
export class CustomerPhonesService {
  constructor(private prisma: PrismaService) {}

  /** Tìm customer bằng SĐT chính HOẶC SĐT phụ. Số đã normalize trước khi gọi. */
  async findCustomerByAnyPhone(phone: string) {
    const normalized = normalizePhone(phone);
    // 1. Try primary phone first
    const primary = await this.prisma.customer.findFirst({
      where: { phone: normalized, deletedAt: null },
    });
    if (primary) return primary;
    // 2. Try alt phones
    const alt = await this.prisma.customerPhone.findFirst({
      where: { phone: normalized, deletedAt: null },
      include: { customer: true },
    });
    return alt?.customer ?? null;
  }

  /** Throw nếu phone trùng (số chính HOẶC số phụ) của customer khác. */
  async assertPhoneNotExists(phone: string, excludeCustomerId?: bigint) {
    const normalized = normalizePhone(phone);
    if (!isValidVNPhone(normalized)) throw new ConflictException('Số không hợp lệ');

    const primaryHit = await this.prisma.customer.findFirst({
      where: { phone: normalized, deletedAt: null,
               ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}) },
      select: { id: true },
    });
    if (primaryHit) throw new ConflictException('SĐT đã trùng (số chính KH khác)');

    const altHit = await this.prisma.customerPhone.findFirst({
      where: { phone: normalized, deletedAt: null,
               ...(excludeCustomerId ? { customerId: { not: excludeCustomerId } } : {}) },
      select: { id: true },
    });
    if (altHit) throw new ConflictException('SĐT đã trùng (số phụ KH khác)');
  }

  async addPhone(customerId: bigint, dto: AddCustomerPhoneDto, createdBy: bigint) {
    const phone = normalizePhone(dto.phone);
    await this.assertPhoneNotExists(phone, customerId);
    return this.prisma.customerPhone.create({
      data: { customerId, phone, label: dto.label, note: dto.note, createdBy },
    });
  }

  async updatePhone(phoneId: bigint, dto: UpdateCustomerPhoneDto) {
    const existing = await this.prisma.customerPhone.findUnique({ where: { id: phoneId } });
    if (!existing || existing.deletedAt) throw new NotFoundException();
    const updateData: any = {};
    if (dto.phone) {
      const phone = normalizePhone(dto.phone);
      await this.assertPhoneNotExists(phone, existing.customerId);
      updateData.phone = phone;
    }
    if (dto.label !== undefined) updateData.label = dto.label;
    if (dto.note !== undefined) updateData.note = dto.note;
    return this.prisma.customerPhone.update({ where: { id: phoneId }, data: updateData });
  }

  async softDeletePhone(phoneId: bigint) {
    return this.prisma.customerPhone.update({
      where: { id: phoneId },
      data: { deletedAt: new Date() },
    });
  }

  async listPhones(customerId: bigint) {
    return this.prisma.customerPhone.findMany({
      where: { customerId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
  }
}
```

### Step 3: Đăng ký vào module

`customers.module.ts`:

```typescript
@Module({
  providers: [CustomersService, CustomerPhonesService],
  exports: [CustomersService, CustomerPhonesService],  // export để module khác dùng
  controllers: [CustomersController],
})
```

### Step 4: Build check

```bash
pnpm build
```

Phải pass không lỗi type.

## Todo List

- [ ] Tạo file `customer-phone.dto.ts` với 2 DTO classes
- [ ] Tạo file `customer-phones.service.ts` với 6 method
- [ ] Đăng ký service vào `customers.module.ts` (providers + exports)
- [ ] JSDoc cho mỗi public method
- [ ] Build pass

## Success Criteria

- [ ] `findCustomerByAnyPhone('0901xxx')` trả về customer đúng khi:
  - SĐT là số chính của customer A → trả A
  - SĐT là số phụ của customer B → trả B
  - SĐT không tồn tại → trả null
- [ ] `assertPhoneNotExists('0901xxx', null)` throw khi số trùng (chính hoặc phụ) của bất kỳ KH nào.
- [ ] `assertPhoneNotExists('0901xxx', customerIdX)` không throw khi số là chính/phụ của chính `customerIdX`.
- [ ] Build + lint pass.

## Risk

| Risk | Mitigation |
|---|---|
| Race condition: 2 request đồng thời thêm cùng số → cả 2 pass `assertPhoneNotExists` rồi cùng insert | Wrap trong `prisma.$transaction` ở phase 03/04 caller, hoặc dùng SERIALIZABLE isolation |
| Quên normalize trước khi compare | DTO docstring + assert đầu tiên trong helper |

## Security

- `createdBy` set từ `CurrentUser` token, không trust client input.
- Validation strict: `MaxLength(50)` cho label, `MaxLength(255)` cho note.

## Next Steps

- Phase 03 - sửa các service hiện có để DÙNG helper này (thay thế logic dedup cũ).
- Phase 04 - expose API endpoints cho FE.
