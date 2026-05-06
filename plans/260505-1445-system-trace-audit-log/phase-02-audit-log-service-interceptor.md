# Phase 02 - AuditLog Service + Global Interceptor

**Priority:** P0 | **Status:** Pending | **Est:** 3h | **Depends:** Phase 01

## Overview
Tạo module `audit-log` (NestJS) gồm: service ghi log fire-and-forget, global interceptor tự động capture mutation requests, sanitizer cho secrets.

## Requirements
- Auto-log POST/PUT/PATCH/DELETE (skip GET, OPTIONS, HEAD)
- Skip routes nội bộ (health check, swagger, webhook public)
- Sanitize: `password`, `token`, `secret`, `apiKey`, `refreshToken`, `accessToken`, `pin`
- Truncate body field max 4KB
- Fire-and-forget: không block response
- API endpoint cho super_admin query với filter chi tiết

## Architecture

### Module structure
```
apps/api/src/modules/audit-log/
├── audit-log.module.ts
├── audit-log.service.ts          # CRUD + query
├── audit-log.controller.ts       # GET /audit-logs (super_admin only)
├── audit-log.interceptor.ts      # Global mutation logger
├── audit-log.sanitizer.ts        # Strip secrets, truncate
├── dto/
│   ├── query-audit-log.dto.ts    # filter params (Zod)
│   └── audit-log-response.dto.ts
└── audit-log.constants.ts        # SENSITIVE_KEYS, SKIP_PATHS, MAX_FIELD_BYTES
```

### Flow
```
Request → JwtGuard → AuditLogInterceptor.intercept()
                          ↓
                     handle().pipe(
                       tap(response → enqueue log),
                       catchError(err → enqueue log with status, rethrow)
                     )
                          ↓
                     setImmediate(() => service.create(...))
                          ↓
                     prisma.auditLog.create(...)
```

### Sanitization rules
- Recursively walk object
- Replace value with `"[REDACTED]"` if key matches (case-insensitive) any in `SENSITIVE_KEYS`
- Truncate string values > 4KB to `"...{truncated, original_length=N}"`
- Max object depth 5 (avoid infinite recursion)

### Filter API (super_admin only)
`GET /api/v1/audit-logs?...`
Query params:
- `userId` - filter by user
- `departmentId` - filter by user's dept (join)
- `action` - exact match or comma-list
- `entityType` - `LEAD` | `CUSTOMER` | `ORDER` | `USER` | etc
- `entityId`
- `method` - POST/PUT/PATCH/DELETE
- `statusCode` - exact or range (e.g., `4xx`, `5xx`)
- `ipAddress`
- `from` - ISO datetime
- `to` - ISO datetime
- `cursor` - pagination cursor
- `limit` - default 50, max 200

## Related Code Files

### Read first
- `apps/api/src/common/interceptors/bigint-transform.interceptor.ts` - interceptor pattern
- `apps/api/src/common/build-access-filter.ts` - query helper pattern
- `apps/api/src/modules/activities/activities.service.ts` - service pattern
- `apps/api/src/modules/users/users.controller.ts` - controller pattern + role guard
- `apps/api/src/app.module.ts` - global interceptor registration

### Modify
- `apps/api/src/app.module.ts` - register `AuditLogInterceptor` global, import `AuditLogModule`

### Create
- `apps/api/src/modules/audit-log/audit-log.module.ts`
- `apps/api/src/modules/audit-log/audit-log.service.ts`
- `apps/api/src/modules/audit-log/audit-log.controller.ts`
- `apps/api/src/modules/audit-log/audit-log.interceptor.ts`
- `apps/api/src/modules/audit-log/audit-log.sanitizer.ts`
- `apps/api/src/modules/audit-log/audit-log.constants.ts`
- `apps/api/src/modules/audit-log/dto/query-audit-log.dto.ts`
- `apps/api/src/modules/audit-log/dto/audit-log-response.dto.ts`

## Implementation Steps

### Step 1 - Constants (`audit-log.constants.ts`)
```ts
export const SENSITIVE_KEYS = [
  'password', 'currentPassword', 'newPassword',
  'token', 'accessToken', 'refreshToken',
  'secret', 'apiKey', 'apiSecret', 'pin', 'otp',
  'authorization', 'cookie',
];

export const SKIP_PATHS = [
  '/health', '/api/v1/health',
  '/docs', '/api-docs',
  '/api/v1/audit-logs',  // avoid recursion: don't log audit-log queries
];

export const SKIP_METHODS = ['GET', 'HEAD', 'OPTIONS'];

export const MAX_FIELD_BYTES = 4096;
export const MAX_DEPTH = 5;
```

