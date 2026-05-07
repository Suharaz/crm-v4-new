# Phase 03 - Backend Endpoints Start + Cancel

## Context Links

- Parent plan: [plan.md](plan.md)
- Design doc: Section 5.3
- Dependencies: Phase 01 (status enum), Phase 02 (service refactor + dryRun flag)
- Blocks: Phase 04 (frontend cần API call /start /cancel)

## Overview

- **Date:** 2026-05-07
- **Priority:** P2
- **Effort:** 1h
- **Status:** completed
- **Description:** Thêm 2 endpoints `POST /imports/:id/start` (chuyển từ REVIEWED -> PROCESSING + enqueue insert job) và `POST /imports/:id/cancel` (chuyển sang CANCELLED + xoá file). Permission: chỉ creator hoặc super_admin.

## Key Insights

- State transition guard: chỉ cho `start` khi status = REVIEWED, chỉ cho `cancel` khi status in (PENDING_REVIEW, REVIEWED). Throw 409 nếu sai state
- Reuse file đã upload (lưu path trong `fileUrl`) -> không upload lại
- `cancel` xoá file trên disk để tránh rò rỉ + xoá job? Không, giữ job với status CANCELLED để audit. Chỉ xoá file vật lý.
- Activity log: tạo Activity entry khi start/cancel để admin xem ai làm gì khi nào
- Permission pattern: theo ownership hiện tại (existing `getStatus` đã check createdBy + role). Reuse helper

## Requirements

### Functional
- `POST /imports/:id/start`:
  - Permission: creator hoặc super_admin
  - Status hiện tại MUST = REVIEWED, else 409
  - Update status -> PROCESSING, set startedAt = now
  - Enqueue BullMQ với `dryRun: false`
  - Return updated job
- `POST /imports/:id/cancel`:
  - Permission: tương tự
  - Status hiện tại MUST in (PENDING_REVIEW, REVIEWED), else 409
  - Update status -> CANCELLED, completedAt = now
  - Xoá file vật lý ở `fileUrl` (best-effort, log warning nếu fail)
  - Return updated job

### Non-functional
- Idempotent: gọi start 2 lần liên tiếp -> lần 2 return 409 (không enqueue 2 jobs)
- Audit trail qua Activity log

## Architecture

```
ImportController
  POST /:id/start
    -> ImportService.startImport(id, user)

  POST /:id/cancel
    -> ImportService.cancelImport(id, user)

ImportService
  startImport(id, user):
    job = await getStatus(id, user)         // existing - permission check
    if job.status !== 'REVIEWED' throw 409
    await prisma.importJob.update({ status: PROCESSING, startedAt: now })
    await importQueue.add('process-import', { ..., dryRun: false })
    await activityService.log({ type: NOTE, entityType: 'IMPORT_JOB', entityId: id, userId, content: 'Bắt đầu import sau review' })
    return updated

  cancelImport(id, user):
    job = await getStatus(id, user)
    if !['PENDING_REVIEW', 'REVIEWED'].includes(job.status) throw 409
    await prisma.importJob.update({ status: CANCELLED, completedAt: now })
    try { fs.promises.unlink(absPath(job.fileUrl)) } catch (e) { logger.warn(...) }
    await activityService.log({ ..., content: 'Huỷ import job' })
    return updated
```

## Related Code Files

### Read
- `apps/api/src/modules/import/import.controller.ts` - existing routes pattern
- `apps/api/src/modules/import/import.service.ts` - `getStatus` ownership pattern
- `apps/api/src/modules/auth/decorators/roles-required.decorator.ts` - role decorator
- `apps/api/src/modules/auth/decorators/current-user-param.decorator.ts` - user param
- `apps/api/src/modules/activities/activity.service.ts` (if exists) - activity log pattern
- `apps/api/src/common/pipes/parse-bigint.pipe.ts` - bigint param parsing

### Modify
- `apps/api/src/modules/import/import.controller.ts` - thêm 2 routes
- `apps/api/src/modules/import/import.service.ts` - thêm `startImport()` + `cancelImport()`
- `apps/api/src/modules/import/import.module.ts` - inject ActivityService nếu chưa có

### Create
- (none - reuse existing files)

### Delete
- (none)

## Implementation Steps

