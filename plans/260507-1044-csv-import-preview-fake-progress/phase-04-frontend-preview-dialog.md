# Phase 04 - Frontend Preview Dialog + UploadZone Rewrite

## Context Links

- Parent plan: [plan.md](plan.md)
- Design doc: Section 5.5
- Dependencies: Phase 03 (cần API /start, /cancel + previewSummary)
- Blocks: Phase 05 (progress bar mount khi user start)

## Overview

- **Date:** 2026-05-07
- **Priority:** P2
- **Effort:** 2h
- **Status:** completed
- **Description:** Rewrite UploadZone để vào state machine: idle -> uploading -> reviewing -> importing -> done. Thêm `ImportPreviewDialog` hiện count + sample errors + nút Import/Huỷ.

## Key Insights

- State frontend phải đồng bộ với backend status (PENDING_REVIEW, REVIEWED, PROCESSING, COMPLETED, FAILED, CANCELLED)
- Sau upload, auto poll status mỗi 1s (nhanh hơn 3s hiện tại) cho tới khi != PENDING_REVIEW
- Khi REVIEWED -> tự động mở dialog preview
- Dialog blocking: user phải chọn Import hoặc Huỷ, không click outside để dismiss
- Refresh trang giữa flow -> đọc status từ backend khôi phục UI (job đang PENDING_REVIEW -> tiếp tục poll, REVIEWED -> mở dialog lại)
- Existing `JobStatusRow` đã poll status mỗi 3s - reuse logic, chỉ thêm xử lý 3 status mới

## Requirements

### Functional
- UploadZone state: `idle` -> chọn file -> `uploading` -> upload xong -> `polling-review` (status PENDING_REVIEW) -> `reviewing` (REVIEWED, dialog mở) -> [Import] `importing` (PROCESSING) -> `done` (COMPLETED/FAILED) hoặc [Huỷ] `cancelled`
- `ImportPreviewDialog` hiện:
  - Count: "X dòng hợp lệ", "Y dòng lỗi" (style xanh/đỏ)
  - Sample 5 errors inline: row + message
  - Nút "Tải file lỗi" (link tới existing endpoint)
  - Nút "Huỷ" (gray) + nút "Import X dòng hợp lệ" (primary, sky-500)
  - Disable nút Import khi validRows = 0
- Toast notify mỗi state change quan trọng

### Non-functional
- Polling KHÔNG ngừng khi user navigate đi (cần cancel khi unmount)
- Dialog responsive (mobile + desktop)
- Tiếng Việt 100%
- Sky blue + Cyan design system

## Architecture

```
csv-import-upload-with-job-status.tsx (rewrite)
  UploadZone (slim, chỉ upload + tạo job)
    -> POST /imports/{type}
    -> onJobCreated(job) -> parent

  CsvImportPageClient (state container)
    state: jobs[], activePreviewJob?: ImportJob
    handleJobCreated -> push to jobs, set activePreviewJob nếu PENDING_REVIEW
    poll loop -> khi status REVIEWED -> setActivePreviewJob(job)
    handleStartImport(job) -> POST /:id/start -> update status -> close dialog
    handleCancelImport(job) -> POST /:id/cancel -> update status -> close dialog

import-preview-dialog.tsx (NEW)
  props: { job: ImportJob | null, onConfirm: () => Promise<void>, onCancel: () => Promise<void> }
  conditional render khi job?.status === 'REVIEWED'
  Card: count + sample errors table + 2 buttons
  Loading state cho Import / Huỷ buttons khi async

JobStatusRow (existing - extend)
  Status badge thêm: PENDING_REVIEW (sky), REVIEWED (cyan), CANCELLED (gray)
  Polling logic: tăng frequency lên 1s khi PENDING_REVIEW (nhanh review), giữ 3s khi PROCESSING
```

## Related Code Files

### Read
- `apps/web/src/components/import/csv-import-upload-with-job-status.tsx` (existing - 268 lines)
- `apps/web/src/components/import/import-template-dialog.tsx` (existing - dialog pattern)
- `apps/web/src/lib/api-client.ts` - check API call helper pattern
- `apps/web/src/lib/utils.ts` - formatDateTime helper
- `apps/web/src/components/ui/*` - shadcn dialog/button/card components

### Modify
- `apps/web/src/components/import/csv-import-upload-with-job-status.tsx` (state machine + integration)

### Create
- `apps/web/src/components/import/import-preview-dialog.tsx`

### Delete
- (none)

## Implementation Steps

1. **Đọc existing component để map state cũ**
   - Note `UploadZone`, `JobStatusRow`, `CsvImportPageClient` flow

2. **Extract `JOB_STATUS_COLORS` + `JOB_STATUS_LABELS`** thêm 3 status mới:
   ```typescript
   PENDING_REVIEW: 'bg-sky-100 text-sky-700' / 'Đang kiểm tra'
   REVIEWED: 'bg-cyan-100 text-cyan-700' / 'Chờ xác nhận'
   CANCELLED: 'bg-slate-100 text-slate-500' / 'Đã huỷ'
   ```

