---
phase: 3
title: "Authentication & User Management"
status: pending
priority: P0
effort: 14h
depends_on: [2]
---

# Phase 03: Authentication & User Management

## Context Links

- Auth approach: `plans/reports/review-260325-1353-research-reports-synthesis.md` (line 109-117)
- RBAC guards: `plans/reports/brainstorm-260325-1224-internal-crm-system-design.md` (line 40-55)
- JWT + refresh tokens: NestJS research report

## Overview

Implement JWT authentication with refresh token rotation, email/password login, RBAC guards (super_admin/manager/user), User CRUD, Department CRUD, EmployeeLevel CRUD. Foundation for all subsequent API modules.

## Requirements

### Functional
- POST `/auth/login` — email + password, returns access + refresh tokens
- POST `/auth/refresh` — refresh token rotation (single-use refresh tokens)
- POST `/auth/logout` — invalidate refresh token
- GET `/auth/me` — current user profile
- User CRUD: list (cursor paginated), create, update, deactivate (soft delete)
- Department CRUD: list, create, update, delete
- EmployeeLevel CRUD: list, create, update, delete (super_admin only)
- RBAC: `@Roles(UserRole.SUPER_ADMIN)` decorator + guard
- Ownership guard: managers see own department, users see own data

### Non-Functional
- bcrypt for password hashing (cost factor 12)
- Access token TTL: 15 minutes
- Refresh token TTL: 7 days
- Refresh tokens stored in DB (for revocation)
- Rate limiting strategy (using @nestjs/throttler):
  - Auth endpoints: 5 req/min per IP
  - Authenticated API: 100 req/min per user
  - 3rd party API: 100 req/min per API key (configured in Phase 07)
- Multiple ThrottlerModule configs for different endpoint groups

## Architecture

### Auth Flow
```
Login → validate credentials → generate access_token (JWT, 15m)
                             → generate refresh_token (JWT, 7d)
                             → store refresh_token hash in DB
                             → return both tokens

Refresh → validate refresh_token → check DB (not revoked)
        → revoke old refresh_token → generate new pair
        → return new tokens

Protected Route → extract JWT from Authorization header
               → validate signature + expiry
               → attach user to request
               → check role guards
```

### Module Structure
```
apps/api/src/
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── strategies/
│   │   │   ├── jwt.strategy.ts
│   │   │   └── local.strategy.ts
│   │   ├── guards/
│   │   │   ├── jwt-auth.guard.ts
│   │   │   ├── roles.guard.ts
│   │   │   └── ownership.guard.ts
│   │   ├── decorators/
│   │   │   ├── roles.decorator.ts
│   │   │   ├── current-user.decorator.ts
│   │   │   └── public.decorator.ts
│   │   └── dto/
│   │       ├── login.dto.ts
│   │       └── refresh-token.dto.ts
│   ├── users/
│   │   ├── users.module.ts
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   ├── users.repository.ts
│   │   └── dto/
│   │       ├── create-user.dto.ts
│   │       ├── update-user.dto.ts
│   │       └── user-query.dto.ts
│   ├── departments/
│   │   ├── departments.module.ts
│   │   ├── departments.controller.ts
│   │   ├── departments.service.ts
│   │   ├── departments.repository.ts
│   │   └── dto/
│   └── employee-levels/
│       ├── employee-levels.module.ts
│       ├── employee-levels.controller.ts
│       ├── employee-levels.service.ts
│       ├── employee-levels.repository.ts
│       └── dto/
├── common/
│   ├── guards/
│   ├── interceptors/
│   │   ├── transform.interceptor.ts    # BigInt → string serialization
│   │   └── logging.interceptor.ts
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── decorators/
│   ├── pipes/
│   │   └── parse-bigint.pipe.ts
│   └── dto/
│       ├── pagination-query.dto.ts     # cursor, limit
│       └── api-response.dto.ts         # standard response wrapper
```

### Refresh Token Table
```prisma
model RefreshToken {
  id          BigInt   @id @default(autoincrement())
  userId      BigInt   @map("user_id")
  tokenHash   String   @map("token_hash")
  familyId    String   @map("family_id")  // detect reuse
  expiresAt   DateTime @map("expires_at")
  revokedAt   DateTime? @map("revoked_at")
  createdAt   DateTime @default(now()) @map("created_at")
  user        User     @relation(fields: [userId], references: [id])
  @@map("refresh_tokens")
}
```

## Related Code Files

### Create
- `apps/api/src/modules/auth/` — all auth files
- `apps/api/src/modules/users/` — all user files
- `apps/api/src/modules/departments/` — all department files
- `apps/api/src/modules/employee-levels/` — all employee-level files
- `apps/api/src/common/interceptors/transform.interceptor.ts`
- `apps/api/src/common/filters/http-exception.filter.ts`
- `apps/api/src/common/pipes/parse-bigint.pipe.ts`
- `apps/api/src/common/dto/pagination-query.dto.ts`
- `apps/api/src/common/dto/api-response.dto.ts`

