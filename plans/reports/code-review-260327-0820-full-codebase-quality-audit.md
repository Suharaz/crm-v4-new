# CRM V3 Code Review Report

**Date:** 2026-03-27
**Reviewer:** code-reviewer agent
**Stack:** NestJS 11 + Next.js 15 + Prisma 6 + PostgreSQL 16 (Turborepo monorepo)

---

## Scope

- **Files reviewed:** ~90 backend `.ts` + ~35 frontend `.tsx/.ts` files
- **Areas covered:** all service/controller/dto files in `apps/api/src`, all page/component/provider files in `apps/web/src`, Prisma schema, shared packages
- **Focus:** security, IDOR, unbounded queries, N+1, missing guards, React anti-patterns, bundle size, memory leaks

---

## Overall Assessment

The codebase is **well-structured** for a monorepo CRM system. The cursor-based pagination pattern is consistently applied. Auth is properly JWT-based with refresh token rotation. The soft-delete Prisma extension auto-filters deleted records. However, several **high-severity security and performance gaps** exist that need addressing.

---

## Critical Issues

### CRIT-01 — Hardcoded fallback JWT secrets
**Files:** `apps/api/src/modules/auth/auth.service.ts:44,48`, `apps/api/src/modules/auth/strategies/jwt-access-token.strategy.ts:19`

Both `JWT_SECRET` and `JWT_REFRESH_SECRET` fall back to literal strings `'default-jwt-secret'` / `'default-refresh-secret'` when env vars are missing.

```ts
// auth.service.ts line 44
secret: this.configService.get<string>('JWT_SECRET', 'default-jwt-secret'),
// strategy line 19
secretOrKey: configService.get<string>('JWT_SECRET', 'default-jwt-secret'),
```

**Impact:** If the env file is missing in staging/production, tokens signed with the default secret can be forged by anyone who reads the source code.

**Fix:** Remove the fallback — throw on startup if the secret is missing:
```ts
const secret = configService.getOrThrow<string>('JWT_SECRET');
```

---

### CRIT-02 — Refresh token stored in `localStorage` and non-HttpOnly cookie
**File:** `apps/web/src/lib/auth-token-storage.ts`

Refresh tokens (7-day lifetime) are written to `localStorage` AND to a `SameSite=Lax` (not `HttpOnly`) cookie. This exposes them to XSS attacks.

```ts
localStorage.setItem(REFRESH_TOKEN_KEY, token);
document.cookie = `${REFRESH_TOKEN_KEY}=${token}; path=/; max-age=604800; SameSite=Lax`;
```

**Impact:** Any XSS in the app (e.g., a future dependency with a reflected-XSS gadget) can read and exfiltrate the refresh token, enabling long-lived session hijacking.

**Fix:** Store refresh tokens only in `HttpOnly; Secure; SameSite=Strict` cookies set by the server (`Set-Cookie` header). Access tokens can remain in memory (not localStorage). Requires a small backend change to the `/auth/login` and `/auth/refresh` endpoints.

---

### CRIT-03 — Analytics controller has NO auth guard
**File:** `apps/api/src/modules/analytics/analytics-rest-api.controller.ts`

```ts
@Controller('analytics')
export class AnalyticsController {   // no @UseGuards here
  @Get('kpi')  getKpi(...)
  @Get('funnel')  getFunnel(...)
  ...
```

The global `JwtAuthGuard` (registered in `app.module.ts` as `APP_GUARD`) will cover this, **but** `RolesGuard` is also applied per-controller elsewhere and is the enforcement point for role checks. The analytics endpoints have no role restriction at all — any authenticated user (including `USER` role) can read KPI/revenue data.

More critically: if the global guard is removed or bypassed via `@Public()` on the controller by mistake, revenue and conversion data is fully exposed.

**Fix:** Add `@UseGuards(RolesGuard)` and appropriate `@Roles(...)` decorators to the analytics controller. At minimum restrict to `MANAGER` / `SUPER_ADMIN`.

---

### CRIT-04 — `findUnmatched` call logs endpoint — unbounded query
**File:** `apps/api/src/modules/call-logs/call-logs.service.ts:70-76`

