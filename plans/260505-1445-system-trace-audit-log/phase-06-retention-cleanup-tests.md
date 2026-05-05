# Phase 06 — Retention Cron + Tests

**Priority:** P1 | **Status:** Pending | **Est:** 2h | **Depends:** Phase 02-05

## Overview
Cron retention 60 ngày: xoá row `audit_logs` + `cron_runs` cũ hơn cutoff. Viết unit + integration tests cho audit log + cron run + sanitizer. Verify end-to-end flow.

## Requirements
- Cron chạy 1 lần/ngày (3:30 AM — sau notifications cleanup)
- Xoá row `created_at < now() - 60 days`
- Track chính cron này qua `CronRun` (eat own dogfood)
- Unit test sanitizer + service core methods
- Integration test: bắn request → verify audit row, trigger cron → verify cron_runs row

## Architecture

### Retention service
```ts
// audit-log.service.ts thêm method
async pruneOldRecords(retentionDays = 60): Promise<{ auditDeleted: number; cronDeleted: number }>
```

### Retention cron
File: `apps/api/src/modules/audit-log/audit-log-retention.service.ts` (separate to keep concerns clean)

```ts
@Cron('30 3 * * *') // 3:30 AM daily
async runRetention() {
  await this.cronRunService.track('audit-retention', async (ctx) => {
    const cutoff = new Date(Date.now() - 60 * 86400 * 1000);
    const auditDeleted = await this.prisma.auditLog.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    const cronDeleted = await this.prisma.cronRun.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    ctx.affected = auditDeleted.count + cronDeleted.count;
    ctx.metadata = { auditDeleted: auditDeleted.count, cronDeleted: cronDeleted.count, cutoff: cutoff.toISOString() };
  });
}
```

⚠️ Chunked delete cho bảng lớn:
- Nếu `deleteMany` xoá > 50k rows → DB lock lâu
- Mitigation: while-loop xoá batch 5000 mỗi lần
```ts
let batchDeleted = 0;
do {
  const res = await this.prisma.$executeRaw`
    DELETE FROM audit_logs WHERE id IN (
      SELECT id FROM audit_logs WHERE created_at < ${cutoff} LIMIT 5000
    )
  `;
  batchDeleted = res; // count
  totalDeleted += batchDeleted;
} while (batchDeleted >= 5000);
```

## Tests

### Unit tests

**File: `apps/api/src/modules/audit-log/audit-log.sanitizer.spec.ts`**
- `sanitize` với password key → REDACTED
- `sanitize` với nested object có token → REDACTED ở mọi level
- `sanitize` với string > 4KB → truncated
- `sanitize` với array → recurse
- `sanitize` depth > 5 → stop
- `sanitize` với null/undefined/Date/Buffer → handled

**File: `apps/api/src/modules/audit-log/audit-log.service.spec.ts`**
- `create()` insert đúng row (mock prisma)
- `query()` build where clause đúng theo filter
- `pruneOldRecords()` xoá đúng rows cũ

**File: `apps/api/src/modules/cron-run/cron-run.service.spec.ts`**
- `track()` success path → row có status SUCCESS, affected, metadata
- `track()` error path → row có status FAILED, errorMsg, throw đúng error
- `track()` ctx mutation từ fn được persist
- `onModuleInit()` mark stale RUNNING → FAILED

### Integration tests

**File: `apps/api/test/audit-log.e2e-spec.ts`**
- POST `/auth/login` → check `audit_logs` có row USER_LOGIN, password REDACTED
- POST `/leads` → check audit row LEAD_CREATE
- DELETE `/leads/:id` → audit row LEAD_DELETE
- GET `/leads` → KHÔNG tạo audit row
- GET `/audit-logs` as user → 403
- GET `/audit-logs` as super_admin → 200 + filter work

**File: `apps/api/test/cron-run.e2e-spec.ts`**
- Trigger `runAutoRecall` manually → row SUCCESS trong cron_runs
- Force throw → row FAILED + errorMsg
- GET `/cron-runs` as super_admin → 200

