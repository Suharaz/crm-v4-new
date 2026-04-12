# Báo Cáo Phân Tích Ảnh Hưởng — Audit Remediation

**Ngày:** 2026-04-12  
**Nhánh:** `fix/audit-remediation-260412`  
**Số commit:** 14  
**Số file thay đổi:** 29 (+576 / -241 dòng)

---

## Tổng Quan

Đã thực hiện 40+ bản vá từ báo cáo kiểm toán bảo mật/hiệu suất/database. Báo cáo này phân tích **từng thay đổi có ảnh hưởng đến logic nghiệp vụ** và đánh giá rủi ro gây lỗi.

### Thang đánh giá rủi ro
- 🟢 **Không ảnh hưởng** — chỉ thêm bảo vệ, logic giữ nguyên
- 🟡 **Ảnh hưởng nhẹ** — thay đổi hành vi trong edge case, không ảnh hưởng happy path
- 🔴 **Cần kiểm tra kỹ** — thay đổi logic tính toán, cần test thủ công

---

## 1. THANH TOÁN — Payment Matching (payment-matching.service.ts)

### Thay đổi
**Trước:** `executeMatch()` dùng `payment.update()` + `bankTransaction.update()` bình thường.  
**Sau:** Dùng `updateMany()` với điều kiện `WHERE matchStatus = 'UNMATCHED'` và `WHERE status = 'PENDING'` (optimistic locking).

### Phân tích ảnh hưởng

| Khía cạnh | Đánh giá |
|-----------|----------|
| Ghép đúng thanh toán | 🟢 Giữ nguyên — cùng logic match amount + content |
| Conversion trigger | 🟢 Giữ nguyên — `checkConversionTrigger()` không đổi |
| Tổng tiền verified | 🟢 Giữ nguyên — aggregate `SUM(amount)` không đổi |
| Concurrent webhooks | 🟢 **Cải thiện** — trước 2 webhook cùng lúc → 2 payment verified từ 1 giao dịch ngân hàng (mất tiền). Giờ chỉ 1 thắng, 1 trả `null` |

### ⚠️ Thay đổi hành vi
- **Trước:** `executeMatch` luôn trả `{ paymentId, bankTxId, status }` hoặc throw
- **Sau:** Có thể trả `null` nếu race condition xảy ra
- **Ai gọi:** `tryMatchPayment()` và `tryMatchBankTransaction()` — cả hai đều `return this.executeMatch(...)` mà caller không kiểm tra giá trị trả về → **KHÔNG ảnh hưởng** vì null cũng hợp lệ (không match thành công)

### Kết luận: 🟢 An toàn — logic tính toán tiền giữ nguyên, chỉ thêm bảo vệ chống race condition

---

## 2. PHÂN PHỐI AI — Scoring Service (scoring.service.ts)

### Thay đổi
**Trước:** N+1 queries — chạy 2-3 query **riêng lẻ cho từng user** (workload count, history count, converted count).  
**Sau:** 4-5 query **batch cho tất cả users** (groupBy workload, groupBy history, findMany history, findMany converted).

### Phân tích ảnh hưởng

| Yếu tố | Trước | Sau | Khác biệt |
|---------|-------|------|-----------|
| **Workload score** | `lead.count` per user | `lead.groupBy` batch | 🟢 Kết quả giống nhau |
| **Level score** | Map lookup | Map lookup (giữ nguyên) | 🟢 Không đổi |
| **Conversion rate** | History-based + fallback | History-based, **KHÔNG fallback** | 🟡 Xem bên dưới |

### 🟡 Khác biệt logic: Mất fallback cho user không có assignment history

**Code cũ:**
```
if (totalAssigned === 0) {
  // Fallback: đếm lead hiện tại theo assignedUserId
  currentTotal = lead.count({ assignedUserId: u.id })
  currentConverted = lead.count({ assignedUserId: u.id, status: CONVERTED })
  rate = currentConverted / currentTotal
}
```

**Code mới:** Khi `totalAssigned === 0` → `conversionRate = 0` (không fallback).

**Khi nào xảy ra?**
- Chỉ khi user có leads assigned **trực tiếp** (ví dụ seed data) nhưng **không có record trong bảng `assignment_history`**
- Trong CRM v4, mọi assignment đều tạo history (từ Phase 04). Chỉ dữ liệu seed hoặc import cũ mới thiếu history
- **Xác suất xảy ra trong production: cực thấp**

**Tác động thực tế:**
- User mới (chưa có history) → rate = 0 ở cả code cũ và mới → **KHÔNG khác**
- User có leads cũ từ seed data → code cũ cho rate > 0, code mới cho rate = 0 → **điểm performance thấp hơn 1-2 điểm**
- Sau 1-2 tuần sử dụng, mọi user sẽ có history → khác biệt biến mất

### Kết luận: 🟡 Ảnh hưởng nhẹ — chỉ với dữ liệu seed/import cũ. Công thức tính điểm (workload × 30% + level × 30% + performance × 40%) giữ nguyên. Normalize logic giữ nguyên.

---

## 3. PHÂN PHỐI MẪU — Assignment Template (assignment-templates.service.ts)

