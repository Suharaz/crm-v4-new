# Phase 02 - Refactor Processor + ImportValidationService

## Context Links

- Parent plan: [plan.md](plan.md)
- Design doc: Section 5.4 + 5.7
- Dependencies: Phase 01 (cần enum + fields mới)
- Blocks: Phase 03 (endpoints reuse logic), Phase 04 (frontend cần status REVIEWED)

## Overview

- **Date:** 2026-05-07
- **Priority:** P2
- **Effort:** 1.5h
- **Status:** completed
- **Description:** Extract validation + insert logic từ `ImportProcessor` ra service mới `ImportValidationService` để DRY. Branch processor theo flag `dryRun`. Update `import.service.ts` mặc định tạo job với status PENDING_REVIEW.

## Key Insights

- `import.processor.ts` hiện tại có 422 dòng, mix logic: parse CSV + validate row + insert + write error file. Tách validate + insert ra service làm code dễ test + reuse
- Dry-run KHÔNG insert, chỉ count + collect 5 sample errors đầu (giảm payload `previewSummary`)
- Insert mode (sau khi user start) bỏ qua validate trùng lặp -> dùng cờ flag `skipInvalidRows: true` để skip những row đã biết lỗi từ dry-run (best-effort, vẫn re-validate vì DB state có thể đổi)
- Lookup tables (sources, products, labels) preload 1 lần per worker run -> giữ nguyên optimization
- Worker chạy cùng `BullMQ` job name `process-import` cho cả 2 mode, phân biệt qua `data.dryRun`

## Requirements

### Functional
- `ImportValidationService.validateLeadRow(row, lookups)` -> `{ valid: boolean, error?: string, warnings: string[], parsed?: ParsedLead }`
- `ImportValidationService.validateCustomerRow(row, lookups)` -> tương tự
- `ImportValidationService.insertLead(parsed, createdBy)` -> insert thật vào DB (chuyển từ `processLeadRow` hiện tại)
- `ImportValidationService.insertCustomer(parsed, createdBy)` -> tương tự
- `ImportProcessor` branch: `dryRun=true` -> chỉ validate + write `previewSummary`, `dryRun=false` -> validate + insert nếu valid, skip nếu invalid
- `ImportService.createImportJob()` mặc định enqueue với `dryRun: true`, status job = `PENDING_REVIEW`

### Non-functional
- Tổng time complexity giữ nguyên (preload lookup, in-memory cache phone)
- Code coverage: validation service có test riêng (phase 06)

## Architecture

```
import.processor.ts (slim, ~150 lines)
  process(job) {
    parse CSV
    for each row:
      result = validationService.validate{Lead|Customer}Row(row, lookups)
      if dryRun:
        count valid/error, collect 5 sample errors
      else:
        if !result.valid: skip (counted as error, write to error file)
        else: validationService.insert{Lead|Customer}(result.parsed, createdBy)
    update ImportJob:
      if dryRun: status=REVIEWED, previewSummary={...}, reviewedAt=now
      else: status=COMPLETED, totalRows/successCount/errorCount, errorFileUrl

import-validation.service.ts (NEW, ~250 lines)
  validateLeadRow(row, lookups): ValidationResult<ParsedLead>
  validateCustomerRow(row, lookups): ValidationResult<ParsedCustomer>
  insertLead(parsed, createdBy): Promise<void>
  insertCustomer(parsed, createdBy): Promise<void>
  // private helpers: normalizePhone wrap, label resolve, etc.

import.service.ts
  createImportJob() -> tạo job status=PENDING_REVIEW, enqueue { dryRun: true }
  startImport(jobId, user) -> [Phase 03]
  cancelImport(jobId, user) -> [Phase 03]
```

`ParsedLead` shape (TypeScript interface trong @crm/types hoặc local):
```typescript
interface ParsedLead {
  phone: string;
  name: string;
  email: string | null;
  sourceId: bigint | null;
  productId: bigint | null;
  labelNames: string[];      // raw CSV labels (resolve khi insert)
  noteRaw: string;
  metadata: Record<string, string>;
  rowNum: number;             // for error file
}
```

## Related Code Files

### Read
- `apps/api/src/modules/import/import.processor.ts` (existing - 422 lines)
- `apps/api/src/modules/import/import.service.ts` (existing)
- `apps/api/src/modules/import/import.module.ts` (existing - check provider list)
- `apps/api/src/modules/import/csv-detect.ts` (existing - encoding/delimiter)
- `apps/api/src/modules/customers/customer-phones.service.ts` (existing - dedup helper)
- `packages/utils/src/index.ts` - tìm `normalizePhone`, `isValidVNPhone` exports

### Modify
- `apps/api/src/modules/import/import.processor.ts` (slim down, branch dryRun)
- `apps/api/src/modules/import/import.service.ts` (default `dryRun: true` + status `PENDING_REVIEW`)
- `apps/api/src/modules/import/import.module.ts` (register `ImportValidationService` provider)

### Create
- `apps/api/src/modules/import/import-validation.service.ts`