### Frontend smoke test
- Playwright (nếu có infra) hoặc manual checklist trong Phase 05

## Related Code Files

### Read first
- `apps/api/test/` — existing test setup pattern
- `apps/api/src/modules/audit-log/audit-log.service.ts` (Phase 02)
- `apps/api/src/modules/cron-run/cron-run.service.ts` (Phase 03)

### Modify
- `apps/api/src/modules/audit-log/audit-log.service.ts` — thêm `pruneOldRecords()`
- `apps/api/src/modules/audit-log/audit-log.module.ts` — register retention service

### Create
- `apps/api/src/modules/audit-log/audit-log-retention.service.ts`
- `apps/api/src/modules/audit-log/audit-log.sanitizer.spec.ts`
- `apps/api/src/modules/audit-log/audit-log.service.spec.ts`
- `apps/api/src/modules/cron-run/cron-run.service.spec.ts`
- `apps/api/test/audit-log.e2e-spec.ts`
- `apps/api/test/cron-run.e2e-spec.ts`

## Implementation Steps

### Step 1 — Retention service
- Implement chunked delete
- Inject `CronRunService` để self-track

### Step 2 — Wire vào module
- Add to providers in `audit-log.module.ts`
- Verify cron starts on app boot (NestJS schedule auto-discover)

### Step 3 — Unit tests
- Setup `jest.config` nếu chưa có per-module
- Mock `PrismaClient` với `jest-mock-extended` hoặc tự viết mock object
- Run `pnpm test --filter=api`

### Step 4 — Integration tests
- Setup test DB (Docker compose hoặc separate schema)
- Use `supertest` để bắn request
- Cleanup data sau mỗi test

### Step 5 — Manual retention test
```bash
# Insert backdated row
psql $DATABASE_URL -c "INSERT INTO audit_logs (action, created_at) VALUES ('TEST', now() - interval '70 days');"

# Trigger retention manually (qua endpoint debug hoặc đợi 3:30 AM)
# Verify row đã bị xoá
psql $DATABASE_URL -c "SELECT count(*) FROM audit_logs WHERE action='TEST';"
```

### Step 6 — Performance check
- Insert 100k rows audit_logs với `created_at` rải đều 90 ngày
- Trigger retention → đo thời gian
- Mục tiêu: < 30s cho 50k rows xoá

## Todo List
- [ ] Tạo `audit-log-retention.service.ts` với chunked delete
- [ ] Wire vào module
- [ ] Viết 6 unit test cho sanitizer
- [ ] Viết 3 unit test cho audit-log.service
- [ ] Viết 4 unit test cho cron-run.service
- [ ] Viết e2e test audit-log (6 scenarios)
- [ ] Viết e2e test cron-run (3 scenarios)
- [ ] `pnpm test --filter=api` PASS
- [ ] `pnpm test:e2e --filter=api` PASS
- [ ] Manual retention test với backdated data
- [ ] Performance check

## Success Criteria
- Tất cả unit + integration test PASS
- Retention cron chạy thành công, xoá đúng rows cũ
- Bảng `audit_logs` không vượt quá ngưỡng dự kiến sau 60 ngày
- Code coverage cho 2 module mới > 70%
- `pnpm build --filter=api` không lỗi type
- `pnpm lint` clean

## Risk Assessment
- **R1:** Test DB conflict với dev DB → mitigation: dùng schema riêng `crm_v4_test`
- **R2:** Chunked delete trong tx → DB lock lâu → mitigation: KHÔNG dùng transaction, mỗi batch là statement riêng
- **R3:** Retention xoá trong khi UI đang query → race condition → mitigation: chạy 3:30 AM khi traffic thấp

## Security Considerations
- Test data có thể chứa fake credentials → đảm bảo test DB không reuse cho prod
- Retention cron không bị disable accidentally → monitoring cron_runs cho `audit-retention` job

## Next Steps
- Commit + push từng phase riêng
- Update `docs/system-architecture.md` với module mới
- Update `docs/project-changelog.md` với feature trace
- Future enhancement: webhook alert khi cron FAILED
