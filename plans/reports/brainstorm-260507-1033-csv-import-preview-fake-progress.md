# Brainstorm - CSV Import Preview + Fake Progress Bar

**Date:** 2026-05-07
**Type:** Brainstorm / Design
**Scope:** CSV import (leads + customers)
**Status:** Approved by user, ready for `/ck:plan`

---

## 1. Problem Statement

Flow upload CSV hiện tại (apps/web/src/components/import/csv-import-upload-with-job-status.tsx):
1. User chọn file -> POST `/imports/leads|customers`
2. API lưu file + tạo `ImportJob` (status PROCESSING) + enqueue BullMQ
3. Worker (`ImportProcessor`) parse + insert thẳng -> chỉ biết kết quả khi xong
4. Frontend poll status mỗi 3s, hiện spinner

**Vấn đề UX:**
- User không biết file có hợp lệ trước khi insert -> lỡ import 5000 row, 4000 lỗi mới phát hiện
- Chỉ có spinner, không có progress -> user không biết còn bao lâu, dễ tưởng treo
- Phải tải file lỗi rồi sửa Excel -> ma sát cao

## 2. Final Requirements

| ID | Requirement |
|---|---|
| R1 | Sau upload, server validate file (dry-run) -> hiện count "X hợp lệ / Y lỗi" + sample 5 dòng lỗi đầu inline + nút tải full CSV lỗi |
| R2 | User bấm "Import X dòng hợp lệ" -> insert chỉ dòng hợp lệ, auto skip dòng lỗi |
| R3 | User có thể "Huỷ" -> xoá file + job bị mark CANCELLED |
| R4 | Khi import, bar fake tăng từ 0% -> 99% trong 2 phút (client-side JS) |
| R5 | Job xong sớm: smooth animate lên 100% (không snap giật) |
| R6 | Job chưa xong sau 2 phút: bar dừng 99% chờ |
| R7 | Job FAILED: bar chuyển trạng thái lỗi rõ ràng |

## 3. Non-Goals (out of scope)

- Inline edit dòng lỗi trên web (YAGNI - user dùng Excel sửa)
- Hybrid real progress (R4 đã chốt fake)
- Warning vs error riêng (gộp chung "lỗi" cho đơn giản)
- Áp dụng cho upload khác ngoài CSV import

## 4. Approaches Evaluated

### Approach A - Sync Preview Endpoint
- POST /imports/leads/preview (sync parse + validate trong request)
- POST /imports/leads (insert thật, upload lại)
- **Pros:** đơn giản, không thêm state
- **Cons:** file 10MB sync -> timeout risk, block worker NestJS, upload 2 lần (UX kém), DRY violation

### Approach B - Two-Phase Async (Preview Job + Insert Job tách riêng)
- 2 entity riêng biệt
- **Pros:** scale tốt
- **Cons:** schema phức tạp, lifecycle file khó quản, over-engineering

### Approach C - State Machine trên `ImportJob` **(CHỌN)**
- Mở rộng enum status: thêm PENDING_REVIEW, REVIEWED, CANCELLED
- 1 entity, 1 file, 1 worker chia sẻ qua flag `dryRun`
- **Pros:** DRY/KISS, file upload 1 lần, resume-friendly, không cần Redis cache
- **Cons:** parse 2 lần (acceptable cho 10MB)

## 5. Recommended Solution (Approach C - chi tiết)

### 5.1 State Machine

```
[upload]
   v
PENDING_REVIEW  <- worker dry-run (validate, không insert)
   v
REVIEWED        <- preview ready, frontend hiện bảng
   |---> [user bấm Huỷ]   -> CANCELLED (xoá file)
   |---> [user bấm Import] -> PROCESSING
                                 v
                              COMPLETED | FAILED
```

### 5.2 Schema Changes

```prisma
enum ImportJobStatus {
  PENDING_REVIEW   // mới
  REVIEWED         // mới
  PROCESSING       // existing
  COMPLETED
  FAILED
  CANCELLED        // mới
}

model ImportJob {
  // existing fields giữ nguyên
  previewSummary  Json?    // { totalRows, validRows, errorRows, sampleErrors[] }
  reviewedAt      DateTime?
  startedAt       DateTime?  // khi user bấm Import
}
```

`previewSummary` shape:
```typescript
{
  totalRows: number;
  validRows: number;
  errorRows: number;
  sampleErrors: Array<{ row: number; message: string }>;  // top 5
  errorFileUrl: string | null;  // tải full nếu cần
}
```

