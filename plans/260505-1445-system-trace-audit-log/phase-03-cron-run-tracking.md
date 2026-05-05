# Phase 03 — CronRun Tracking Wrapper

**Priority:** P0 | **Status:** Pending | **Est:** 2h | **Depends:** Phase 01

## Overview
Tạo module `cron-run` cung cấp wrapper helper để cron jobs ghi nhận execution history (start/finish/affected/error). Helper KHÔNG sửa logic cron hiện có — chỉ wrap.

## Requirements
- Wrap không xâm nhập: cron job hiện tại chỉ cần thêm 2-3 dòng
- Idempotent: nếu wrapper crash, cron vẫn chạy bình thường
- Track: jobName, startedAt, finishedAt, status, affected, errorMsg, metadata
- API endpoint cho super_admin query

## Architecture

### Module structure
```
apps/api/src/modules/cron-run/
├── cron-run.module.ts
├── cron-run.service.ts        # CRUD + query + tracker helper
├── cron-run.controller.ts     # GET /cron-runs (super_admin)
└── dto/
    ├── query-cron-run.dto.ts
    └── cron-run-response.dto.ts
```

### Helper API
Cron job sẽ dùng pattern này:
```ts
@Cron('*/5 * * * *')
async runAutoRecall() {
  await this.cronRunService.track('auto-recall', async (ctx) => {
    const total = await this._doRecall();
    ctx.affected = total;
    ctx.metadata = { configsScanned: 5 };
    return total;
  });
}
```

### Track function signature
```ts
async track<T>(
  jobName: string,
  fn: (ctx: CronRunContext) => Promise<T>,
): Promise<T>

interface CronRunContext {
  affected: number;       // mutable, fn updates this
  metadata: Record<string, unknown>;  // mutable
}
```

### Implementation flow
1. Insert row `{ jobName, startedAt: now, status: 'RUNNING' }` → save id
2. Execute `fn(ctx)` trong try/catch
3. Trong `finally`: update row với `finishedAt`, `status: SUCCESS|FAILED`, `affected`, `metadata`, `errorMsg` nếu có
4. Re-throw nếu fn throw (caller quyết định handle)

### Filter API
`GET /api/v1/cron-runs?...`
- `jobName` — exact match
- `status` — RUNNING/SUCCESS/FAILED
- `from` / `to` — time range
- `cursor` / `limit`

## Related Code Files

### Read first
- `apps/api/src/modules/recall-config/recall-config.service.ts:127-154` — pattern hiện tại của cron
- `apps/api/src/modules/audit-log/audit-log.service.ts` (Phase 02) — service pattern reference

### Modify
- `apps/api/src/app.module.ts` — import `CronRunModule`

### Create
- `apps/api/src/modules/cron-run/cron-run.module.ts`
- `apps/api/src/modules/cron-run/cron-run.service.ts`
- `apps/api/src/modules/cron-run/cron-run.controller.ts`
- `apps/api/src/modules/cron-run/dto/query-cron-run.dto.ts`
- `apps/api/src/modules/cron-run/dto/cron-run-response.dto.ts`

## Implementation Steps

### Step 1 — Service `track()` core
```ts
async track<T>(jobName: string, fn: (ctx: CronRunContext) => Promise<T>): Promise<T> {
  const ctx: CronRunContext = { affected: 0, metadata: {} };
  const startedAt = new Date();
  
  // Pre-insert RUNNING row
  const row = await this.prisma.cronRun.create({
    data: { jobName, startedAt, status: 'RUNNING' },
    select: { id: true },
  });

  try {
    const result = await fn(ctx);
    await this.prisma.cronRun.update({
      where: { id: row.id },
      data: {
        finishedAt: new Date(),
        status: 'SUCCESS',
        affected: ctx.affected,
        metadata: ctx.metadata as any,
      },
    });
    return result;
  } catch (err) {
    await this.prisma.cronRun.update({
      where: { id: row.id },
      data: {
        finishedAt: new Date(),
        status: 'FAILED',
        affected: ctx.affected,
        errorMsg: err instanceof Error ? `${err.message}\n${err.stack}` : String(err),
        metadata: ctx.metadata as any,
      },
    });
    throw err;
  }
}
```

### Step 2 — Query method
```ts
async query(filter: QueryCronRunDto)
  : Promise<{ data: CronRunResponseDto[]; meta: { nextCursor?: string } }>
```

### Step 3 — Controller
```ts
@Controller('cron-runs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class CronRunController {
  @Get()
  list(@Query() dto: QueryCronRunDto) { ... }

  @Get(':id')
  detail(@Param('id', ParseBigIntPipe) id: bigint) { ... }
}
```

### Step 4 — Stale RUNNING cleanup (defensive)
- Khi service init, mark all `status='RUNNING'` cũ hơn 30 phút thành `FAILED` với `errorMsg='Stale: server restarted during run'`
- Implement trong `onModuleInit()`

### Step 5 — Manual test
```bash
# Test track() từ REPL hoặc tạo test endpoint debug
# Hoặc đợi Phase 04 wire vào cron jobs thật

psql $DATABASE_URL -c "SELECT job_name, status, affected, finished_at - started_at AS duration FROM cron_runs ORDER BY started_at DESC LIMIT 10;"
```

## Todo List
- [ ] Đọc 2 files ở "Read first"
- [ ] Tạo service với `track()` method
- [ ] Tạo `onModuleInit()` cleanup stale RUNNING
- [ ] Tạo DTO (Zod cho filter)
- [ ] Tạo controller với role guard
- [ ] Tạo module
- [ ] Import vào `app.module.ts`
- [ ] Unit test `track()`: success path + error path
- [ ] `pnpm build --filter=api` không lỗi

## Success Criteria
- Gọi `track('test', async ctx => { ctx.affected = 5; return 'ok' })` → DB có row SUCCESS với affected=5
- Gọi `track('test', async () => { throw new Error('boom') })` → DB có row FAILED với errorMsg, function throw error đúng
- Server restart trong khi cron đang chạy → row RUNNING > 30min bị mark FAILED khi server lên lại
- `GET /cron-runs` chỉ super_admin gọi được

## Risk Assessment
- **R1:** Pre-insert RUNNING row fail → cron không chạy → mitigation: try/catch quanh `cronRun.create`, fallback chạy fn không track
- **R2:** Update finally fail → row stuck RUNNING → mitigation: stale cleanup ở `onModuleInit`
- **R3:** ErrorMsg quá dài (stack trace lớn) → DB error → mitigation: truncate errorMsg max 8KB

## Security Considerations
- Endpoint public-trong-LAN nhưng có thể leak system internals (job names, error messages)
- Strict role guard SUPER_ADMIN
- Error message có thể chứa SQL fragment / connection string → KHÔNG log raw error nếu có chữ "password" trong stack (defensive sanitize)

## Next Steps
- Phase 04 wire `track()` vào 3 cron jobs hiện có
- Phase 05 frontend gọi `GET /cron-runs`
