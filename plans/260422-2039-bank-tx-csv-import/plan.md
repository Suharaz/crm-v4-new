# Plan: Bank Transaction CSV Import

**Created:** 2026-04-22 20:39
**Owner:** Suhara
**Branch:** `master`

## Context

Bank không còn push qua API webhook. Kế toán giờ tải file CSV sao kê từ bank → cần chức năng import CSV vào hệ thống, **giữ nguyên** logic auto-match `tryMatchBankTransaction()` đã sẵn.

**Liên quan:**
- `apps/api/src/modules/bank-transactions/` - service + controller hiện tại
- `apps/api/src/modules/payments/payment-matching.service.ts` - auto-match (reuse 100%)
- `packages/database/prisma/schema.prisma:463` - `BankTransaction` model (KHÔNG đổi schema)
- Pattern tham khảo: `apps/api/src/modules/payments/payment-import.service.ts` (Excel import payment)

## Decisions Locked

| Quyết định | Giá trị |
|---|---|
| Schema migration | **KHÔNG** - `transactionTime` giữ NOT NULL, fallback `new Date()` ở service |
| CSV format | 1 template chung của hệ thống (KISS, không per-bank parser) |
| Bank field | Text tự do, validate match `BankAccount.name` (case-insensitive) |
| externalId thiếu | Auto-hash `sha1(time+amount+content+senderAcc).slice(0,32)` để dedup |
| Lib parse CSV | `csv-parse` (đã có sẵn trong deps) |
| Dedup retry | Catch `ConflictException` từ `ingest()` → đếm `skipped_duplicate`, không abort cả file |
| Auto-match | Reuse `tryMatchBankTransaction()` - gọi sau mỗi insert thành công |
| Permission | **SUPER_ADMIN only** |
| Upload flow | **1-step** (chọn file → upload → xem kết quả, không preview) |
| FE placement | **Tab trong `/payments` page** (không tạo sub-route riêng) |
| Test data | **File CSV thực tế** do user cung cấp khi tới phase 03 |

## Phases

| # | Phase | Effort | Status |
|---|---|---|---|
| 01 | Backend - service + controller + DTO | 3h | ✅ Done |
| 02 | Frontend - upload page + integration | 2h | ✅ Done |
| 03 | Test, docs update, commit + push | 1h | ✅ Done |

**Total:** ~6h. Sequential (FE chờ BE done).

## Files Touch List

**Modify:**
- `apps/api/src/modules/bank-transactions/bank-transactions.service.ts` - bỏ throw transactionTime required, fallback `new Date()`
- `apps/api/src/modules/bank-transactions/bank-transactions.controller.ts` - webhook DTO transactionTime optional, thêm 2 endpoints (import + template)
- `apps/api/src/modules/bank-transactions/bank-transactions.module.ts` - provide new service
- `apps/web/src/app/(dashboard)/payments/page.tsx` - thêm **tab "Import sao kê"** vào layout tab hiện có
- `docs/api-reference.md`, `docs/project-changelog.md`, `docs/project-roadmap.md` - update

**Create:**
- `apps/api/src/modules/bank-transactions/bank-transaction-import.service.ts` - parse CSV + loop ingest
- `apps/api/src/modules/bank-transactions/dto/import-bank-tx.dto.ts` (nếu cần class-validator)
- `apps/web/src/components/payments/bank-import-tab.tsx` - component tab upload (client component)

**Delete:** Không

## Success Criteria

- [ ] Upload file CSV chuẩn → tất cả row valid được tạo `BankTransaction`
- [ ] Row trùng `externalId` → skip + đếm vào `skipped_duplicate`, không crash
- [ ] Row thiếu `transactionTime` → tự fill `new Date()`, insert thành công
- [ ] Row có bank không match `BankAccount.name` → reject + báo lý do
- [ ] Sau insert, `tryMatchBankTransaction()` chạy → payment PENDING khớp được auto VERIFIED
- [ ] Download template CSV → mở Excel hiển thị đúng 7 cột tiếng Việt
- [ ] Webhook cũ vẫn hoạt động (regression test)
- [ ] Lint pass, build pass, không có type error

## Unresolved Questions

Tất cả đã chốt (2026-04-22 20:47). Xem "Decisions Locked" phía trên.

---

**Phase files:**
- [phase-01-backend-csv-import.md](phase-01-backend-csv-import.md)
- [phase-02-frontend-upload-ui.md](phase-02-frontend-upload-ui.md)
- [phase-03-test-docs-ship.md](phase-03-test-docs-ship.md)