### 5.3 API Surface

| Method | Endpoint | Mục đích | Status |
|---|---|---|---|
| POST | `/imports/leads` | Upload + tạo job PENDING_REVIEW + enqueue dry-run | Existing (hành vi đổi) |
| POST | `/imports/customers` | Tương tự cho customers | Existing (hành vi đổi) |
| GET | `/imports/:id/status` | Trả status + previewSummary nếu REVIEWED | Existing (response thêm field) |
| POST | `/imports/:id/start` | Confirm import -> enqueue insert job | **MỚI** |
| POST | `/imports/:id/cancel` | Huỷ -> xoá file, status CANCELLED | **MỚI** |
| GET | `/imports/:id/error-file` | Tải CSV lỗi | Existing |

### 5.4 Worker Refactor

Tách validation logic ra service mới `ImportValidationService`:

```
import.processor.ts
  process(job: { importJobId, type, filePath, dryRun: boolean })
    parse CSV
    for each row:
      result = validationService.validateRow(row, type, lookups)
      if dryRun:
        if result.error: count error, push sampleError nếu < 5
        else: count valid
      else (insert mode):
        if result.error: skip (đã biết từ dry-run)
        else: validationService.insertRow(row, type)  <- logic insert hiện tại
    update ImportJob (REVIEWED nếu dryRun, COMPLETED nếu insert)
```

### 5.5 Frontend UX Flow

```
[1. Drop file]
   v
[2. "Đang kiểm tra..." spinner]   <- poll status mỗi 1s
   v
[3. Bảng review]
   +--------------------------------------+
   | OK  4850 dòng hợp lệ                 |
   | X   100 dòng lỗi  [Tải file lỗi]    |
   |                                      |
   | Sample lỗi:                          |
   | - Dòng 5: SĐT không hợp lệ: 0123abc |
   | - Dòng 12: Sản phẩm "X" không tồn... |
   | - Dòng 27: Trùng lead: SĐT + nguồn   |
   | - Dòng 34: Thiếu số điện thoại       |
   | - Dòng 89: SĐT không hợp lệ: 12345  |
   |                                      |
   | [Huỷ]   [Import 4850 dòng hợp lệ]   |
   +--------------------------------------+
   v
[4. Fake progress 0% -> 99% trong 2 phút]
   v (job COMPLETED)
[5. Smooth animate -> 100% + toast success]
```

### 5.6 Fake Progress Logic (Client-side JS)

```typescript
// hook: use-fake-progress.ts
const FAKE_DURATION_MS = 120_000;  // 2 phút
const SMOOTH_FINISH_MS = 1_500;     // 1.5s smooth khi xong

function useFakeProgress(isRunning: boolean, isDone: boolean) {
  const [progress, setProgress] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  // Phase 1: linear 0 -> 99 trong 2 phút
  useEffect(() => {
    if (!isRunning || isDone) return;
    startTimeRef.current = Date.now();
    const tick = () => {
      const elapsed = Date.now() - (startTimeRef.current ?? 0);
      const pct = Math.min(99, (elapsed / FAKE_DURATION_MS) * 99);
      setProgress(pct);
    };
    const interval = setInterval(tick, 100);
    return () => clearInterval(interval);
  }, [isRunning, isDone]);

  // Phase 2: smooth từ progress hiện tại -> 100 khi job xong
  useEffect(() => {
    if (!isDone) return;
    const start = progress;
    const startTime = Date.now();
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1, elapsed / SMOOTH_FINISH_MS);
      const eased = 1 - Math.pow(1 - t, 3);  // ease-out cubic
      setProgress(start + (100 - start) * eased);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [isDone]);

  return progress;
}
```

**Behavior:**
- Job xong tại 25% -> smooth ease-out lên 100% trong 1.5s
- Job xong tại 95% -> smooth lên 100% trong 1.5s
- Job > 2 phút chưa xong -> bar đứng 99% chờ
- Job FAILED -> bar reset, hiện icon X đỏ + message

### 5.7 Files Affected