### Delete
- (none)

## Implementation Steps

1. **Đọc + map logic hiện tại**
   - Đọc `import.processor.ts` để identify 2 phương thức `processLeadRow` + `processCustomerRow`
   - List dependencies: `prisma`, `customerPhonesService`, lookup maps

2. **Tạo `ImportValidationService` skeleton**
   - File: `apps/api/src/modules/import/import-validation.service.ts`
   - `@Injectable()` class
   - Constructor inject `PrismaClient` + `CustomerPhonesService`
   - Public methods: `validateLeadRow`, `validateCustomerRow`, `insertLead`, `insertCustomer`
   - Define `ValidationResult<T>` interface + `ParsedLead` + `ParsedCustomer` (interfaces local file)

3. **Migrate logic từ processor**
   - `processLeadRow` -> split thành `validateLeadRow` (parse + check) + `insertLead` (DB writes)
   - `processCustomerRow` tương tự
   - Validation phần: throw -> return `{ valid: false, error: msg }`
   - Insert phần: vẫn throw nếu DB error (caller catch)

4. **Refactor `import.processor.ts`**
   - Inject `ImportValidationService`
   - Loop logic mới:
     ```typescript
     for await (row of parser) {
       const result = type === 'leads'
         ? validationService.validateLeadRow(row, lookups, phoneCache)
         : validationService.validateCustomerRow(row, lookups);
       if (!result.valid) {
         errorCount++;
         errors.push({ row, message: result.error });
         continue;
       }
       if (!dryRun) {
         try {
           await (type === 'leads'
             ? validationService.insertLead(result.parsed, createdBy)
             : validationService.insertCustomer(result.parsed, createdBy));
           successCount++;
         } catch (e) {
           errorCount++;
           errors.push({ row, message: e.message });
         }
       } else {
         validRows++;
       }
     }
     ```
   - Branch update DB cuối:
     - `dryRun`: status=REVIEWED, previewSummary={ totalRows, validRows, errorRows, sampleErrors: errors.slice(0, 5) }, reviewedAt=now
     - `!dryRun`: existing behavior (COMPLETED + errorFileUrl)

5. **Update `import.service.ts`**
   - `createImportJob()` tạo `ImportJob` với `status: 'PENDING_REVIEW'`
   - Enqueue job với `dryRun: true` trong payload
   - Job data type: `{ importJobId, type, filePath, dryRun: boolean }`

6. **Register service trong module**
   - `import.module.ts` providers thêm `ImportValidationService`

7. **Type fix các nơi exhaustive switch**
   - Grep `ImportJobStatus` trong codebase, tìm switch/case -> thêm xử lý PENDING_REVIEW/REVIEWED/CANCELLED

8. **Smoke test**
   - `pnpm --filter @crm/api typecheck`
   - `pnpm --filter @crm/api build`

## Todo List

- [ ] Đọc import.processor.ts + import.service.ts hiện tại
- [ ] Tạo file `import-validation.service.ts` với skeleton
- [ ] Migrate `validateLeadRow` + `insertLead` từ processor
- [ ] Migrate `validateCustomerRow` + `insertCustomer`
- [ ] Refactor processor branch theo `dryRun`
- [ ] Update import.service.ts -> default status PENDING_REVIEW + dryRun=true
- [ ] Register `ImportValidationService` trong import.module.ts
- [ ] Grep ImportJobStatus + fix exhaustive switch nếu có
- [ ] Run typecheck + build pass

## Success Criteria

- [ ] `import-validation.service.ts` tồn tại với 4 public methods
- [ ] `import.processor.ts` < 200 lines (đạt rule code splitting)
- [ ] Worker process cùng job với `dryRun: true` -> không insert, write previewSummary
- [ ] Worker process job với `dryRun: false` -> insert dòng valid, skip + record dòng error
- [ ] Existing typecheck + build pass
- [ ] Backward compat: `POST /imports/leads` vẫn return job object (chỉ status đổi)

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Logic insert race condition (phone cache stale giữa dry-run + insert) | MED | Document trong UI: preview là best-effort. Insert lần 2 vẫn validate phone trùng |
| Code refactor break test hiện có | HIGH | Run e2e import test sau refactor (phase 06) |
| `previewSummary` payload quá lớn (5000 row, 100 lỗi) | LOW | Chỉ lưu top 5 sample, full errors vẫn ghi error file CSV (phase sau optional) |
| Type drift giữa worker payload và service signature | MED | Define interface `ImportJobData` ở 1 nơi, import 2 chỗ |

## Security Considerations

- Validation service không thêm SQL injection risk (vẫn dùng Prisma ORM)
- Sample errors expose 5 row data đầu lỗi -> đảm bảo không leak SĐT người khác (chỉ là file CSV user upload, OK)
- Dry-run query lookup tables -> giữ nguyên permission scope (job creator)

## Next Steps

- Phase 03: thêm endpoints /start, /cancel để consume status REVIEWED
- Phase 04: frontend đọc previewSummary và hiện dialog
