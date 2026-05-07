---
title: "CSV Import Preview + Fake Progress Bar"
description: "Pre-upload validation dry-run, preview dialog, fake progress bar 2 phút cho CSV import leads/customers"
status: completed
priority: P2
effort: 7h
branch: master
tags: [import, csv, ux, preview, progress-bar, leads, customers]
created: 2026-05-07
---

# CSV Import Preview + Fake Progress Bar

## Goal

Cải thiện UX upload CSV: validate trước khi insert, hiện count "X hợp lệ / Y lỗi" + sample errors, cho user xác nhận import dòng hợp lệ. Khi import hiện fake progress bar 2 phút thay spinner mờ ám.

## Design Reference

- Brainstorm + design doc: [`../reports/brainstorm-260507-1033-csv-import-preview-fake-progress.md`](../reports/brainstorm-260507-1033-csv-import-preview-fake-progress.md)
- Approach chốt: **C - State machine trên `ImportJob`** (thêm enum PENDING_REVIEW, REVIEWED, CANCELLED)

## Key Decisions

- 1 entity `ImportJob` shared cho dry-run + insert (DRY)
- 1 worker chia sẻ logic, branch theo flag `dryRun`
- File upload 1 lần, lưu trên disk, reuse cho cả 2 lần parse
- Fake progress: linear 0-99% trong 2 phút, ease-out lên 100% khi xong (client-side JS)
- Backward compat: existing POST /imports/leads|customers giữ nguyên endpoint, chỉ status mặc định đổi

## Phases

| # | File | Status | Effort | Description |
|---|------|--------|--------|-------------|
| 01 | [phase-01-schema-migration.md](phase-01-schema-migration.md) | completed | 0.5h | Prisma enum + fields + migration |
| 02 | [phase-02-refactor-validation-service.md](phase-02-refactor-validation-service.md) | completed | 1.5h | Extract `ImportValidationService`, branch `dryRun` |
| 03 | [phase-03-backend-endpoints-start-cancel.md](phase-03-backend-endpoints-start-cancel.md) | completed | 1h | POST /:id/start, /:id/cancel + permission |
| 04 | [phase-04-frontend-preview-dialog.md](phase-04-frontend-preview-dialog.md) | completed | 2h | UploadZone rewrite + Preview Dialog |
| 05 | [phase-05-fake-progress-bar.md](phase-05-fake-progress-bar.md) | completed | 1h | useFakeProgress hook + ProgressBar |
| 06 | [phase-06-tests-qa.md](phase-06-tests-qa.md) | completed | 1h | Unit + e2e + manual QA |

## Dependencies

```
Phase 01 (schema) -> Phase 02 (processor refactor)
Phase 02 -> Phase 03 (endpoints reuse service)
Phase 03 -> Phase 04 (frontend cần API mới)
Phase 04 -> Phase 05 (progress bar mount trong preview flow)
Phase 05 -> Phase 06 (test full flow)
```

Sequential, không có parallel opportunity (effort tổng < 8h, không cần optimize).

## Success Criteria

- Upload CSV -> thấy preview "X hợp lệ / Y lỗi" + sample 5 lỗi đầu trong < 30s
- Bấm Import -> chỉ insert dòng valid, fake progress chạy 2 phút smooth
- Job xong sớm -> bar ease-out lên 100%
- Job FAILED -> UI snap về error state ngay
- Backward compat: existing tests pass, manual upload flow vẫn chạy

## Out of Scope (defer)

- Inline edit dòng lỗi
- Real progress hybrid (fake là đủ với scope hiện tại)
- Cron xoá file mồ côi (file 10MB cap, defer)
- Áp dụng cho upload khác ngoài CSV import

## Unresolved Questions

- Permission /start, /cancel: chốt creator + super_admin (giống ownership pattern hiện tại)
- Activity log khi start/cancel: thêm trong phase-03 cho audit