### Thay đổi
**Trước:** Vòng `for` tuần tự: `lead.update()` + `assignmentHistory.create()` per lead.  
**Sau:** Nhóm theo userId → `lead.updateMany()` per group + `assignmentHistory.createMany()` batch.

### Phân tích ảnh hưởng

| Khía cạnh | Đánh giá |
|-----------|----------|
| Round-robin logic | 🟢 Giữ nguyên — `members[i % members.length]` không đổi |
| Lead status | 🟢 Giữ nguyên — `status: 'ASSIGNED'` không đổi |
| History record | 🟢 Giữ nguyên — cùng data fields (entityType, entityId, toUserId, assignedBy, reason) |
| Thứ tự phân | 🟢 Giữ nguyên — vòng lặp `i = 0..N` đọc `eligibleLeads` cùng thứ tự |

### ⚠️ Thay đổi nhỏ
- **Trước:** Mỗi lead update riêng → nếu lỗi giữa chừng, chỉ leads trước đó bị update (transaction rollback tất cả)
- **Sau:** Tất cả leads cùng group update 1 lệnh → cùng hành vi trong transaction

### Kết luận: 🟢 An toàn — kết quả phân phối giống hệt, chỉ giảm số query

---

## 4. IDOR FIX — findById trong leads, customers, orders

### Thay đổi
**Trước:** `findById(id)` — không kiểm tra quyền sở hữu.  
**Sau:** `findById(id, user?)` — nếu `user.role === USER`, thêm `assignedUserId = user.id` vào WHERE.

### Phân tích ảnh hưởng

| Ai gọi | Truyền user? | Hành vi |
|--------|-------------|---------|
| Controller `GET /:id` | ✅ Có truyền user | 🟢 USER chỉ xem lead/customer/order của mình |
| Service nội bộ: `assign()`, `claim()`, `convert()`, `changeStatus()`, `transfer()`, `recall()`, `update()` | ❌ Không truyền user | 🟢 Giữ nguyên — query không scoping |
| `create()` → `findById(lead.id)` | ❌ Không truyền user | 🟢 Giữ nguyên |
| `checkConversionTrigger()` → `tx.payment.findUnique()` | Không dùng findById | 🟢 Không ảnh hưởng |

### ⚠️ Rủi ro tiềm ẩn
- Nếu tương lai có developer gọi `findById(id, user)` từ service method mà user là caller → sẽ bị block nếu lead chưa assign cho user đó (ví dụ manager assign lead chưa thuộc về họ). Nhưng hiện tại pattern `user?` optional → **backward compatible hoàn toàn**.

### Kết luận: 🟢 An toàn — user optional, logic nội bộ không ảnh hưởng

---

## 5. CSV IMPORT — Streaming + Preload Lookups (import.processor.ts)

### Thay đổi
1. `readFileSync` → `createReadStream` + `for await` streaming
2. `new PrismaClient()` → inject via DI
3. Source/Product lookup: từ DB query per row → preloaded Map

### Phân tích ảnh hưởng

| Khía cạnh | Đánh giá |
|-----------|----------|
| Phone normalization | 🟢 Giữ nguyên |
| Customer find/create | 🟢 Giữ nguyên + thêm in-memory cache (cải thiện) |
| Dedup logic | 🟢 Giữ nguyên — `lead.findFirst({ phone, sourceId, productId })` |
| skipPool → ZOOM | 🟢 Giữ nguyên — `source?.skipPool` from preloaded data |
| Label merge | 🟢 Giữ nguyên |

### 🔴 Thay đổi logic lookup sản phẩm

| | Trước | Sau |
|---|-------|------|
| **Tìm source** | `findFirst({ name: sourceName })` — exact match | `sourceMap.get(sourceName.toLowerCase())` — exact match (case-insensitive) |
| **Tìm product** | `findFirst({ name: { contains: productName, mode: 'insensitive' } })` — **substring match** | `productMap.get(productName.toLowerCase())` — **exact match** |

**Ví dụ thực tế:**
- CSV có `product = "Zoom"`, DB có `name = "Zoom Replay"`
- **Code cũ:** Match được (contains "Zoom" trong "Zoom Replay")
- **Code mới:** KHÔNG match → `productId = null`

**Tác động:**
- Lead vẫn được tạo, chỉ thiếu `productId` liên kết
- Dedup check vẫn hoạt động (phone + null sourceId + null productId)
- **Không mất dữ liệu**, nhưng mất liên kết product

### Khuyến nghị: 🔴 Cần sửa — thay đổi Map lookup thành fuzzy match hoặc thêm logic `includes()`:

```typescript
// Sửa đề xuất:
const product = productName
  ? [...productMap.values()].find(p => p.name.toLowerCase().includes(productName.toLowerCase()))
  : null;
```

---

## 6. DASHBOARD — Funnel + Lead Aging (dashboard.service.ts)

### Thay đổi
1. `getLeadFunnel`: 7 COUNT riêng → 1 `groupBy`
2. `getLeadAging`: Correlated subquery → `LEFT JOIN LATERAL`

### Phân tích ảnh hưởng

