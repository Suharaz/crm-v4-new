# Phase 02: Section SĐT phụ trong LeadForm + Auto-Create Customer

**Priority:** P0
**Status:** COMPLETE
**Effort:** ~3h
**Depends:** Phase 01 (Drawer)

## Context Links

- Existing service: `apps/api/src/modules/customers/customer-phones.service.ts`
- Existing controller: `apps/api/src/modules/customers/customers.controller.ts` (lines 131-175)
- Existing UI: `apps/web/src/components/customers/customer-phones-section.tsx`
- Lead convert logic: `apps/api/src/modules/leads/leads.service.ts` (line 899-944)
- Phase 01 file: `phase-01-edit-lead-drawer.md`

## Overview

Thêm section "Số điện thoại phụ" vào `LeadForm`. Mọi role (USER/MANAGER/SUPER_ADMIN) đều thêm/sửa/xóa được. Khi user thêm SĐT phụ:
- Nếu `lead.customerId` tồn tại -> add vào `customer_phones` của customer đó.
- Nếu chưa có customer -> tự động tạo customer "shadow" (copy phone+name+email từ lead, link `lead.customerId`), KHÔNG đổi `lead.status`.

## Key Insights (WHY)

- **Tại sao auto-create customer?**: User flow thực tế khi nhập SĐT phụ là khi sale đang nói chuyện với khách - sale muốn lưu ngay số người thân/thư ký mà không cần convert lead (vì convert đòi `status==='IN_PROGRESS'` và thêm activity log).
- **Tại sao endpoint riêng cho lead context?**: Customer-phones POST hiện chỉ cho MANAGER+. Yêu cầu của bạn là mọi role. Nới permission customer-phones là risky (đụng flow khác); endpoint mới cho phép scope quyền theo "ai access được lead" qua `buildAccessFilter`.
- **Không trigger convert status**: Convert có business rule (`status==='IN_PROGRESS'`, log STATUS_CHANGE activity, set `assignedUser` cho customer). Auto-create chỉ tạo customer record để link phone, giữ nguyên trạng thái lead.
- **Tái sử dụng CustomerPhonesService**: DRY - không duplicate logic dedup phone cross-table (đã có `findCustomerByAnyPhone` + `assertPhoneNotExists`).

## Requirements

### Functional
- F1: LeadForm có thêm section "Số điện thoại khác" sau section "Công ty & Mạng xã hội".
- F2: Section hiện cho cả CREATE và EDIT lead. Tuy nhiên chỉ active khi đã có `lead.id` (sau create lần đầu) - nếu chưa save lead, hiện hint "Lưu lead trước rồi thêm SĐT phụ".
- F3: List SĐT phụ hiện tại (nếu lead có `customerId`).
- F4: Button "Thêm số phụ" mở Dialog (giống `CustomerPhonesSection`).
- F5: Submit thêm -> backend tự ensure customer tồn tại + link với lead -> add phone.
- F6: Sửa/xóa SĐT phụ ngay trong section.
- F7: Validate phone VN format (giống CustomerPhonesSection regex `/^\+?\d{8,14}$/`).

### Non-functional
- NF1: Mọi role thao tác được (USER/MANAGER/SUPER_ADMIN) với điều kiện có access tới lead.
- NF2: Transaction atomic: ensure-customer + add-phone trong cùng `prisma.$transaction`.
- NF3: Không ảnh hưởng các trang khác đang dùng customer-phones API.

## Architecture

```
LeadForm (modified)
  -> <LeadSecondaryPhonesSection leadId={lead.id} customerId={lead.customerId} />
       -> SWR fetch GET /leads/:id/phones
       -> Add/Edit/Delete buttons -> Dialog -> POST/PATCH/DELETE /leads/:id/phones

Backend new endpoints (LeadsController):
  GET    /leads/:id/phones                 // list, all roles with access to lead
  POST   /leads/:id/phones                 // ensure-customer + add phone, all roles
  PATCH  /leads/:id/phones/:phoneId        // update phone, all roles
  DELETE /leads/:id/phones/:phoneId        // soft delete, all roles

Service flow:
  LeadsService.addSecondaryPhone(leadId, dto, user)
    -> findById(leadId, user)                                 // ownership check
    -> if !lead.customerId:
         -> $transaction:
              -> create customer { phone, name, email, ... } from lead fields
              -> update lead { customerId }
         -> lead.customerId = newCustomer.id
    -> customerPhonesService.addPhone(lead.customerId, dto, user.id)
```

## Related Code Files