### Modify
- `apps/api/src/app.module.ts` — register new modules
- `packages/database/prisma/schema.prisma` — add RefreshToken model

## Implementation Steps

1. **Add RefreshToken model to Prisma schema** and run migration

2. **Create common infrastructure**
   - `transform.interceptor.ts`: serialize BigInt to string in all responses
   - `http-exception.filter.ts`: standardize error responses `{ statusCode, message, error }`
   - `parse-bigint.pipe.ts`: parse string route params to BigInt
   - `pagination-query.dto.ts`: `{ cursor?: string, limit?: number }` with Zod/class-validator
   - `api-response.dto.ts`: `{ data, meta?: { nextCursor } }`
   - `request-id.middleware.ts`: generate/forward X-Request-ID header for request tracing
     - If X-Request-ID present in request, use it; else generate UUID
     - Attach to all log entries and response headers

3. **Implement Auth module**
   - `auth.service.ts`: login (validate + hash compare), generateTokens, refreshTokens, logout
   - `jwt.strategy.ts`: Passport JWT strategy extracting from Bearer header
   - `local.strategy.ts`: Passport local strategy for login
   - `jwt-auth.guard.ts`: global guard (skip `@Public()` routes)
   - `roles.guard.ts`: check `@Roles()` metadata against `req.user.role`
   - `ownership.guard.ts`: check department ownership for managers
   - Decorators: `@Roles()`, `@CurrentUser()`, `@Public()`
   - DTOs: login (email + password), refresh (refreshToken)

4. **Implement Users module**
   - `users.repository.ts`: Prisma queries with soft delete filter
   - `users.service.ts`: create (hash password), update, deactivate, list (cursor pagination), findById
   - `users.controller.ts`: REST endpoints with guards
   - Endpoints:
     - `GET /users` — list, cursor paginated, filter by department/role/status (manager+ only)
     - `GET /users/:id` — get by ID (manager+ or self)
     - `POST /users` — create (super_admin only)
     - `PATCH /users/:id` — update (super_admin or self for limited fields)
     - `DELETE /users/:id` — soft delete (super_admin only)

   - **User deactivation cascade**: When deactivating a user:
     1. Revoke ALL refresh tokens for that user
     2. Find all leads where assigned_user_id = deactivated user
     3. Set leads: assigned_user_id=null, giữ department_id, status=POOL (về kho phòng ban)
     4. Same for customers: assigned_user_id=null, giữ dept, status=ACTIVE
     5. Log assignment_history for each transfer
     6. Notify manager of dept about unassigned leads/customers
     7. Auto-recall cron sẽ chuyển về FLOATING nếu quá hạn không ai claim
     This runs in a DB transaction to prevent partial updates.

5. **Implement Departments module**
   - CRUD endpoints, super_admin only for create/update/delete
   - `GET /departments` — list all (any authenticated user)
   - `GET /departments/:id` — get with user count
   - `POST /departments` — create (super_admin)
   - `PATCH /departments/:id` — update (super_admin)
   - `DELETE /departments/:id` — soft delete (super_admin)

6. **Implement EmployeeLevels module**
   - Full CRUD, super_admin only
   - `GET /employee-levels` — list ordered by rank
   - `POST /employee-levels` — create
   - `PATCH /employee-levels/:id` — update
   - `DELETE /employee-levels/:id` — delete

6b. **Implement Teams module**
   - Team CRUD: super_admin only for create/update/delete
   - `GET /teams` — list all teams, optional filter by departmentId
   - `GET /teams/:id` — get team with members + leader info
   - `POST /teams` — create team (name, departmentId, leaderId) — super_admin only
   - `PATCH /teams/:id` — update (name, leaderId) — super_admin only
   - `DELETE /teams/:id` — soft delete (super_admin only, must have no members)
   - Validation: leader must be in same department, leader can only lead ONE team (unique constraint)

6c. **Implement Manager-Department assignment endpoints**
   - Manage the ManagerDepartment junction table
   - `GET /users/:id/managed-departments` — list departments managed by user
   - `POST /users/:id/managed-departments` — assign department(s) `{ departmentIds: [] }` — super_admin only
   - `DELETE /users/:id/managed-departments/:departmentId` — unassign — super_admin only
   - Validation: user must have role=MANAGER, department must exist and be active
   - This relationship powers `buildAccessFilter(user)` in Phase 04

6d. **Implement refresh token cleanup scheduler**
    - Scheduled task to delete expired + revoked tokens older than 30 days
    - Use NestJS @Cron('0 3 * * *') decorator (runs daily at 3 AM)
    - Delete WHERE expiresAt < now() OR (revokedAt IS NOT NULL AND revokedAt < 30 days ago)
    - Note: requires @nestjs/schedule package