**Backend:**
- `packages/database/prisma/schema.prisma` - thêm enum + fields + migration
- `apps/api/src/modules/import/import.service.ts` - thêm `startImport()`, `cancelImport()`, sửa `createImportJob()` mặc định kèm `dryRun: true`
- `apps/api/src/modules/import/import.controller.ts` - thêm 2 route POST `/:id/start`, `/:id/cancel`
- `apps/api/src/modules/import/import.processor.ts` - branch theo `dryRun` flag
- `apps/api/src/modules/import/import-validation.service.ts` - **MỚI** - extract `validateRow()` + `insertRow()` từ processor
- `apps/api/src/modules/import/import.module.ts` - register service mới

**Frontend:**
- `apps/web/src/components/import/csv-import-upload-with-job-status.tsx` - rewrite UploadZone + JobStatusRow theo state machine
- `apps/web/src/components/import/import-preview-dialog.tsx` - **MỚI** - bảng review với sample errors
- `apps/web/src/components/import/import-progress-bar.tsx` - **MỚI** - fake progress component
- `apps/web/src/hooks/use-fake-progress.ts` - **MỚI** - hook logic 2-phase

## 6. Implementation Considerations

### Risks

| Risk | Mitigation |
|---|---|
| Worker parse 2 lần -> tốn CPU | Acceptable cho 10MB cap. Lookup tables preload 1 lần per worker run |
| File mồ côi (REVIEWED không confirm) | Cron xoá file + job status REVIEWED quá 1h |
| User refresh trang giữa preview | State đã ở DB -> refresh load lại từ `GET /imports/:id/status` |
| Race condition: 2 user upload cùng SĐT, preview OK cả 2, insert 1 thành công 1 fail | Document trong UI: "Preview là best-effort, có thể vẫn lỗi khi import" |
| FAILED khi bar đang fake 95% | UI snap về error state ngay, KHÔNG để 99% rồi đột ngột "thất bại" |

### Backward Compatibility

- POST `/imports/leads|customers` vẫn hoạt động, chỉ là giờ status mặc định = `PENDING_REVIEW` thay vì `PROCESSING`
- API consumer cần adapt: thêm step gọi `/start` sau khi review
- Existing `ImportJob` cũ trong DB không bị ảnh hưởng (status PROCESSING/COMPLETED/FAILED giữ nguyên)
- Frontend là consumer duy nhất hiện tại -> rewrite trong cùng PR

### Effort Estimate

| Phase | Effort |
|---|---|
| Schema + migration | 0.5h |
| Refactor processor + validation service | 1.5h |
| Backend new endpoints (start/cancel) | 1h |
| Frontend rewrite UploadZone + Preview Dialog | 2h |
| Fake progress hook + Progress Bar | 1h |
| Test (unit + e2e) | 1h |
| **Total** | **~7h** |

## 7. Success Metrics

- User upload file sai header -> phát hiện trong < 10s thay vì sau khi insert (current)
- Số lần user phải upload lại (do file lỗi nhiều) giảm
- Bar progress hiện thị mượt, không bị "kẹt" hoặc nhảy giật

## 8. Validation Criteria

- [ ] Upload file CSV hợp lệ -> hiện count + sample errors + nút Import
- [ ] Bấm "Import X hợp lệ" -> chỉ insert dòng valid, dòng lỗi skip
- [ ] Bấm "Huỷ" -> file bị xoá, job CANCELLED
- [ ] Progress bar tăng đều 0->99% trong 2 phút khi import
- [ ] Job xong sớm -> bar smooth lên 100% (không giật)
- [ ] Job > 2 phút chưa xong -> bar dừng 99% chờ
- [ ] Job FAILED -> UI hiện trạng thái lỗi rõ ràng
- [ ] Refresh trang giữa flow -> state restore từ DB
- [ ] File header sai (không có cột phone) -> báo lỗi global, không cho preview
- [ ] Backward compat: POST /imports/* không break existing test

## 9. Next Steps & Dependencies

- **Dependencies:** không có. Schema đổi nhỏ, không ảnh hưởng module khác
- **Phase 2 (future, optional):** inline edit cho dòng lỗi - chỉ làm nếu user thực sự yêu cầu sau khi ship Phase 1
- **Recommended:** chạy `/ck:plan` để break design này thành phases với todo list cụ thể

## 10. Unresolved Questions

- Cron xoá file mồ côi (REVIEWED quá 1h): cần thêm hay defer? Hiện file 10MB cap nên đĩa không bùng nhanh -> defer được.
- Permission cho `/start` và `/cancel`: chỉ creator hay cả manager+ ? Đề xuất: creator + super_admin (giống ownership pattern hiện tại).
- I18n message lỗi: giữ tiếng Việt như hiện tại.
