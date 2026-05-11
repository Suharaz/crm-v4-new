# Phase 01: Backend Pool Filter Support

**Phase ID:** `phase-01-backend-pool-filter-support`
**Effort:** ~4h
**Priority:** P0 (blocks frontend)
**Status:** Pending

---

## Context Links

- Plan: [../plan.md](../plan.md)
- Skills cần activate: `nestjs-expert`, `backend-development`, `api-design`, `postgres-pro`, `databases`, `sequential-thinking`

---

## Overview

Mở rộng 5 endpoint pool của leads module để nhận filter params giống `GET /leads`:
- `GET /leads/pool/new` (manager+, kho mới)
- `GET /leads/pool/zoom` (manager+, zoom source)
- `GET /leads/pool/department/:id` (manager+, dept pool)
- `GET /leads/pool/floating` (all users, floating)
- `GET /leads/my-dept-pool` (user, dept của user)

Thêm composite index DB cho combo filter phổ biến để tránh slow query khi data scale.

---

## Key Insights

- DTO hiện tại `LeadListQueryDto` đã chuẩn, có thể tách thành base DTO + extend cho pool. Hoặc tạo `PoolListQueryDto` riêng (KISS hơn).
- Service methods hiện hardcode `where` clause (vd `status: 'POOL', departmentId: null`). Cần merge `where` cố định với `where` từ filter input - phải merge cẩn thận để không override scope.
- `buildAccessFilter(user)` pattern phải giữ nguyên cho IDOR prevention (theo CLAUDE.md rule).
- Backend đã có index trên `sourceId`, `productId`, `(status, assignedUserId)`, `departmentId`, `labelId` (theo report scout). Combo filter phổ biến nhất: `status + sourceId + productId + departmentId` - cần composite index.

---

## Requirements

### Functional
- 5 endpoint nhận thêm các param: `search`, `sourceId`, `productId`, `assignedUserId`, `departmentId`, `labelId`, `hasOrder`, `dateFrom`, `dateTo`.
- Filter chỉ áp dụng trong scope cố định của từng endpoint (không cho phép override status).
- `assignedUserId` filter cho pool/new: áp dụng cho nhánh "72h distributed" (lead đã có assignedUser).
- Trả về thêm `appliedFilters` (echo lại filter đã áp dụng) trong response để frontend verify.

### Non-functional
- Query time < 200ms với 100K leads (verify bằng `EXPLAIN ANALYZE`).
- Index migration dùng `CONCURRENTLY` để không lock production table.

---

## Architecture

```
Controller (5 endpoints)
   ↓ accepts PoolListQueryDto
Service.poolNew/Zoom/Department/Floating/MyDept
   ↓ buildAccessFilter(user) + fixed scope + filter input
Repository (Prisma query)
   ↓
PostgreSQL (composite index)
```

**Filter merge logic:**
```ts
const where: Prisma.LeadWhereInput = {
  // 1. Fixed scope (hardcoded per endpoint)
  status: 'POOL',
  departmentId: null,
  deletedAt: null,
  // 2. Access filter (RBAC)
  ...buildAccessFilter(user),
  // 3. User-provided filter (LAST, but cannot override scope keys)
  ...(filter.sourceId && { sourceId: BigInt(filter.sourceId) }),
  ...(filter.productId && { productId: BigInt(filter.productId) }),
  // ... etc
};
```

**Important:** `status` và scope-defining fields KHÔNG được nhận từ filter input ở pool endpoints (tránh user bypass scope).

---

## Related Code Files

### To read first (understand patterns)
- `apps/api/src/modules/leads/dto/lead-list-query.dto.ts` - DTO pattern
- `apps/api/src/modules/leads/leads.service.ts` - existing `list()` method + 5 pool methods
- `apps/api/src/modules/leads/leads.controller.ts` - existing controllers
- `apps/api/src/common/access-filter.ts` (hoặc tương tự) - `buildAccessFilter` pattern
- `packages/database/prisma/schema.prisma` - Lead model + indexes hiện có

### To create
- `apps/api/src/modules/leads/dto/pool-list-query.dto.ts` - new DTO

### To modify
- `apps/api/src/modules/leads/leads.service.ts` - 5 pool methods nhận DTO
- `apps/api/src/modules/leads/leads.controller.ts` - 5 endpoints bind DTO via `@Query()`
- `packages/database/prisma/schema.prisma` - add composite index
- `packages/database/prisma/migrations/{timestamp}_add_lead_pool_filter_index/migration.sql` - new migration

---

## Implementation Steps