7. **Register all modules in AppModule**
   - Global JWT guard (skip @Public routes)
   - Global transform interceptor
   - Global exception filter
   - ConfigModule for env vars
   - Enable CORS in main.ts:
     app.enableCors({
       origin: process.env.FRONTEND_URL || 'http://localhost:3000',
       credentials: true,
     })

## Todo List

- [ ] Add RefreshToken model to Prisma schema + migrate
- [ ] Create transform interceptor (BigInt serialization)
- [ ] Create HTTP exception filter
- [ ] Create parse-bigint pipe
- [ ] Create pagination + API response DTOs
- [ ] Implement auth service (login, refresh, logout)
- [ ] Implement JWT + Local Passport strategies
- [ ] Implement guards (JWT, Roles, Ownership)
- [ ] Implement decorators (@Roles, @CurrentUser, @Public)
- [ ] Implement users CRUD (repository, service, controller)
- [ ] Implement departments CRUD
- [ ] Implement employee-levels CRUD
- [ ] Implement teams CRUD (create, update, delete, list, detail)
- [ ] Implement manager-department assignment (assign, unassign, list managed depts)
- [ ] Implement refresh token cleanup cron job
- [ ] Implement user deactivation cascade (transfer leads/customers to team leader)
- [ ] Register modules + global providers in AppModule
- [ ] Test login flow manually (Postman/curl)
- [ ] Test refresh token rotation
- [ ] Test RBAC guards with different roles
- [ ] Create separate UpdateUserProfileDto and AdminUpdateUserDto
- [ ] Implement account lockout (5 failures → 15min lock)
- [ ] Revoke tokens on password change / deactivation / role change

## Success Criteria

- Login returns valid JWT access + refresh tokens
- Protected endpoints reject requests without valid JWT
- Refresh token rotation works (old token invalidated)
- RBAC: super_admin accesses all, manager sees department, user sees own
- User CRUD with cursor pagination returns correct data
- BigInt IDs serialized as strings in all responses
- Password never returned in any response

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Refresh token reuse attack | High | Family-based rotation: revoke all family tokens on reuse detection |
| BigInt serialization edge cases | Medium | Global interceptor + test with real data |
| Role escalation | High | Validate role changes only by super_admin, test edge cases |
| Password hash timing attack | Low | bcrypt constant-time comparison built-in |
| Missing CORS config | Medium | Enable CORS in main.ts with explicit origin whitelist |
| User deactivation with many leads | Medium | Run in transaction, batch update, notify team leader |
| Sensitive data in logs | Medium | Pino redact config for auth headers, passwords, tokens |
| Account brute force | High | Lockout after 5 failures for 15min + rate limit per IP |
| Mass assignment role escalation | Critical | Separate DTOs for self-update vs admin-update. Never spread req.body |

## Security Considerations

- Passwords hashed with bcrypt cost 12
- JWT secrets in env vars, never hardcoded
- Refresh tokens hashed before DB storage (SHA-256)
- Rate limiting on auth endpoints (throttler module)
- No user enumeration: same error for wrong email vs wrong password
- Soft-deleted users cannot login (filter in auth service)
- Password policy: minimum 8 characters, maximum 72 (bcrypt limit). No complexity rules for internal CRM.
- Validate in create-user.dto.ts and login.dto.ts: z.string().min(8).max(72)
- Log redaction: configure Pino to redact sensitive fields:
  redact: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken', 'req.body.email']
- SQL injection prevention: ALL raw Prisma queries MUST use tagged template literals:
  ✅ prisma.$queryRaw\`SELECT * FROM leads WHERE name ILIKE ${'%' + search + '%'}\`
  ❌ prisma.$queryRaw(\`SELECT * FROM leads WHERE name ILIKE '%${search}%'\`)
  Tagged templates auto-parameterize. String interpolation is VULNERABLE.
- Mass assignment prevention:
  - create-user.dto.ts: whitelist ONLY allowed fields (name, email, password, phone)
  - update-user.dto.ts: EXCLUDE role, departmentId, teamId, isLeader from regular user updates
  - Only SUPER_ADMIN can modify: role, departmentId, teamId, isLeader, status
  - Use separate DTOs: UpdateUserProfileDto (self) vs AdminUpdateUserDto (super_admin)
  - NEVER spread req.body directly into Prisma update
- Token invalidation triggers:
  - On password change: revoke ALL refresh tokens for that user
  - On user deactivation (soft delete): revoke ALL refresh tokens
  - On role change: revoke ALL refresh tokens (force re-login with new permissions)
  - JWT access tokens: short-lived (15min) so they auto-expire, but add user.status check in JWT strategy validate()
- Account lockout after failed login attempts:
  - Track failed_login_count and locked_until on User model
  - After 5 consecutive failures: lock account for 15 minutes
  - On successful login: reset counter
  - Super admin can unlock manually
  - Add to User model: failedLoginCount Int @default(0), lockedUntil DateTime?