```ts
async findUnmatched(): Promise<any> {
  const items = await prisma.callLog.findMany({
    where: { matchStatus: MatchStatus.UNMATCHED, deletedAt: null },
    orderBy: { callTime: 'desc' },
    // NO take/limit
  });
```

**Impact:** Returns ALL unmatched call logs with no limit. On a busy VoIP system this could be hundreds of thousands of rows, consuming memory, CPU, and crashing the process.

**Fix:** Add `take: 100` (or accept a `limit` query param).

---

## High Priority

### HIGH-01 — Import service: N+1 DB queries on every CSV row
**File:** `apps/api/src/modules/import/import.service.ts:16-57`

For each row the service performs: `findFirst` (duplicate check) + `create`. For a 1000-row CSV this is 2000 sequential Prisma calls, all synchronous in a single `async` loop, blocking the Node.js event loop for the duration.

**Impact:** A 5 MB CSV with ~5000 rows can block the entire API for tens of seconds, causing timeouts for all other users.

**Fix:**
1. Parse the full CSV first, extract all phones.
2. Do a single `findMany({ where: { phone: { in: phones } } })` to find duplicates in one query.
3. Batch-insert valid rows with `createMany`.

```ts
const existing = await prisma.lead.findMany({
  where: { phone: { in: normalizedPhones }, deletedAt: null },
  select: { phone: true },
});
const existingPhones = new Set(existing.map(e => e.phone));
// filter + createMany
```

---

### HIGH-02 — Export service: unbounded `findMany` on leads/customers/orders
**File:** `apps/api/src/modules/export/export.service.ts:13,40,62`

All three export methods call `findMany` without `take`:

```ts
const leads = await prisma.lead.findMany({ where, orderBy: { createdAt: 'desc' }, select: ... });
```

**Impact:** Exporting on a large dataset (100k+ records) loads everything into RAM and sends it all as a single response. Can OOM the API process.

**Fix:** Either stream the CSV using Prisma's `$queryRawStream` / cursor iteration, or add a hard cap (e.g., `take: 10000`) with a warning in the response headers.

---

### HIGH-03 — Analytics: `getRanking` and `getSources` load all leads into memory
**File:** `apps/api/src/modules/analytics/analytics-kpi-and-charts.service.ts:46-70, 73-93`

```ts
const leads = await prisma.lead.findMany({
  where,
  select: { status: true, assignedUserId: true, assignedUser: { select: { name: true } } },
});
// then iterate in JS to build ranking map
```

No `take` limit. With 500k leads this materializes a huge array in application memory just to do a `GROUP BY` operation that should be done by the database.

**Fix:** Replace with Prisma `groupBy` or a raw SQL aggregation:
```ts
const ranking = await prisma.lead.groupBy({
  by: ['assignedUserId'],
  where,
  _count: { id: true },
  // ...
});
```

---

### HIGH-04 — IDOR: Activities endpoint leaks cross-user data
**File:** `apps/api/src/modules/activities/activities.service.ts` + `activities.controller.ts`

The `GET /activities?entityType=LEAD&entityId=123` endpoint has no ownership check. Any authenticated user can read activities for any `entityId`:

```ts
async findAll(query: ActivityQueryDto): Promise<any> {
  const entityId = BigInt(query.entityId);
  const items = await prisma.activity.findMany({
    where: { entityType: query.entityType, entityId, deletedAt: null },
    // no check that the caller has access to this entityId
```

**Impact:** A `USER`-role sales rep can call `/activities?entityType=LEAD&entityId=<any_id>` and read the activity history (calls, notes, assignments) of leads not assigned to them.

**Fix:** Before querying, verify the caller has access to the entity (e.g., the lead is assigned to them, or they are MANAGER/SUPER_ADMIN).

---

### HIGH-05 — IDOR: Payment creation has no ownership check
**File:** `apps/api/src/modules/payments/payments.controller.ts:23-25`

```ts
@Post()
create(@Body() dto: CreatePaymentDto): Promise<any> {
  return this.paymentsService.create(dto);   // any authenticated user
```

Any authenticated `USER` can create a payment for any order by knowing the `orderId`. There is no check that the order belongs to the caller's customer.

**Fix:** Fetch the order, check `order.createdBy === currentUser.id` or `order.customer.assignedUserId === currentUser.id`, unless user is MANAGER+.

