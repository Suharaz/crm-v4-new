# Phase 01: Backend - List lead với latest order info

**Status:** SKIPPED (data đã sẵn) | **Priority:** P0 | **Est:** 0h

## Lý do skip
Verify `leads.service.ts:21-43` → `LEAD_SELECT` đã include `orders: { totalAmount, payments: { amount, status } }` với `orderBy: { id: 'desc' }`. Frontend compute `latestOrder = orders[0]` + `depositPaid = sum(payments WHERE status==='VERIFIED')` từ data có sẵn. Không cần sửa backend.

Type `OrderRecord` + `PaymentRecord` ở `apps/web/src/types/entities.ts:129+151` đã match.

## Mục tiêu
Mở rộng response của `/leads`, `/leads/pool/*`, `/leads/floating` để bao gồm:
- `latestOrder.totalAmount` (Decimal as string)
- `latestOrder.depositPaid` (sum payments verified)
- `source.name` (đã có quan hệ, đảm bảo SELECT)

## Key Insights
- Order có `leadId` nullable - 1 lead có thể có 0..N orders
- Payment relation: `Payment.orderId` → Order. Verified khi `Payment.status = VERIFIED`
- "Order mới nhất" = ORDER BY orders.createdAt DESC LIMIT 1
- Tránh N+1: dùng Prisma `include` với `take: 1, orderBy` HOẶC raw SQL LATERAL JOIN

## Architecture
```
GET /api/v1/leads (and pool/floating endpoints)
  ↓
LeadsService.list()
  ↓
LeadsRepository.findManyWithLatestOrder()
  - Prisma findMany với include: { orders: { take: 1, orderBy: { createdAt: desc }, include: { payments: true } } }
  - Hoặc dùng raw query nếu prisma include không tối ưu
  ↓
Mapper: thêm fields latestOrder { totalAmount, depositPaid } vào DTO
```

## Related Code Files
- `apps/api/src/modules/leads/leads.service.ts` - service list
- `apps/api/src/modules/leads/leads.repository.ts` - DB query
- `apps/api/src/modules/leads/dto/lead-response.dto.ts` - response shape (nếu có)
- `packages/types/src/lead.ts` - shared types
- `apps/api/src/modules/leads/pool-leads.controller.ts` - pool endpoints (nếu có)

## Implementation Steps
1. Đọc current `leads.repository.ts` để hiểu pattern hiện tại
2. Đọc `Payment` model + xác định status enum nào = "verified"
3. Thêm helper `findLatestOrderWithPayments(leadIds: bigint[])` trả map `{ leadId → { totalAmount, depositPaid } }` (batch để tránh N+1)
4. Trong service `list()`, sau khi load leads, gọi helper rồi merge vào response
5. Cập nhật type `LeadRecord` trong `@crm/types` thêm `latestOrder?: { totalAmount: string; depositPaid: string }`
6. Test với postman: list lead có data → thấy field mới

## Todo
- [ ] Đọc leads.repository.ts hiện tại
- [ ] Kiểm tra Payment.status enum
- [ ] Thêm `findLatestOrderWithPayments` helper batch
- [ ] Merge vào response trong service
- [ ] Cập nhật shared type
- [ ] Test endpoint /api/v1/leads
- [ ] Test endpoint /api/v1/leads/pool/new
- [ ] Test endpoint /api/v1/leads/floating
- [ ] Build API: `pnpm --filter api build`

## Success Criteria
- Response GET /leads chứa `latestOrder` cho lead có order, `null` cho lead chưa có
- Không có N+1 query (check qua Pino log với QUERY level)
- Type-safe end-to-end

## Risk
- Query có thể chậm nếu DB lớn → cần index trên `orders.lead_id, orders.created_at DESC`
- Payment.status enum chưa biết chính xác name → cần verify

## Security
- Không exposé tiền cọc cho user không có quyền xem lead - đã có buildAccessFilter
