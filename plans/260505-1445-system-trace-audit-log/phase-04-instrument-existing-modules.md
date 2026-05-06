# Phase 04 - Instrument Existing Cron Jobs + Recall Activity Log

**Priority:** P1 | **Status:** Pending | **Est:** 2h | **Depends:** Phase 02 + 03

## Overview
Wire `CronRunService.track()` vào 3 cron jobs hiện có. Đồng thời fix bug observability của recall: gọi `ActivitiesService.logActivity()` mỗi khi recall lead/customer để có per-entity audit trail.

## Requirements
- 3 cron jobs hiện có đều ghi cron_runs row
- Recall events tạo entry trong `activities` (per-entity timeline) + `audit_logs` (system action)
- Không thay đổi logic business của cron - chỉ thêm tracking
- Backward compatible: cron vẫn chạy nếu tracking lỗi

## 3 Cron Jobs Cần Instrument

| File | Line | Schedule | Job Name |
|---|---|---|---|
| `apps/api/src/modules/recall-config/recall-config.service.ts` | 127 | `*/5 * * * *` | `auto-recall` |
| `apps/api/src/modules/notifications/notifications.service.ts` | 61 | `0 3 * * *` | `notification-cleanup` (xác nhận lúc impl) |
| `apps/api/src/modules/tasks/tasks.service.ts` | 225 | `*/1 * * * *` | `task-reminder` (xác nhận lúc impl) |

## Architecture

### Pattern wire-in
**Trước:**
```ts
@Cron('*/5 * * * *')
async runAutoRecall() {
  try {
    const total = await this._doWork();
    this.logger.log(`Done. Total: ${total}`);
  } catch (err) { this.logger.error('Lỗi', err); }
}
```

**Sau:**
```ts
@Cron('*/5 * * * *')
async runAutoRecall() {
  try {
    await this.cronRunService.track('auto-recall', async (ctx) => {
      const total = await this._doWork();
      ctx.affected = total;
      ctx.metadata = { recalledLabels: this._lastLabelStats };
      return total;
    });
  } catch (err) {
    // already logged in cron_runs as FAILED - just keep Logger for stdout
    this.logger.error('Lỗi auto-recall', err instanceof Error ? err.stack : err);
  }
}
```

### Recall activity logging (per-entity)
Trong `_recallLeads`, `_recallCustomers`, `_recallLeadsByLabel`:
- Sau khi `updateMany` xong → loop qua `leadIds`/`customerIds` và gọi `activitiesService.logActivity()` với:
  - `entityType: 'LEAD' | 'CUSTOMER'`
  - `entityId: each id`
  - `userId: SYSTEM_USER_ID` (hoặc nullable - cần quyết định)
  - `type: 'SYSTEM'`
  - `content`: `"Tự động thu hồi về kho thả nổi (label: Nóng, sau 7 ngày)"` hoặc tương tự
  - `metadata`: `{ trigger: 'AUTO_RECALL_LABEL', labelId, recallMinutes, previousAssignedUserId, previousDepartmentId }`

⚠️ **Trade-off:** Loop insert N rows = N queries. Nếu recall 500 leads/lần → 500 inserts.
- **Giải pháp:** Dùng `prisma.activity.createMany()` để batch insert.
- Phải capture `previousAssignedUserId` + `previousDepartmentId` **TRƯỚC** khi `updateMany` (vì sau update mất thông tin).

### Capture previous state (CHANGE in recall logic)
Trong 3 hàm private `_recallLeads/_recallCustomers/_recallLeadsByLabel`:
- Đổi `select: { id: true }` → `select: { id: true, assignedUserId: true, departmentId: true }`
- Pass mảng này vào activity log call

## Related Code Files

### Read first
- `apps/api/src/modules/recall-config/recall-config.service.ts` (đầy đủ file)
- `apps/api/src/modules/notifications/notifications.service.ts` (line 50-100)
- `apps/api/src/modules/tasks/tasks.service.ts` (line 220-280)
- `apps/api/src/modules/activities/activities.service.ts:166-185` - `logActivity` method

### Modify
- `apps/api/src/modules/recall-config/recall-config.service.ts`:
  - Inject `CronRunService` + `ActivitiesService`
  - Wrap `runAutoRecall()` với `track()`
  - Sửa 3 hàm `_recall*` để batch log activity + capture previous state
- `apps/api/src/modules/recall-config/recall-config.module.ts`:
  - Import `CronRunModule` + `ActivitiesModule`
- `apps/api/src/modules/notifications/notifications.service.ts`:
  - Inject `CronRunService`
  - Wrap cron với `track()`
- `apps/api/src/modules/notifications/notifications.module.ts`:
  - Import `CronRunModule`
- `apps/api/src/modules/tasks/tasks.service.ts`:
  - Inject `CronRunService`
  - Wrap cron với `track()`
- `apps/api/src/modules/tasks/tasks.module.ts`:
  - Import `CronRunModule`

### Create
- (none - chỉ modify)

## Implementation Steps