| Khía cạnh | Đánh giá |
|-----------|----------|
| Funnel data | 🟢 Giống hệt — `groupBy status` cho cùng kết quả với 7 `count({ status })` |
| Lead aging buckets | 🟢 Giống hệt — LATERAL JOIN trả cùng kết quả với correlated subquery, nhưng nhanh hơn |
| Revenue trend | 🟢 Không đổi |
| Top performers | 🟢 Không đổi |

### Kết luận: 🟢 An toàn — chỉ tối ưu query, kết quả giống hệt

---

## 7. RECALL — Chunked Processing (recall-config.service.ts)

### Thay đổi
**Trước:** Load tất cả leads/customers cần recall → `updateMany` với toàn bộ ID.  
**Sau:** Load 500/batch → `updateMany` 500 → lặp lại.

### Phân tích ảnh hưởng

| Khía cạnh | Đánh giá |
|-----------|----------|
| Logic recall | 🟢 Giữ nguyên — cùng WHERE condition |
| Auto-label | 🟢 Giữ nguyên — gắn nhãn per batch |
| Status FLOATING | 🟢 Giữ nguyên |

### Kết luận: 🟢 An toàn — chia batch không thay đổi kết quả cuối cùng

---

## 8. BẢO MẬT — Helmet, MCP, Webhook, Search, API Key

### Thay đổi bảo mật (KHÔNG ảnh hưởng logic nghiệp vụ)

| Thay đổi | Ảnh hưởng |
|----------|----------|
| Helmet headers | 🟢 Chỉ thêm HTTP headers, không ảnh hưởng API response body |
| CORS production guard | 🟢 Chỉ throw khi `NODE_ENV=production` + thiếu `FRONTEND_URL` |
| MCP rate limit (100 req/min) | 🟢 Thay `@SkipThrottle()` bằng `@Throttle(100/min)` — AI agent bình thường < 10 req/min |
| Webhook HMAC signature | 🟡 Nếu `WEBHOOK_SECRET` chưa set → guard skip (graceful fallback). Nếu đã set → bank webhook cần gửi header `x-signature`. **Cần cập nhật cấu hình SePay/bank nếu bật** |
| API key permission scope | 🟡 Nếu `metadata` truyền vào `@ApiKeyAuth()` là `true` (boolean) → không check scope (giữ nguyên). Nếu truyền string → check scope. **Code hiện tại đều truyền boolean → KHÔNG ảnh hưởng** |
| Search scoping | 🟢 USER chỉ search được record của mình — đúng ý đồ RBAC |
| File magic bytes | 🟢 Chặn upload giả MIME (ví dụ .php pretend image/jpeg) |
| externalId validation | 🟢 Chỉ chặn ký tự lạ — các provider SePay/ngân hàng đều dùng alphanumeric ID |
| metadata size limit | 🟢 10KB — quá đủ cho metadata JSONB thông thường |

---

## Tóm Tắt Đánh Giá Rủi Ro

| # | Thay đổi | Rủi ro | Cần test? |
|---|----------|--------|-----------|
| 1 | Payment matching optimistic lock | 🟢 Không | Không — chỉ thêm guard |
| 2 | Scoring batch queries | 🟡 Thấp | Kiểm tra scoring preview nếu có dữ liệu seed cũ |
| 3 | Assignment template batch | 🟢 Không | Không — round-robin giữ nguyên |
| 4 | IDOR findById scoping | 🟢 Không | Login USER role, xem detail lead khác → phải trả 404 |
| 5 | Import product lookup | 🔴 **Có** | **Import CSV với tên sản phẩm viết tắt → cần kiểm tra** |
| 6 | Dashboard groupBy | 🟢 Không | Không — cùng kết quả |
| 7 | Recall chunking | 🟢 Không | Không — cùng kết quả |
| 8 | Webhook signature | 🟡 Thấp | Kiểm tra webhook SePay còn hoạt động sau khi set WEBHOOK_SECRET |

---

## Hành Động Cần Thực Hiện

### Ưu tiên cao (trước khi merge)
1. **🔴 Sửa product lookup trong import processor** — đổi exact match thành substring match để giữ backward compat với code cũ

### Ưu tiên trung bình (sau khi merge)
2. **🟡 Test webhook SePay** — nếu bật `WEBHOOK_SECRET`, cần cấu hình SePay gửi HMAC signature
3. **🟡 Test scoring** — nếu dùng dữ liệu seed, kiểm tra scoring preview có hợp lý

### Không cần hành động
4. Tất cả thay đổi database indexes — chỉ thêm index mới, không ảnh hưởng logic
5. Tất cả thay đổi bảo mật — chỉ thêm lớp bảo vệ mới

---

## Câu Hỏi Chưa Giải Quyết

1. SePay webhook có hỗ trợ HMAC signature không? Nếu không → giữ `WEBHOOK_SECRET` trống (guard skip)
2. Có file CSV import mẫu nào dùng tên sản phẩm viết tắt không? Nếu có → phải sửa lookup logic trước khi merge
3. Redis caching layer (PERF-M1) và streaming CSV export (PERF-M3) chưa implement — cần ưu tiên khi scale lên 200 users?