---

### HIGH-06 — Lead `convert` operation is NOT fully atomic
**File:** `apps/api/src/modules/leads/leads.service.ts:164-203`

When creating a new customer during conversion, the `customer.create` call happens OUTSIDE the `$transaction` block:

```ts
// Lines 183-187 — outside any transaction:
const newCustomer = await prisma.customer.create({
  data: { phone: lead.phone, name: lead.name, email: lead.email ?? null },
});
customerId = newCustomer.id;

// then wrapped in $transaction:
await prisma.$transaction(async (tx) => {
  await tx.lead.update(...)
  await tx.activity.create(...)
});
```

**Impact:** If the `$transaction` fails after the customer was created, a dangling customer record exists without an associated converted lead. Race condition possible if two concurrent convert calls race on the phone check.

**Fix:** Move `customer.create` inside the `$transaction`.

---

### HIGH-07 — File upload: MIME type check relies only on `file.mimetype` (client-provided)
**File:** `apps/api/src/modules/file-upload/file-upload.controller.ts:41-44`

Multer's `fileFilter` checks `file.mimetype` which comes from the client's `Content-Type` header, not actual file magic bytes. An attacker can upload a malicious `.html` or `.js` file with `mimetype: image/jpeg`.

**Fix:** Use a library like `file-type` to read the actual file magic bytes:
```ts
import { fromBuffer } from 'file-type';
const type = await fromBuffer(file.buffer);
if (!ALLOWED_MIME_TYPES.has(type?.mime)) throw new BadRequestException(...)
```
Note: this requires `storage: memoryStorage()` instead of `diskStorage`.

---

### HIGH-08 — `batchDistribute` — N+1 transactions per lead
**File:** `apps/api/src/modules/distribution/distribution-lead-assignment.service.ts:48-66`

```ts
for (const lead of poolLeads) {
  const res = await this.distributeLead(lead.id, departmentId, actorId);  // each one does 1 $transaction with 3 ops
}
```

On 1000 pool leads this is 3000 database operations in series.

**Fix:** Batch all inserts/updates in a single `$transaction`.

---

## Medium Priority

### MED-01 — `generic-cursor-data-table.tsx`: timer stored in `useState`, causes re-renders and leak risk
**File:** `apps/web/src/components/shared/generic-cursor-data-table.tsx:47,52-55`

```ts
const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
// ...
if (debounceTimer) clearTimeout(debounceTimer);
const timer = setTimeout(() => onSearchChange?.(value), 300);
setDebounceTimer(timer);
```

Storing the timer in `useState` causes an extra re-render on every keystroke. If the component unmounts during the 300ms window, the timeout fires on an unmounted component.

**Fix:** Use `useRef` for the timer:
```ts
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// in handler:
if (debounceRef.current) clearTimeout(debounceRef.current);
debounceRef.current = setTimeout(() => onSearchChange?.(value), 300);
```
Add a cleanup in `useEffect` returning `() => { if (debounceRef.current) clearTimeout(debounceRef.current); }`.

---

### MED-02 — React Query: missing `gcTime` config; `staleTime` only 30s for static reference data
**File:** `apps/web/src/providers/react-query-client-provider.tsx`

```ts
defaultOptions: {
  queries: { staleTime: 30_000, retry: 1 },
},
```

- `gcTime` (formerly `cacheTime`) is not set — defaults to 5 minutes, which is fine, but should be explicit.
- For reference data (lead sources, labels, payment types, employee levels) queried in `settings-simple-crud-table.tsx` and sidebar, `staleTime: 30_000` causes unnecessary refetches. These change rarely and could use `staleTime: Infinity` on their specific queries.
- No `refetchOnWindowFocus: false` globally — on returning to window, all 5 analytics queries on the dashboard will refetch simultaneously.

**Fix:** Add `refetchOnWindowFocus: false` globally and set higher `staleTime` per-query for reference data.

---

### MED-03 — `recharts` imported without dynamic import (large bundle)
**Files:**
- `apps/web/src/components/dashboard/revenue-trend-line-chart.tsx:3`
- `apps/web/src/components/dashboard/lead-conversion-funnel-bar-chart.tsx`
- `apps/web/src/components/dashboard/lead-source-effectiveness-bar-chart.tsx`