### Step 1 - Recall config (lớn nhất)
1. Đọc `recall-config.service.ts` đầy đủ
2. Inject 2 services mới qua constructor
3. Tạo helper private:
```ts
private async _logRecallActivities(
  type: 'LEAD' | 'CUSTOMER',
  items: Array<{ id: bigint; assignedUserId: bigint | null; departmentId?: bigint | null }>,
  reason: string,
  metadata: Record<string, unknown>,
) {
  if (items.length === 0) return;
  await this.prisma.activity.createMany({
    data: items.map(item => ({
      entityType: type,
      entityId: item.id,
      userId: SYSTEM_USER_ID, // need decision
      type: 'SYSTEM',
      content: reason,
      metadata: { ...metadata, previousAssignedUserId: item.assignedUserId?.toString(), previousDepartmentId: item.departmentId?.toString() },
    })),
  });
}
```

⚠️ **Decision needed:** `Activity.userId` là `BigInt` (NOT NULL trong schema hiện tại). System action không có user → cần 1 trong 2:
- **(a)** Dùng user `SYSTEM` (id=1 chẳng hạn) - tạo trong seed
- **(b)** Đổi schema `userId BigInt?` (nullable) - migration nhỏ

→ Đề xuất **(a)** để không động schema cũ. Tạo system user `system@internal` role SUPER_ADMIN, status INACTIVE để không login được.

4. Sửa `_recallLeads`:
   - Đổi select để lấy `assignedUserId`
   - Sau `updateMany` → call `_logRecallActivities('LEAD', leads, ...)`
5. Tương tự `_recallCustomers` (cần thêm `assignedDepartmentId` vào select)
6. Tương tự `_recallLeadsByLabel` - log thêm `labelId` + `recallMinutes` vào metadata
7. Wrap `runAutoRecall()` với `cronRunService.track()`:
   - `ctx.affected = totalRecalled`
   - `ctx.metadata = { byEntity: { LEAD: x, CUSTOMER: y, LABEL: z } }`

### Step 2 - Notifications cron
1. Đọc cron logic
2. Inject `CronRunService`
3. Wrap với `track('notification-cleanup', ...)` (đặt tên jobName phù hợp với logic thực tế)

### Step 3 - Tasks cron
1. Tương tự bước 2 với jobName `task-reminder`

### Step 4 - Seed system user
- File: `packages/database/prisma/seed.ts` (hoặc seed riêng)
- Insert user `system@internal` với password random hash, status INACTIVE
- Export constant `SYSTEM_USER_ID` qua `@crm/database` để dùng chung

### Step 5 - Manual test
```bash
# Restart API → đợi 5 phút
# Hoặc trigger manually qua endpoint debug

psql $DATABASE_URL -c "SELECT * FROM cron_runs WHERE job_name='auto-recall' ORDER BY started_at DESC LIMIT 3;"
psql $DATABASE_URL -c "SELECT entity_type, count(*) FROM activities WHERE type='SYSTEM' AND metadata->>'trigger' LIKE 'AUTO_RECALL%' GROUP BY entity_type;"
```

## Todo List
- [ ] Đọc 4 files ở "Read first"
- [ ] Quyết định + tạo system user (Phase 04 sub-step)
- [ ] Modify recall-config: inject services, wrap track, log activities, capture previous state
- [ ] Modify recall-config.module: import CronRunModule + ActivitiesModule
- [ ] Modify notifications.service: wrap track
- [ ] Modify notifications.module: import CronRunModule
- [ ] Modify tasks.service: wrap track
- [ ] Modify tasks.module: import CronRunModule
- [ ] `pnpm build --filter=api` không lỗi
- [ ] Manual trigger 1 cron, verify cron_runs + activities có row mới

## Success Criteria
- 3 cron jobs đều có row trong `cron_runs` mỗi lần chạy
- Recall lead/customer → có row tương ứng trong `activities` với `type='SYSTEM'`
- Per-recall metadata chứa: trigger, labelId (nếu label-based), previousAssignedUserId, previousDepartmentId
- Cron vẫn chạy bình thường nếu `cronRunService.track()` lỗi (graceful degradation)
- Logger console vẫn có log như cũ (giữ backward compat)

## Risk Assessment
- **R1:** Hard-code `SYSTEM_USER_ID` → fragile nếu seed khác môi trường → mitigation: env var `SYSTEM_USER_ID` hoặc lookup theo email khi init
- **R2:** Batch insert activities crash khi 1 lead có lỗi → toàn bộ batch fail → mitigation: chunk 100 mỗi createMany call, try/catch chunk độc lập
- **R3:** Cron run quá lâu (> 5 phút interval) → 2 instance chạy đồng thời → mitigation: check existing RUNNING row trước khi start (concurrency lock đơn giản)

## Security Considerations
- System user phải có `status=INACTIVE` để không thể login dù có credentials
- Activity log chứa `previousAssignedUserId` → có thể leak ai từng giữ lead → chấp nhận (audit là mục đích)

## Next Steps
- Phase 05 (frontend): hiển thị `cron_runs` + `activities` system events
- Phase 06: tests + retention cron