3. **Update `ImportJob` interface** thêm:
   ```typescript
   previewSummary?: {
     totalRows: number;
     validRows: number;
     errorRows: number;
     sampleErrors: Array<{ row: number; message: string }>;
   };
   reviewedAt?: string;
   startedAt?: string;
   ```

4. **Tạo `import-preview-dialog.tsx`**
   - Component nhận `job: ImportJob | null` (null -> không render)
   - Render Dialog (shadcn) với:
     - Header: "Kết quả kiểm tra file"
     - Body:
       - Stats card: 2 cột (hợp lệ xanh / lỗi đỏ)
       - Sample errors table (max 5 rows)
       - Link "Tải file lỗi đầy đủ" nếu errorRows > 0
     - Footer: 2 nút - "Huỷ" (variant outline) + "Import X dòng hợp lệ" (primary)
   - Disable nút Import khi `validRows === 0`
   - Loading state cho cả 2 nút khi parent đang gọi API
   - DialogContent không cho click outside dismiss (user phải chọn explicit)

5. **Refactor `CsvImportPageClient`**
   - State: `activePreviewJobId: string | null`
   - Watch jobs[] -> khi 1 job chuyển status REVIEWED -> setActivePreviewJobId(job.id)
   - `handleStartImport(jobId)`: call `POST /imports/${id}/start`, update jobs[], close dialog
   - `handleCancelImport(jobId)`: call `POST /imports/${id}/cancel`, update jobs[], close dialog
   - Render `<ImportPreviewDialog job={jobs.find(j => j.id === activePreviewJobId)} ... />`

6. **Update polling trong `JobStatusRow`**
   - Polling chạy khi status in (PENDING_REVIEW, PROCESSING)
   - Frequency: 1s khi PENDING_REVIEW, 3s khi PROCESSING
   - Stop khi status = REVIEWED, COMPLETED, FAILED, CANCELLED
   - Cleanup interval đúng cách (return cleanup từ useEffect, không dùng useState() trick hiện tại)

7. **Update toast messages**
   - Upload xong: "Đã upload, đang kiểm tra dữ liệu..."
   - REVIEWED: "Kiểm tra xong, vui lòng xác nhận"
   - Start: "Bắt đầu import..."
   - COMPLETED: "Import xong: X thành công, Y lỗi"
   - CANCELLED: "Đã huỷ import"
   - FAILED: "Import thất bại"

8. **Smoke test browser**
   - Upload CSV nhỏ -> dialog mở -> Import -> chạy -> done
   - Upload + Huỷ -> CANCELLED
   - Refresh trang giữa REVIEWED -> dialog mở lại
   - Upload file all-error -> dialog hiện validRows=0, nút Import disabled

## Todo List

- [ ] Đọc existing csv-import component
- [ ] Update `ImportJob` interface + status colors/labels (3 mới)
- [ ] Tạo `import-preview-dialog.tsx` với count + sample + 2 buttons
- [ ] Refactor `CsvImportPageClient` quản lý activePreviewJob
- [ ] Implement handleStartImport + handleCancelImport API calls
- [ ] Fix polling logic (1s/3s + cleanup)
- [ ] Update toast messages tiếng Việt
- [ ] Smoke test full flow + cancel + refresh + all-error edge case

## Success Criteria

- [ ] Upload file -> auto poll -> khi REVIEWED dialog tự mở
- [ ] Dialog hiện đúng count + 5 sample errors + nút tải file lỗi
- [ ] Bấm Import -> API /start gọi, status PROCESSING, dialog đóng
- [ ] Bấm Huỷ -> API /cancel gọi, status CANCELLED, dialog đóng
- [ ] Refresh giữa REVIEWED -> dialog reload đúng
- [ ] All-error CSV -> nút Import disabled
- [ ] Polling cleanup khi unmount (không leak interval)
- [ ] Status badge màu sắc đúng cho 3 status mới

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Polling leak khi navigate | MED | Dùng useEffect cleanup đúng (không dùng useState trick) |
| Dialog mở duplicate khi job update nhiều lần | LOW | useEffect dependency chỉ trigger khi status transition vào REVIEWED |
| Race: user bấm Huỷ giữa lúc worker đang dry-run | MED | Backend state guard handle (PENDING_REVIEW -> CANCELLED OK) |
| BigInt `id` so sánh giữa state và API response | MED | Luôn dùng string compare cho `id`, parse khi cần |

## Security Considerations

- API call qua `/api/proxy` đã có auth cookie -> Bearer token (existing pattern)
- previewSummary từ backend trust được (server-side validated)
- Sample error message render plain text (không dangerouslySetInnerHTML) -> no XSS

## Next Steps

- Phase 05: thêm progress bar component khi status PROCESSING
- Phase 06: e2e test full flow