Recharts (~150kb gzipped) is imported statically. Since these chart components are only used on the dashboard page and are wrapped in a `'use client'` component, they will be included in the initial JS bundle even for other pages.

**Fix:** Use `next/dynamic` with `ssr: false` for chart components:
```ts
const RevenueTrendLineChart = dynamic(
  () => import('@/components/dashboard/revenue-trend-line-chart').then(m => m.RevenueTrendLineChart),
  { ssr: false, loading: () => <Skeleton className="h-52" /> }
);
```

---

### MED-04 — `e: any` type assertions on form input events
**Files:** `lead-create-form.tsx:48,52,56`, `order-create-form.tsx:49,58`, `settings/users/page.tsx` (multiple), `login/page.tsx:43,50`

```ts
onChange={(e: any) => set('phone', e.target.value)}
```

These suppress TypeScript's type checking on React event handlers. The correct type is `React.ChangeEvent<HTMLInputElement>`.

**Fix:** Use proper event types throughout.

---

### MED-05 — `LeadActivityTimeline` maps `a.note` but API returns `content` field
**File:** `apps/web/src/components/leads/lead-activity-timeline.tsx:46`

The component renders `a.note` but the `Activity` model and API response use `content`, not `note`. This means activity text is never displayed.

```ts
{a.note && <p className="text-sm text-slate-700 mt-0.5">{a.note}</p>}
```

**Fix:** Change the `Activity` interface and rendering to use `content`.

---

### MED-06 — `ThirdPartyApiController` URL prefix double-nesting
**File:** `apps/api/src/modules/third-party-api/third-party-api.controller.ts:7`

```ts
@Controller('api/v1/external')
```

The app already sets `globalPrefix = 'api/v1'` in `main.ts`. This controller will be reachable at `/api/v1/api/v1/external/leads`, which is almost certainly wrong.

**Fix:** Change to `@Controller('external')`.

---

### MED-07 — `CustomerDetailInfoPanel` renders `address` field that doesn't exist in schema
**File:** `apps/web/src/components/customers/customer-detail-info-panel.tsx:11,33`

```ts
interface Customer {
  ...
  address: string | null;  // not in Prisma schema or API response
}
```

The Customer model has no `address` field. This will silently render `—` always.

---

### MED-08 — `OrderCreateForm` sends incomplete payload
**File:** `apps/web/src/components/orders/order-create-form.tsx:23-28`

```ts
await apiClient.post('/orders', {
  customerId: customerId || undefined,
  note: note || undefined,
  items: [],   // always empty array
});
```

`CreateOrderDto` in the backend requires `productId` and `amount` (validated in DTO). This form will always fail validation. The form is essentially broken — it collects only `customerId` and `note`, missing required `productId` and `amount` fields.

**Fix:** Complete the form with product selection and amount inputs.

---

### MED-09 — `UsersSettingsPage` uses hardcoded `ADMIN` role that doesn't exist
**File:** `apps/web/src/app/(dashboard)/settings/users/page.tsx:27-31`

```ts
const ROLES = [
  { value: 'ADMIN', label: 'Admin' },    // ADMIN doesn't exist in UserRole enum
  { value: 'MANAGER', label: 'Quản lý' },
  { value: 'SALES', label: 'Kinh doanh' },  // SALES doesn't exist
];
```

The `UserRole` enum is `SUPER_ADMIN | MANAGER | USER`. Creating a user with `role: 'ADMIN'` or `role: 'SALES'` will fail Prisma enum validation.

**Fix:** Use correct enum values: `SUPER_ADMIN`, `MANAGER`, `USER`.

---

### MED-10 — Middleware only checks cookie presence, not token validity
**File:** `apps/web/src/middleware.ts:4-11`

```ts
const token = request.cookies.get('access_token')?.value;
if (!token && !isLoginPage) {
  return NextResponse.redirect(new URL('/login', request.url));
}
```

The middleware redirects to login only if the cookie is absent, not if the JWT is expired or malformed. An expired token passes through and the API call returns 401, which is handled by the client-side refresh logic — but this can cause flash of authenticated UI before redirect.

---

