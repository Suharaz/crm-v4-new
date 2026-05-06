# Phase 02 - Frontend Upload UI (Tab trong /payments)

**Priority:** P1 (depends on 01)
**Status:** ✅ Done (2026-04-22)
**Effort:** 2h

## Context

Thêm **tab "Import sao kê CSV"** vào trang `/payments` hiện có - không tạo sub-route riêng. SA-only. 1-step flow (không preview).

**Files context:**
- `apps/web/src/app/(dashboard)/payments/page.tsx` - trang payments hiện tại (cần xem structure để biết có tab system chưa hay phải thêm mới)
- `apps/web/src/app/(dashboard)/import/page.tsx` - pattern upload Excel reference (copy UX flow)
- `apps/web/src/lib/api-client.ts` - fetch wrapper
- `apps/web/src/hooks/use-auth.ts` (hoặc tương đương) - check role SA

## Key Insights

- Đặt làm tab (không sub-route) → không vỡ URL cũ, không cần sửa middleware, user quen flow payments
- Nếu `/payments` chưa có tab system → thêm `<Tabs>` component (shadcn đã có) với 2 tab: "Danh sách thanh toán" (hiện tại) + "Import sao kê"
- Tab "Import sao kê" **chỉ hiển thị khi role=SA** - dùng conditional render, không cần hide-via-css
- API-client đã handle token refresh cho các request khác → dùng lại cho multipart upload (có thể cần thêm case `FormData` trong api-client nếu chưa hỗ trợ)

## Requirements

**Functional:**
- Mở `/payments` → thấy 2 tab nếu là SA, 1 tab nếu không phải
- Tab "Import sao kê" chứa:
  - Card "Hướng dẫn" ngắn (3 step)
  - Button "Tải template CSV" → GET `/bank-transactions/import/template` → download
  - File input (accept `.csv`) + Upload button → POST multipart `/bank-transactions/import`
  - Loading state (disable button, spinner) khi đang upload
  - Result panel: 4 metric card + errors table
  - Toast feedback
- Non-SA user → tab này không render

**Non-functional:**
- Vietnamese UI, responsive, design system sky blue + glassmorphism
- Không block tab "Danh sách thanh toán" - user vẫn chuyển tab qua lại bình thường

## Architecture

```
/payments (page.tsx, Server Component wrap Client)
    ↓
<Tabs defaultValue="list">
    ├─ TabsList:
    │   ├─ <TabsTrigger value="list">Danh sách thanh toán</TabsTrigger>
    │   └─ {isSA && <TabsTrigger value="import">Import sao kê CSV</TabsTrigger>}
    ├─ <TabsContent value="list"> ← component hiện có (giữ nguyên)
    └─ <TabsContent value="import"> ← <BankImportTab /> (MỚI)

<BankImportTab /> (Client Component)
    ↓
State: file, result, loading, error
Actions:
  ├─ downloadTemplate() → fetch GET blob → <a download>
  └─ uploadFile() → FormData → POST multipart → setResult()
Render:
  ├─ Hướng dẫn card (3 step)
  ├─ Download template button
  ├─ File input + Upload button
  └─ Result panel (conditional)
      ├─ 4 metric: Total / Imported / Skipped / Matched
      └─ Errors table (nếu errors.length > 0)
```

## Related Files

**Modify:**
- `apps/web/src/app/(dashboard)/payments/page.tsx` - wrap content hiện tại vào `<TabsContent value="list">`, thêm `<TabsContent value="import"><BankImportTab/></TabsContent>`
- `apps/web/src/lib/api-client.ts` - verify handle `FormData` (content-type auto); nếu không → thêm case

**Create:**
- `apps/web/src/components/payments/bank-import-tab.tsx` - client component (~150 lines)

**Delete:** Không

## Implementation Steps

1. Đọc `apps/web/src/app/(dashboard)/payments/page.tsx` hiện tại → hiểu structure (có tab chưa? Client/Server Component?)
2. Đọc `apps/web/src/app/(dashboard)/import/page.tsx` lấy pattern download/upload
3. Verify `api-client.ts` hỗ trợ FormData - sửa nếu cần
4. Tạo `bank-import-tab.tsx` component:
   - 'use client'
   - State hooks
   - Implement downloadTemplate + uploadFile
   - Render hướng dẫn + actions + result panel
5. Sửa `payments/page.tsx`:
   - Import shadcn `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
   - Import `BankImportTab`
   - Check role (useCurrentUser hook)
   - Wrap content cũ + thêm tab mới
6. Build: `pnpm --filter @crm/web build` → 0 error
7. Visual check: login SA → `/payments` → thấy 2 tab → click import → UI render OK

## Todo List

- [ ] Đọc `payments/page.tsx` hiện tại + `/import/page.tsx` reference
- [ ] Verify/sửa api-client cho FormData
- [ ] Tạo `bank-import-tab.tsx` với state + actions
- [ ] Implement downloadTemplate (blob + trigger download)
- [ ] Implement uploadFile với loading + error handling
- [ ] Result panel: 4 metric card + errors table
- [ ] Toast success/error
- [ ] Sửa `payments/page.tsx` thêm tab system
- [ ] Conditional render tab chỉ cho SA
- [ ] Build pass + responsive check mobile

## Success Criteria

- [ ] Build `pnpm --filter @crm/web build` không lỗi
- [ ] SA login → `/payments` → thấy tab "Import sao kê CSV", click vào → trang render full
- [ ] Non-SA (MANAGER/USER) → `/payments` → chỉ thấy tab "Danh sách thanh toán", không thấy tab import
- [ ] Tab "Danh sách thanh toán" **hoạt động y hệt như trước** (regression)
- [ ] Click "Tải template" → download file CSV, mở Excel OK
- [ ] Upload CSV mock → result panel hiển thị đúng 4 metric + errors (nếu có)
- [ ] Mobile: tab list không vỡ, nội dung stack dọc

## Risk Assessment

| Risk | Mitigation |
|---|---|
| `/payments/page.tsx` chưa có tab system | Thêm shadcn `<Tabs>` - KISS, không phá structure |
| FormData chưa được api-client support | Check `Content-Type` handling - không set manual, để browser auto. Add fetch wrapper cho multipart |
| Token expire giữa upload | api-client auto refresh - verify reuse |
| SA role check sai (non-SA vẫn thấy tab) | Hard gate: `if (role !== 'SUPER_ADMIN') return null` - test cả 2 role |

## Security Considerations

- Permission gate: conditional render tab + BE đã `@Roles(SUPER_ADMIN)` - 2 lớp
- File blob download: `URL.revokeObjectURL` sau khi trigger, không leak memory
- Không log content/filename vào console

## Next

→ [phase-03-test-docs-ship.md](phase-03-test-docs-ship.md)