1. **Activate skills:** `sequential-thinking`, `nestjs-expert`, `postgres-pro`, `databases`.
2. **Read related files:** ALL files trong "Related Code Files" để hiểu existing pattern.
3. **Tạo `PoolListQueryDto`:**
   - Extends từ `LeadListQueryDto` HOẶC copy 9 field (KISS: copy + omit `status`).
   - Validate via class-validator (`@IsOptional`, `@IsString`, `@IsDateString`, etc.).
4. **Sửa service methods:**
   - Method signature: `poolNew(user, query: PoolListQueryDto)` thay vì `poolNew(user, limit, cursor)`.
   - Build `where` clause merge fixed scope + access filter + user filter.
   - Hỗ trợ `search` qua existing full-text search (GIN index).
   - `hasOrder` filter: subquery hoặc relation filter (`orders: { some: {} }`).
   - `dateFrom`/`dateTo` filter trên `createdAt`.
5. **Sửa controllers:**
   - Bind DTO bằng `@Query() query: PoolListQueryDto`.
   - Truyền `query` xuống service.
6. **Tạo migration index DB:**
   - Composite index `(status, deleted_at, source_id, product_id, created_at DESC)` cho query pattern phổ biến.
   - Index trên `(department_id, status, deleted_at) WHERE deleted_at IS NULL` cho dept pool.
   - Dùng `CREATE INDEX CONCURRENTLY` để không lock table.
7. **Run migration** trong dev: `pnpm db:migrate dev`.
8. **Compile check:** `pnpm --filter @crm/api build` - verify no TypeScript errors.
9. **Smoke test bằng curl/Bruno:**
   - `GET /leads/pool/new?sourceId=1&productId=2` - verify filter áp dụng đúng.
   - `GET /leads/pool/floating?search=Nguyen&dateFrom=2026-01-01` - verify combo filter.
10. **Verify index usage:** chạy `EXPLAIN ANALYZE` trên query thực tế qua `psql`.

---

## Todo List

- [ ] Đọc 5 file related code trước khi code
- [ ] Tạo `pool-list-query.dto.ts` với 9 filter field (omit status)
- [ ] Refactor `poolNew()` method nhận DTO
- [ ] Refactor `poolZoom()` method
- [ ] Refactor `poolDepartment()` method
- [ ] Refactor `poolFloating()` method
- [ ] Refactor `myDeptPool()` method
- [ ] Sửa controller 5 endpoint bind DTO
- [ ] Thêm composite index vào schema.prisma
- [ ] Tạo migration với `CREATE INDEX CONCURRENTLY`
- [ ] Run `pnpm db:migrate dev` verify migration pass
- [ ] Compile check: `pnpm --filter @crm/api build`
- [ ] Smoke test 5 endpoint bằng curl
- [ ] Chạy `EXPLAIN ANALYZE` verify index được dùng
- [ ] Commit: `feat(leads-pool): add detailed filter support to pool endpoints`

---

## Success Criteria

- [ ] 5 endpoint pool nhận đủ 9 filter params (trừ `status`).
- [ ] Fixed scope không bị bypass (test: gửi `status=CONVERTED` qua `/leads/pool/new` - phải bị ignore hoặc reject).
- [ ] `buildAccessFilter(user)` vẫn được áp dụng (test với user role thấp).
- [ ] Migration chạy clean trên dev DB.
- [ ] `EXPLAIN ANALYZE` cho thấy index mới được dùng (Index Scan, không Seq Scan).
- [ ] No TypeScript compile error.

---

## Risk Assessment

| Risk | Impact | Mitigation |
|---|---|---|
| Index creation lock production table | High | `CREATE INDEX CONCURRENTLY` (Postgres specific) |
| Filter input override scope (bypass) | Critical | Explicit pick fields trong service, không spread blindly |
| Slow query với combo filter | Medium | Composite index + `EXPLAIN ANALYZE` verify |
| `hasOrder` filter N+1 | Medium | Dùng Prisma relation filter, không subquery thủ công |
| `search` full-text với pool scope chưa có index | Low | Verify GIN index có cover `(status, name)` không |

---

## Security Considerations

- **IDOR:** `buildAccessFilter(user)` MUST được áp dụng. User role `USER` chỉ thấy lead của họ + dept của họ.
- **Status bypass:** Tuyệt đối KHÔNG nhận `status` từ DTO ở pool endpoints (omit khỏi DTO, không phải comment out).
- **`assignedUserId` filter:** Theo `GET /leads`, chỉ manager+ được dùng. Apply quy tắc tương tự trên pool endpoints - nếu user role thấp gửi `assignedUserId` thì ignore (hoặc reject).
- **SQL injection:** Dùng Prisma typed query, không raw SQL.

---

## Next Steps

→ Phase 02: Frontend wire filter bar (sau khi Phase 01 done + smoke test pass).