### MED-11 — `claimCustomer` uses `$queryRaw` with positional parameters — potential implicit type casting issues
**File:** `apps/api/src/modules/customers/customers.service.ts:120-127`

```ts
const result: any[] = await prisma.$queryRaw`
  UPDATE customers SET assigned_user_id = ${userId}
  WHERE id = ${customerId} AND assigned_user_id IS NULL AND deleted_at IS NULL
  RETURNING ...
`;
```

The raw SQL is **parameterized** (template literal with `${...}` is safe in Prisma), so no SQL injection risk. However, the returned columns use snake_case (`assigned_user_id`, `created_at`) while the rest of the codebase uses camelCase Prisma models. The caller receives raw DB columns and returns them directly to the client with inconsistent casing.

**Fix:** Map the raw result to a camelCase object or refactor to use Prisma `update` with an optimistic lock via `updateMany` with `where: { id: customerId, assignedUserId: null }` and check `count`.

---

### MED-12 — `Distribution batchDistribute` fetches all POOL leads without department filter
**File:** `apps/api/src/modules/distribution/distribution-lead-assignment.service.ts:49-53`

```ts
const poolLeads = await prisma.lead.findMany({
  where: { status: LeadStatus.POOL, deletedAt: null },  // no department filter
  select: { id: true },
});
```

All POOL leads across all departments are distributed to a single department. This is logically wrong and could mis-assign leads from other departments.

---

## Low Priority

### LOW-01 — `'use client'` audit — most are justified; a few could be Server Components

All `'use client'` usage was reviewed. The following are correct (use hooks, event handlers, browser APIs):
- All dashboard chart components ✓
- All form components ✓
- Providers ✓
- Layout components using `usePathname` ✓

These COULD be Server Components (they only render static content):
- `apps/web/src/app/(dashboard)/settings/layout.tsx` — just renders `{children}`, no client hooks needed
- `apps/web/src/app/(dashboard)/settings/page.tsx` — static redirect page

**Impact:** Minor — Next.js handles these well.

---

### LOW-02 — `AppSidebarNav` links to `/products` and `/call-logs` that may not exist as pages
**File:** `apps/web/src/components/layout/app-sidebar-nav.tsx:22,25`

```ts
{ href: '/products', label: 'Sản phẩm', icon: Package },
{ href: '/call-logs', label: 'Cuộc gọi', icon: Phone },
```

These pages are not present in the Glob output for `apps/web/src/app`. Navigation will 404.

---

### LOW-03 — `OrderDetailWithPaymentsPanel` has status labels inconsistent with API enum
**File:** `apps/web/src/components/orders/order-detail-with-payments-panel.tsx:22-24`

```ts
const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ xử lý', CONFIRMED: 'Xác nhận', SHIPPED: 'Đang giao',
  DELIVERED: 'Đã giao', CANCELLED: 'Hủy',
};
```

API `OrderStatus` enum is `PENDING | CONFIRMED | COMPLETED | CANCELLED | REFUNDED`. `SHIPPED` and `DELIVERED` don't exist; `COMPLETED` and `REFUNDED` are missing from the label map.

---

### LOW-04 — `User` model has `name` field but frontend expects `fullName`
**Files:** `auth-context-provider.tsx:11`, `settings/users/page.tsx:22`, `user-avatar-menu-dropdown.tsx:20`

Backend `User` model field is `name`. Frontend `User` interface uses `fullName`. This likely causes the user's name to be `undefined` in the topbar dropdown and user list.

---

### LOW-05 — `getRevenue` analytics loads all verified payments without date-range fallback
**File:** `apps/api/src/modules/analytics/analytics-kpi-and-charts.service.ts:96-110`

If no date range is passed (empty `query`), `createdAt` filter is `undefined` and ALL verified payments since inception are fetched into memory.

---

### LOW-06 — Redundant `deletedAt: null` filter alongside soft-delete Prisma extension
**Files:** Many service files (`leads.service.ts`, `customers.service.ts`, etc.)

The soft-delete extension in `packages/database/src/prisma-soft-delete-extension.ts` automatically adds `deletedAt: null` to all `findMany`/`findFirst` queries for models in `SOFT_DELETE_MODELS`. Adding it manually (e.g., `where: { id, deletedAt: null }`) is redundant and causes the extension to detect the explicit filter and skip auto-filtering (see line 81: `if (where && 'deletedAt' in where) return where`). This means the extension logic is effectively bypassed everywhere it's manually set.