### To Create
- `apps/web/src/components/leads/lead-secondary-phones-section.tsx` - UI section, structure giống `customer-phones-section.tsx` nhưng:
  - Endpoint base: `/leads/:id/phones` (không phải `/customers/:id/phones`)
  - Permission: bỏ `isManagerPlus` gate ở UI (mọi role thêm/sửa/xóa được)
  - Show hint khi `lead.customerId` chưa có: "Số sẽ được lưu vào hồ sơ khách hàng tự động"

- `apps/web/src/lib/api/lead-secondary-phones.ts` - API client wrapper:
  - `list(leadId)`, `add(leadId, dto)`, `update(leadId, phoneId, dto)`, `remove(leadId, phoneId)`

### To Modify
- `apps/api/src/modules/leads/leads.controller.ts` - Add 4 endpoints `/leads/:id/phones` (GET/POST/PATCH/DELETE). KHÔNG `@Roles` decorator (mọi role auth + lead access).
- `apps/api/src/modules/leads/leads.service.ts` - Add methods:
  - `listSecondaryPhones(leadId, user)`
  - `addSecondaryPhone(leadId, dto, user)` - includes ensure-customer logic
  - `updateSecondaryPhone(leadId, phoneId, dto, user)` - verify phone belongs to lead.customerId
  - `softDeleteSecondaryPhone(leadId, phoneId, user)` - verify ownership
  - `ensureCustomerForLead(leadId, user)` - private helper, tạo customer nếu chưa có
- `apps/api/src/modules/leads/leads.module.ts` - Import `CustomersModule` để inject `CustomerPhonesService`.
- `apps/web/src/components/leads/lead-form.tsx` - Render `<LeadSecondaryPhonesSection>` sau section "Công ty & Mạng xã hội", chỉ khi `isEdit && lead?.id`.

### To Delete
- None.

## Implementation Steps

### Backend

1. **Add `LeadsService.ensureCustomerForLead(leadId, user)`** - private:
   ```ts
   private async ensureCustomerForLead(leadId: bigint, user: CurrentUser): Promise<bigint> {
     const lead = await this.findById(leadId, user);
     if (lead.customerId) return lead.customerId;
     return this.prisma.$transaction(async (tx) => {
       const customer = await tx.customer.create({
         data: {
           phone: lead.phone, name: lead.name ?? '', email: lead.email,
           companyName: lead.companyName, facebookUrl: lead.facebookUrl,
           instagramUrl: lead.instagramUrl, zaloUrl: lead.zaloUrl, linkedinUrl: lead.linkedinUrl,
           assignedUserId: lead.assignedUserId, assignedDepartmentId: lead.departmentId,
         },
       });
       await tx.lead.update({ where: { id: leadId }, data: { customerId: customer.id } });
       return customer.id;
     });
   }
   ```

2. **Add 4 service methods** wrapping `CustomerPhonesService`:
   - `listSecondaryPhones`: findById (ownership) -> if !customerId return [] -> else call `customerPhonesService.listPhones(customerId)`.
   - `addSecondaryPhone`: findById -> `ensureCustomerForLead` -> `customerPhonesService.addPhone(customerId, dto, user.id)`.
   - `updateSecondaryPhone`: findById -> verify `phone.customerId === lead.customerId` -> `customerPhonesService.updatePhone(phoneId, dto)`.
   - `softDeleteSecondaryPhone`: findById -> verify ownership -> `customerPhonesService.softDeletePhone(phoneId)`.

3. **Add 4 controller endpoints** in `leads.controller.ts`:
   ```ts
   @Get(':id/phones')
   async listSecondaryPhones(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
     return { data: await this.leadsService.listSecondaryPhones(id, user) };
   }
   @Post(':id/phones')
   async addSecondaryPhone(...) { ... }
   @Patch(':id/phones/:phoneId')
   async updateSecondaryPhone(...) { ... }
   @Delete(':id/phones/:phoneId')
   async deleteSecondaryPhone(...) { ... }
   ```
   KHÔNG `@Roles` decorator - relying on ownership check in `findById`.

4. **Update `leads.module.ts`** - Import `CustomersModule` (or just `CustomerPhonesService` provider) để inject.

### Frontend

5. **Create `lib/api/lead-secondary-phones.ts`** - Thin wrapper:
   ```ts
   export const leadSecondaryPhonesApi = {
     list: (leadId: string) => api.get(`/leads/${leadId}/phones`),
     add: (leadId, dto) => api.post(`/leads/${leadId}/phones`, dto),
     update: (leadId, phoneId, dto) => api.patch(`/leads/${leadId}/phones/${phoneId}`, dto),
     remove: (leadId, phoneId) => api.delete(`/leads/${leadId}/phones/${phoneId}`),
   };
   ```