1. **Đọc controller + service hiện tại** để nắm pattern routes + permission

2. **Đọc activity service** để biết cách tạo activity log entry. Nếu chưa có entityType `IMPORT_JOB`, document quyết định: bỏ activity log này (defer) HOẶC dùng entityType generic + content text mô tả

3. **Thêm `startImport()` vào ImportService**
   - Reuse `getStatus(id, user)` cho permission check
   - State guard
   - Atomic update (status + startedAt) trong 1 query
   - Enqueue với `dryRun: false`
   - Activity log (optional, defer nếu không có IMPORT_JOB type)

4. **Thêm `cancelImport()` vào ImportService**
   - Reuse `getStatus`
   - State guard
   - Update status + completedAt
   - Xoá file: dùng `path.resolve` + check stays inside `uploadDir` (giống `getErrorFilePath`)
   - Try/catch unlink -> log warning, không throw nếu file không còn

5. **Thêm 2 routes vào controller**
   ```typescript
   @Post(':id/start')
   async startImport(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
     return { data: await this.service.startImport(id, user) };
   }

   @Post(':id/cancel')
   async cancelImport(@Param('id', ParseBigIntPipe) id: bigint, @CurrentUser() user: any) {
     return { data: await this.service.cancelImport(id, user) };
   }
   ```

6. **Update GET /:id/status response shape**
   - Đảm bảo trả `previewSummary` khi status = REVIEWED
   - Đảm bảo trả `startedAt`, `reviewedAt` để frontend tính progress
   - Check BigInt serialization interceptor handle Json field OK

7. **Smoke test với curl/REST client**
   - POST /imports/leads (upload) -> assert status PENDING_REVIEW
   - Wait worker dry-run -> GET /imports/:id/status -> assert status REVIEWED + previewSummary có data
   - POST /imports/:id/start -> assert status PROCESSING
   - Wait worker -> GET status -> assert COMPLETED

8. **Test cancel flow**
   - Upload + cancel ngay -> assert CANCELLED + file bị xoá

## Todo List

- [ ] Đọc controller + service + activity log pattern
- [ ] Implement `startImport()` trong service
- [ ] Implement `cancelImport()` trong service (kèm unlink file)
- [ ] Thêm POST /:id/start route
- [ ] Thêm POST /:id/cancel route
- [ ] Verify GET /:id/status trả previewSummary
- [ ] Smoke test full flow upload -> review -> start -> done
- [ ] Smoke test cancel flow
- [ ] typecheck + build pass

## Success Criteria

- [ ] POST /:id/start works: REVIEWED -> PROCESSING, enqueue dryRun=false
- [ ] POST /:id/cancel works: PENDING_REVIEW|REVIEWED -> CANCELLED, file xoá
- [ ] State guard: gọi start trên job COMPLETED -> 409
- [ ] State guard: gọi cancel trên job PROCESSING -> 409
- [ ] Permission: USER khác không phải creator -> 403
- [ ] Activity log entry tạo (hoặc decision documented nếu defer)
- [ ] GET /:id/status trả `previewSummary` khi REVIEWED

## Risk Assessment

| Risk | Severity | Mitigation |
|---|---|---|
| Race condition: 2 user cùng start 1 job | LOW | DB update với `where: { id, status: 'REVIEWED' }` + count returned rows = 0 -> throw 409 |
| File unlink fail (file bị lock) | LOW | Try/catch + log warning, không block cancel |
| Activity log entityType chưa có IMPORT_JOB | MED | Document decision trong code: defer activity log, ghi note trong PR |
| Path traversal qua fileUrl bị tampering | MED | Dùng `path.resolve` + check inside uploadDir (giống `getErrorFilePath`) |

## Security Considerations

- Permission check phải **trước** mọi DB write
- Path traversal: validate `fileUrl` resolved path stays inside `uploadDir`
- IDOR: USER không phải creator gọi /start /cancel -> 403 (reuse `getStatus` check)
- Rate limit: existing `Roles(MANAGER, SUPER_ADMIN)` đã giới hạn ai gọi được, không cần thêm rate limit riêng

## Next Steps

- Phase 04: frontend gọi POST /start, POST /cancel + transition UI state
- Phase 05: progress bar mount khi status PROCESSING