This is actually **correct behavior** (explicit wins), but the redundancy is confusing and can lead to bugs if someone removes the explicit filter assuming the extension handles it — which it would, but the code implies otherwise.

---

### LOW-07 — Missing rate-limiting on auth endpoints
**File:** `apps/api/src/app.module.ts`

The `ThrottlerGuard` applies globally (100 req/60s). However, brute-force attacks on `/auth/login` need a much tighter limit (e.g., 5/min per IP). The global throttle only provides weak protection.

**Fix:** Apply per-endpoint throttle override on the login endpoint using `@Throttle({ default: { ttl: 60000, limit: 5 } })`.

---

### LOW-08 — `UserAvatarMenuDropdown` will crash if `user.fullName` is empty string
**File:** `apps/web/src/components/layout/user-avatar-menu-dropdown.tsx:20-25`

```ts
const initials = user.fullName
  .split(' ')
  .map((n) => n[0])   // n[0] will be undefined if n is empty string ''
```

An empty `fullName` or all-spaces name causes `n[0]` to be `undefined`, resulting in `undefined` characters in the initials.

---

## Summary

| Severity | Count | Issues |
|----------|-------|--------|
| Critical | 4 | CRIT-01 through CRIT-04 |
| High | 8 | HIGH-01 through HIGH-08 |
| Medium | 12 | MED-01 through MED-12 |
| Low | 8 | LOW-01 through LOW-08 |
| **Total** | **32** | |

---

## Recommended Actions (prioritized)

1. **[CRIT-01]** Remove hardcoded JWT secret fallbacks — use `getOrThrow`
2. **[CRIT-02]** Move refresh token to `HttpOnly` server-set cookie
3. **[HIGH-06]** Move `customer.create` inside the `$transaction` in `convert()`
4. **[HIGH-04/05]** Add ownership/access checks to activities and payment creation
5. **[CRIT-03]** Add `@UseGuards(RolesGuard)` + `@Roles(MANAGER, SUPER_ADMIN)` to analytics controller
6. **[CRIT-04 / HIGH-02]** Add `take` limits to `findUnmatched`, all export `findMany` calls
7. **[HIGH-01]** Batch the CSV import queries
8. **[MED-05]** Fix `a.note` → `a.content` in activity timeline
9. **[MED-06]** Fix `ThirdPartyApiController` URL prefix double-nesting
10. **[MED-08/09]** Fix broken order create form and invalid role values in users page

---

## Positive Observations

- **Single PrismaClient singleton** via `globalForPrisma` pattern — no connection leaks
- **Consistent cursor pagination** with `take: limit + 1` pattern across all list endpoints
- **Atomic operations** use `$transaction` appropriately (assign, convert, transfer, distribution)
- **Soft-delete extension** cleanly centralizes deletion filtering
- **Refresh token rotation** with SHA-256 hash storage (tokens never stored in plain text)
- **JWT validation on every request** (DB lookup in strategy) prevents revoked-user access
- **Rate limiting** applied globally with ThrottlerGuard
- **CORS** configured from env var, not hardcoded
- **BigInt serialization** handled globally via interceptor
- **Input validation** with class-validator DTOs on all endpoints
- **Error responses** standardized via global `HttpExceptionFilter`
- **pino logging** with request-id middleware for traceability

---

## Unresolved Questions

1. Is there a migration plan for moving refresh tokens from `localStorage` to HttpOnly cookies? The backend currently returns tokens in the JSON response body — this would require a coordinated frontend/backend change.
2. The `AiDistributionConfig` / `batchDistribute` functionality — is this production-used? The scoring service (`distribution-weighted-scoring.service.ts`) was not reviewed and may have additional issues.
3. Are the `/products` and `/call-logs` Next.js pages intentionally absent (planned future work) or accidentally omitted?
4. The `User.name` vs `user.fullName` mismatch — which side is wrong? The backend uses `name` consistently, the frontend consistently expects `fullName`. Was there a rename that was applied only to the frontend?