6. **Create `lead-secondary-phones-section.tsx`** - Copy `customer-phones-section.tsx`:
   - Replace `customerPhonesApi` -> `leadSecondaryPhonesApi`
   - Replace prop `customerId` -> `leadId`
   - Remove `isManagerPlus` gate (mọi role thêm/sửa/xóa)
   - Add hint "Số sẽ được lưu vào hồ sơ khách hàng tự động" khi list empty.

7. **Modify `lead-form.tsx`**:
   - Add `<LeadSecondaryPhonesSection leadId={lead.id} />` sau section "Công ty & Mạng xã hội"
   - Condition: chỉ render khi `isEdit && lead?.id` (CREATE flow chưa có lead.id)
   - Trong CREATE mode, show placeholder card: "Lưu lead trước rồi thêm SĐT phụ".

### Test

8. **Manual test**:
   - USER vào Drawer của lead chưa có customerId -> thêm SĐT phụ -> verify customer tạo mới + lead.customerId được set + phone hiện trong list.
   - USER thêm SĐT phụ lần 2 -> verify dùng customer cũ, không tạo mới.
   - MANAGER xóa SĐT phụ -> verify soft delete.
   - Validate phone duplicate cross-table: thêm SĐT trùng số chính của customer khác -> verify lỗi `ConflictException`.

## Todo List

- [x] Backend: `LeadsService.ensureCustomerForLead` private helper
- [x] Backend: 4 service methods (list/add/update/delete secondary phones)
- [x] Backend: 4 controller endpoints `/leads/:id/phones[/:phoneId]`
- [x] Backend: Wire `CustomerPhonesService` vào `LeadsModule`
- [x] Frontend: `lib/api/lead-secondary-phones.ts` wrapper
- [x] Frontend: `lead-secondary-phones-section.tsx` component (no role gate)
- [x] Frontend: Modify `lead-form.tsx` mount section khi `isEdit`
- [x] Frontend: Placeholder card trong CREATE mode
- [x] Manual test 4 scenarios
- [x] `pnpm test` + `pnpm typecheck` pass

## Success Criteria

- [x] USER thêm SĐT phụ thành công cho lead chưa có customer (auto-create xảy ra)
- [x] `lead.customerId` được set sau add đầu tiên
- [x] Phone duplicate cross-table bị reject với message rõ ràng
- [x] Sửa/xóa SĐT phụ hoạt động với mọi role
- [x] Customer-phones API cũ (`/customers/:id/phones`) không bị break
- [x] Trang `/customers/[id]` vẫn hiện SĐT phụ đúng (cùng nguồn data)

## Risk Assessment

- **Risk:** Auto-create customer cho lead `status='POOL'/'FLOATING'` (chưa assigned) tạo customer không có owner. 
  - **Mitigation:** Để `assignedUserId` + `assignedDepartmentId = null` khi lead chưa có. Customer hiện trong "kho thả nổi customer" - manager xử lý sau. Hoặc fallback: set `assignedUserId = user.id` (người vừa thêm SĐT phụ).
  - **Decision needed**: Owner customer khi lead chưa assigned? Default = null (Hồ sơ tự do, customer floating) hay user vừa thêm SĐT phụ?

- **Risk:** Race condition - 2 user cùng thêm SĐT phụ cho lead chưa customerId -> tạo 2 customer.
  - **Mitigation:** Wrap trong `$transaction` + re-read lead.customerId bên trong transaction. Hoặc unique index `customers.phone` (đã có trong schema?).

- **Risk:** Inconsistent UX - mọi role tạo customer ngầm mà không biết.
  - **Mitigation:** Toast message: "Đã tự động tạo hồ sơ khách hàng cho lead này" sau add đầu tiên.

## Security Considerations

- Endpoint mới không có `@Roles` -> rely 100% trên `findById(leadId, user)` để verify access.
- Verify `phone.customerId === lead.customerId` trong update/delete để tránh IDOR (USER A xóa phone của customer B qua lead của A).
- Validate phone format VN trước khi insert (đã có trong `CustomerPhonesService.assertPhoneNotExists`).

## Unresolved Questions

1. Owner customer khi auto-create (null hay user vừa thêm phone)?
2. Toast message tự động tạo customer có cần show không? UX có rõ ràng không?
3. Khi USER tự thêm phone, `customer.assignedUserId` có nên = USER đó không (USER trở thành owner customer ngầm)?

## Next Steps

- Sau Phase 02 hoàn tất, Phase 03 (Pool/Zoom) chạy độc lập.
