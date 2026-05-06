# Phase 01 - Backend CSV Import

**Priority:** P0 (blocks 02, 03)
**Status:** ✅ Done (2026-04-22)
**Effort:** 3h

## Context

Backend layer cho bank transaction CSV import. Reuse `BankTransactionsService.ingest()` đã có - chỉ thêm CSV parser layer phía trên + endpoint upload + endpoint download template.

**Files context:**
- `apps/api/src/modules/bank-transactions/bank-transactions.service.ts` - `ingest()` đã sẵn, dedup unique externalId
- `apps/api/src/modules/payments/payment-matching.service.ts` - `tryMatchBankTransaction()` (gọi tự động trong `ingest()`)
- `apps/api/src/modules/payments/payment-import.service.ts` - pattern tham khảo (Excel + generateTemplate)
- `packages/database/prisma/schema.prisma:463` - schema `BankTransaction` (KHÔNG đổi)

## Key Insights

- `csv-parse` đã có sẵn trong `apps/api/package.json` - dùng async iterator API cho streaming, tránh load cả file vào RAM khi file to
- `ingest()` throw `ConflictException` khi trùng externalId → wrapper phải catch để skip, không abort batch
- `ingest()` đã gọi `tryMatchBankTransaction()` ở cuối → import xong = auto-match xong, không cần làm thêm
- Multer upload đã quen dùng ở `payment-import` (Excel) → reuse `@nestjs/platform-express` `FileInterceptor` pattern

## Requirements

**Functional:**
- POST `/api/v1/bank-transactions/import` - multipart file CSV → trả `{ total, imported, skipped_duplicate, auto_matched, errors[] }`
- GET `/api/v1/bank-transactions/import/template` - trả file CSV template với 7 cột header tiếng Việt + 1 row ví dụ
- Parser **ignore unknown columns** - chỉ pick cột match `HEADER_MAP`, cột thừa silently bỏ qua (giống pattern `PaymentImportService`)
- Sửa `ingest()` để fallback `transactionTime = new Date()` khi không có
- Sửa webhook DTO: `transactionTime?: string` (optional)

**Non-functional:**
- File size limit: 10MB (giống upload khác)
- MIME validate: chỉ chấp nhận `text/csv`, `application/vnd.ms-excel`, `text/plain`
- Encoding: UTF-8 (auto-detect BOM, strip nếu có)
- Permission: `@Roles(SUPER_ADMIN)` (assumption - xem plan unresolved)

## Architecture

```
HTTP POST /bank-transactions/import (multipart)
    ↓
FileInterceptor → buffer
    ↓
BankTransactionImportService.importFromCsv(buffer, userId)
    ├─ parse CSV với csv-parse (header: true, bom: true)
    ├─ preload: BankAccount.findMany() → Map<lowerName, account>
    ├─ for each row:
    │   ├─ validate (amount > 0, content !empty, bankAccount match)
    │   ├─ build payload (map cột VN → field API)
    │   ├─ externalId = row.externalId || `csv-${sha1(...)}`
    │   ├─ transactionTime = parseFlexDate(row.time) || undefined (service fallback now())
    │   └─ try BankTransactionsService.ingest(payload)
    │       ├─ success → result.imported++; nếu matched → result.auto_matched++
    │       ├─ ConflictException → result.skipped_duplicate++
    │       └─ other → result.errors.push({row, reason})
    └─ return result
```

## Related Files

**Modify:**
- `apps/api/src/modules/bank-transactions/bank-transactions.service.ts`
  - Line ~54: bỏ `throw new BadRequestException('transactionTime là bắt buộc')`
  - Line ~75: `transactionTime: data.transactionTime ? new Date(data.transactionTime) : new Date()`
  - Trả về `{ bankTx, matched: boolean }` để biết auto-match thành công không (cho counter)
- `apps/api/src/modules/bank-transactions/bank-transactions.controller.ts`
  - Webhook DTO: `transactionTime?: string`
  - Thêm `POST /bank-transactions/import` (FileInterceptor + Roles SA)
  - Thêm `GET /bank-transactions/import/template` (Header CSV)
- `apps/api/src/modules/bank-transactions/bank-transactions.module.ts` - add `BankTransactionImportService` providers

**Create:**
- `apps/api/src/modules/bank-transactions/bank-transaction-import.service.ts` (~150 lines max)

## Implementation Steps

1. Sửa `bank-transactions.service.ts` - fallback transactionTime (1 dòng), bỏ validation, return type include `matched` flag
2. Tạo `bank-transaction-import.service.ts`:
   - Constants: HEADER_MAP (Vietnamese → field), CSV_HEADERS (template), MAX_FILE_SIZE
   - Helpers: `parseVNAmount()`, `parseFlexDate()`, `generateExternalId()` (sha1 hash fallback)
   - Method `importFromCsv(buffer: Buffer, userId: bigint): Promise<ImportResult>`
   - Method `generateTemplate(): string` (CSV string với BOM)
3. Sửa controller - thêm 2 endpoint, FileInterceptor (10MB limit, MIME check)
4. Update module - provide service mới
5. Build: `pnpm --filter @crm/api build` → 0 error
6. Manual smoke test với mock CSV qua curl/Postman

## Todo List

- [ ] Sửa `ingest()` fallback transactionTime
- [ ] Tạo `bank-transaction-import.service.ts`
- [ ] Helpers parseVNAmount + parseFlexDate + generateExternalId
- [ ] Method `importFromCsv()` với loop + try/catch ConflictException
- [ ] Method `generateTemplate()` (UTF-8 BOM + 7 headers + 1 sample row)
- [ ] Thêm 2 endpoints controller (import POST + template GET)
- [ ] Update module
- [ ] Build pass + lint pass

## Success Criteria

- [ ] Build `pnpm --filter @crm/api build` không lỗi
- [ ] Curl POST với file CSV mẫu → response JSON đúng schema
- [ ] Curl GET template → file CSV mở được trong Excel, header tiếng Việt hiển thị đúng (BOM)
- [ ] Webhook cũ vẫn hoạt động khi gửi đầy đủ field (regression)
- [ ] Webhook gửi không có `transactionTime` → vẫn insert thành công với `now()`

## Risk Assessment

| Risk | Mitigation |
|---|---|
| CSV encoding (Windows-1258 từ bank cũ) | Dùng `iconv-lite` nếu detect encoding lạ - nhưng KISS: yêu cầu UTF-8 trong docs trước, escalate khi user báo |
| Hash collision khi auto-gen externalId | sha1 → 32 chars hex = 128 bit → collision impossible thực tế |
| File CSV quá lớn (>10k row) | Streaming parser của csv-parse - không OOM. Nhưng response timeout có thể issue → cần queue (BullMQ) trong tương lai. KISS: 10k row chấp nhận sync trước, monitor |
| Race với webhook cùng externalId | Unique constraint DB chặn - 1 trong 2 sẽ thua → ConflictException → skip OK |

## Security Considerations

- File upload: MIME whitelist + size limit + filename không lưu (chỉ lấy buffer)
- Permission: `@Roles(SUPER_ADMIN)` - financial data sensitive
- Không log nội dung CSV (có thể chứa thông tin nhạy cảm về người gửi)
- Audit: ghi `Activity` log khi import xong (entity=SYSTEM, type=BANK_IMPORT, metadata={total, imported, ...})

## Next

→ [phase-02-frontend-upload-ui.md](phase-02-frontend-upload-ui.md)