### Step 2 - Sanitizer (`audit-log.sanitizer.ts`)
- Pure function `sanitize(input: unknown, depth = 0): unknown`
- Lowercase key compare cho `SENSITIVE_KEYS`
- Truncate string > MAX_FIELD_BYTES
- Stop tại MAX_DEPTH
- Handle Buffer/Date/null/undefined

### Step 3 - Service (`audit-log.service.ts`)
```ts
async create(params: {
  userId?: bigint | null;
  action: string;
  entityType?: string | null;
  entityId?: bigint | null;
  ipAddress?: string;
  userAgent?: string;
  method?: string;
  path?: string;
  statusCode?: number;
  metadata?: Record<string, unknown>;
}): Promise<void>

async query(filter: QueryAuditLogDto, requesterRole: UserRole)
  : Promise<{ data: AuditLogResponseDto[]; meta: { nextCursor?: string } }>
```

### Step 4 - Interceptor (`audit-log.interceptor.ts`)
- Implement `NestInterceptor`
- Trong `intercept()`:
  - Lấy `req` từ context
  - Skip nếu `method` ∈ SKIP_METHODS
  - Skip nếu `req.path` startsWith bất kỳ SKIP_PATHS
  - Lấy user từ `req.user` (gắn bởi JwtGuard)
  - Capture `body` + `params` + `query` (sanitized)
  - `tap(response → enqueueLog(SUCCESS))`
  - `catchError(err → enqueueLog(ERROR); throw err)`
- `enqueueLog`: dùng `setImmediate(() => service.create(...).catch(noop))`
- Suy ra `action` từ method + path (vd `POST /leads/:id/transfer` → `LEAD_TRANSFER`)
  - Implement `inferAction(method: string, path: string): string` - basic mapping, fallback `${method}_${pathSegment}`

### Step 5 - Controller (`audit-log.controller.ts`)
- `@UseGuards(JwtAuthGuard, RolesGuard)`
- `@Roles('SUPER_ADMIN')`
- `GET /audit-logs` - return paginated list theo filter
- `GET /audit-logs/:id` - chi tiết 1 log

### Step 6 - Module wiring
- `audit-log.module.ts`: providers = [Service, Interceptor, Sanitizer], exports = [Service]
- `app.module.ts`: import AuditLogModule, đăng ký interceptor global qua `APP_INTERCEPTOR`

### Step 7 - Manual test
```bash
# Run API
pnpm dev --filter=api

# Login → POST /auth/login
curl -X POST http://localhost:3010/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"xxx"}'

# Check DB
psql $DATABASE_URL -c "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5;"
# Expect: row với action="USER_LOGIN" và metadata KHÔNG chứa password plain text
```

## Todo List
- [ ] Đọc 5 files ở "Read first"
- [ ] Tạo constants
- [ ] Tạo sanitizer + unit test (test cases: nested obj, sensitive key, long string, depth limit)
- [ ] Tạo service
- [ ] Tạo interceptor
- [ ] Tạo DTO (Zod schema cho filter)
- [ ] Tạo controller với role guard
- [ ] Tạo module
- [ ] Đăng ký global interceptor trong `app.module.ts`
- [ ] Manual test login → check DB không có password
- [ ] `pnpm build --filter=api` không lỗi

## Success Criteria
- POST/PUT/PATCH/DELETE đều tạo row trong `audit_logs`
- GET requests KHÔNG tạo row
- Password/token bị redact trong metadata
- Body > 4KB bị truncate
- Endpoint `GET /audit-logs` chỉ super_admin gọi được (others → 403)
- Filter user/action/time-range/IP hoạt động đúng
- Latency request không tăng đáng kể (< 5ms overhead)

## Risk Assessment
- **R1:** Sanitizer miss field tên lạ → mitigation: dùng substring match (vd `secretKey`, `mySecret` đều bắt được khi key chứa `secret`)
- **R2:** Interceptor crash → block tất cả request → mitigation: try/catch toàn bộ logic enqueue, log error qua Logger không throw
- **R3:** Log audit-log endpoint → recursion → mitigation: skip via SKIP_PATHS
- **R4:** Bảng phình quá nhanh nếu volume cao → Phase 06 cron retention xử lý

## Security Considerations
- **Role guard nghiêm ngặt:** chỉ SUPER_ADMIN, dù MANAGER là role cao thứ 2
- **IP từ header X-Forwarded-For** nếu sau reverse proxy (đọc `req.ip` của Express đã có config trust proxy chưa)
- **Không log Authorization header** dù bị bypass - sanitize key `authorization`
- **Don't log webhook bodies có chứa secret** - verify SKIP_PATHS có cover endpoint webhook

## Next Steps
- Phase 03 (cron tracking) parallel
- Phase 04 (instrument modules) cần phase này xong
- Phase 05 (frontend) cần controller endpoint này
