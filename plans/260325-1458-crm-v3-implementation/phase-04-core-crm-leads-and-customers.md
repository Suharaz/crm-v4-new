---
phase: 4
title: "Core CRM: Leads & Customers"
status: pending
priority: P0
effort: 16h
depends_on: [3]
---

# Phase 04: Core CRM — Leads & Customers

## Context Links

- Lead/Customer models: `plans/reports/brainstorm-260325-1224-internal-crm-system-design.md` (line 74-112)
- Lead lifecycle: brainstorm (line 271-289)
- Phone dedup: brainstorm (line 337-339)

## Overview

Implement Lead and Customer CRUD with pool/assignment logic, lead sources, labels, phone dedup, status transitions, and conversion from lead to customer. Core business logic of the CRM.

## Requirements

### Functional
- Customer CRUD: create, list (cursor paginated + filters), detail, update, soft delete
- Lead CRUD: create, list (cursor paginated + filters), detail, update, soft delete
- Lead Source CRUD (lookup table, super_admin)
- Label CRUD + assign/remove labels to leads/customers
- Lead Pool: unassigned leads viewable by managers
- Lead Assignment: manager assigns lead to user, records history
- Lead Status Transitions: pool → assigned → in_progress → converted/lost
- Phone dedup: on lead/customer create, check existing by normalized phone
- Lead → Customer conversion: create/link customer record, set lead status=CONVERTED
- Cursor pagination with filters: status, source, assigned_user, department, date range, search

### Non-Functional
- Phone normalization on all input (strip spaces, +84 → 0, ensure 10-11 digits)
- Activity log auto-created on: status change, assignment, label change
- Optimistic locking for assignment (prevent double-assign race condition)

## Architecture

### Module Structure
```
apps/api/src/modules/
├── customers/
│   ├── customers.module.ts
│   ├── customers.controller.ts
│   ├── customers.service.ts
│   ├── customers.repository.ts
│   └── dto/
│       ├── create-customer.dto.ts
│       ├── update-customer.dto.ts
│       └── customer-query.dto.ts
├── leads/
│   ├── leads.module.ts
│   ├── leads.controller.ts
│   ├── leads.service.ts
│   ├── leads.repository.ts
│   └── dto/
│       ├── create-lead.dto.ts
│       ├── update-lead.dto.ts
│       ├── assign-lead.dto.ts
│       ├── convert-lead.dto.ts
│       └── lead-query.dto.ts
├── lead-sources/
│   ├── lead-sources.module.ts
│   ├── lead-sources.controller.ts
│   ├── lead-sources.service.ts
│   └── dto/
├── labels/
│   ├── labels.module.ts
│   ├── labels.controller.ts
│   ├── labels.service.ts
│   └── dto/
```

### Lead Status Machine
```
POOL (Kho Mới: dept=null | Kho Phòng Ban: dept=X)
  │
  │ gán cho sale (claim/template/AI/thủ công)
  ▼
ASSIGNED ──(sale tạo note/gọi điện/tạo order = auto)──→ IN_PROGRESS
                                                             │
                                          ┌──────────────────┼──────────────┐
                                          ▼                  ▼              ▼
                                        LOST            CONVERTED       chuyển tiếp
                                          │                  │              │
                                          ▼                  ▼              ▼
                                      FLOATING          Customer     POOL (dept khác)
                                     (thả nổi)         tạo/update   hoặc FLOATING
                                          │
                                          │ any user claim
                                          ▼
                                      ASSIGNED (dept=user's dept, user=claimer)

FLOATING (Kho Thả Nổi): dept=null, user=null
  → ALL users thấy + claim
  → Lead đã từng qua phòng ban, bị thu hồi hoặc chủ động chuyển
  → User claim → ASSIGNED (dept=user's dept)
```

### 3 Kho Lead
- **Kho Mới:** `status=POOL AND department_id IS NULL` → manager+ thấy, phân phối
- **Kho Phòng Ban:** `status=POOL AND department_id=X AND assigned_user_id IS NULL` → NV dept X thấy + claim
- **Kho Thả Nổi:** `status=FLOATING` → ALL users thấy + claim về kho cá nhân

### API Endpoints

**Customers:**
- `GET /customers` — list, cursor paginated, search by name/phone (SUPER_ADMIN only)
- `GET /customers/search?phone=xxx` — search by phone (any auth user, includes INACTIVE). Rate-limited 10/min + audit log
- `GET /customers/:id` — detail: info + leads history + orders + payments + timeline + documents + labels
- `POST /customers` — create (phone dedup check)
- `PATCH /customers/:id` — update
- `POST /customers/:id/claim` — claim từ dept pool hoặc floating
- `POST /customers/:id/transfer` — chuyển: `{ targetType: "DEPARTMENT"|"FLOATING"|"INACTIVE", targetDeptId? }`
  - `DEPARTMENT`: chuyển sang dept khác, status=ACTIVE
  - `FLOATING`: kho thả nổi, status=FLOATING, all users thấy
  - `INACTIVE`: chăm sóc xong, ẩn khỏi mọi kho. Vẫn search SĐT + API bên thứ 3 tìm thấy
- `POST /customers/:id/reactivate` — kích hoạt lại INACTIVE customer (manager+)
- `DELETE /customers/:id` — soft delete

**Quyền transfer lead/customer:** User đang giữ (assigned_user) + Manager dept + Super Admin. Bất kỳ user nào đang giữ đều được chuyển.

**Leads:**
- `GET /leads` — list, cursor paginated, filters (status, source, user, dept, date)
- `GET /leads/pool/new` — Kho Mới: dept=null, status=POOL (manager+ only)
- `GET /leads/pool/department/:deptId` — Kho Phòng Ban: dept=X, user=null (NV dept X)
- `GET /leads/pool/floating` — Kho Thả Nổi: status=FLOATING (ALL users)
- `GET /leads/:id` — detail with customer, activities, labels
- `POST /leads` — create lead (MANAGER+ ONLY, auto-link/create customer)
- `PATCH /leads/:id` — update
- `POST /leads/:id/assign` — assign to user (manager+)
- `POST /leads/:id/claim` — user tự claim từ kho phòng ban hoặc kho thả nổi
- `POST /leads/:id/convert` — convert to customer
- `POST /leads/:id/status` — change status (with validation)
- `POST /leads/:id/transfer` — chuyển tiếp: `{ targetType: "DEPARTMENT"|"FLOATING"|"UNASSIGN", targetDeptId? }`
- `DELETE /leads/:id` — soft delete

**Lead Sources:**
- `GET /lead-sources` — list active
- `POST /lead-sources` — create (super_admin)
- `PATCH /lead-sources/:id` — update (super_admin)
- `DELETE /lead-sources/:id` — deactivate (super_admin)

**Labels:**
- `GET /labels` — list, optional category filter
- `POST /labels` — create (manager+)
- `PATCH /labels/:id` — update
- `POST /leads/:id/labels` — attach labels `{ labelIds: [] }`
- `DELETE /leads/:id/labels/:labelId` — detach label
- `POST /customers/:id/labels` — attach labels
- `DELETE /customers/:id/labels/:labelId` — detach label

## Related Code Files

### Create
- `apps/api/src/modules/customers/` — all customer files
- `apps/api/src/modules/leads/` — all lead files
- `apps/api/src/modules/lead-sources/` — all lead-source files
- `apps/api/src/modules/labels/` — all label files
- `packages/utils/src/phone.ts` — phone normalization (if not done in phase 01)

### Modify
- `apps/api/src/app.module.ts` — register new modules
- `packages/types/src/` — add Lead, Customer, Label DTOs/interfaces

## Implementation Steps

**SECURITY: IDOR Prevention (applies to ALL endpoints)**

Every repository query MUST scope to the user's access level. Never trust route params alone.

Pattern for all findById/update/delete operations:
```typescript
// ❌ VULNERABLE — any user can access any lead by ID
const lead = await prisma.lead.findUnique({ where: { id } })

// ✅ SAFE — scoped to user's access
async findByIdScoped(id: BigInt, user: CurrentUser) {
  const lead = await prisma.lead.findFirst({
    where: {
      id,
      deletedAt: null,
      ...this.buildAccessFilter(user), // adds role-based WHERE clause
    }
  })
  if (!lead) throw new NotFoundException('Lead not found')
  return lead
}

buildAccessFilter(user) {
  if (user.role === 'SUPER_ADMIN') return {}
  if (user.role === 'MANAGER') {
    return { assignedUser: { departmentId: { in: user.managedDeptIds } } }
  }
  if (user.isLeader) {
    return { assignedUserId: { in: [...user.teamMemberIds, user.id] } }
  }
  return { assignedUserId: user.id }
}
```
Apply this pattern to: leads.repository, customers.repository, orders.repository.

1. **Implement phone normalization utility**
   - `packages/utils/src/phone.ts`
   - Strip whitespace, dashes, dots
   - Convert `+84` prefix to `0`
   - Validate 10-11 digits (VN format)
   - Export `normalizePhone(input: string): string`

1b. **Implement CSV sanitization utility**
    - `packages/utils/src/csv-sanitizer.ts`
    - Sanitize cells starting with: = + - @ | (formula injection characters)
    - Prefix with single quote: `'=SUM(A1)` becomes `'''=SUM(A1)`
    - Apply on BOTH import (sanitize input data) and export (sanitize output data)
    - Export function: wrapCell(value) → if starts with dangerous char, prefix with tab character

2. **Implement LeadSources module**
   - Simple CRUD, super_admin for write operations
   - `is_active` filter on list endpoint

3. **Implement Labels module**
   - CRUD with color (hex) validation
   - Category grouping (optional)

4. **Implement Customers module**
   - `customers.repository.ts`: Prisma queries with soft delete, cursor pagination
   - `customers.service.ts`:
     - Create: normalize phone → check existing (by phone where deleted_at IS NULL) → create or return existing
     - Update: normalize phone if changed → dedup check
     - List: cursor pagination, search by name/phone (ILIKE or full-text)
   - `customers.controller.ts`: REST endpoints with role guards
   - Field-level permission: phone number can only be edited by MANAGER+
     In customers.service.ts update method:
     if (dto.phone && !['SUPER_ADMIN', 'MANAGER'].includes(currentUser.role)) {
       throw new ForbiddenException('Only managers can edit phone numbers')
     }

5. **Implement Leads module**
   - IMPORTANT: POST /leads requires @Roles(UserRole.MANAGER, UserRole.SUPER_ADMIN) — only managers can create leads
   - Field-level permission: phone number can only be edited by MANAGER+
     Same check as customers — strip phone from DTO if user is not manager+
   - `leads.repository.ts`: complex queries with joins (customer, source, labels, assigned user)
   - `leads.service.ts`:
     - **Create**: normalize phone → find/create customer → create lead with status=POOL, department_id=NULL (vào Kho Mới)
     - **Dedup (chỉ CSV import):** Cùng SĐT + cùng nguồn + cùng sản phẩm + trong cùng 1 file → skip dòng trùng. Cùng SĐT khác sản phẩm → tạo lead mới OK. Manual + 3rd party API → KHÔNG dedup, luôn tạo mới.
     - **LOST → FLOATING**: Khi lead lost → status=FLOATING, dept=null, user=null (vào Kho Thả Nổi). KHÔNG reopen về POOL nữa.
     - **IN_PROGRESS auto-trigger**: Khi sale thực hiện hành động đầu tiên (tạo note, gọi điện được match, tạo order) → tự chuyển ASSIGNED → IN_PROGRESS. Không cần bấm nút.
     - **Assign**: validate user exists + same department → set assigned_user_id, status=ASSIGNED → log activity + assignment_history
       (No reason field needed — keep it simple)
     - **Convert**: validate lead status is IN_PROGRESS → create/update customer → set lead status=CONVERTED → log activity
     - **Status change**: validate transition is allowed (state machine) → update → log activity
   - **Pool endpoints:**
     - Kho Mới: `WHERE status='POOL' AND department_id IS NULL AND deleted_at IS NULL` (manager+ only)
     - Kho Phòng Ban: `WHERE status='POOL' AND department_id=X AND assigned_user_id IS NULL AND deleted_at IS NULL` (NV dept X)
     - Kho Thả Nổi: `WHERE status='FLOATING' AND deleted_at IS NULL` (ALL authenticated users)
   - **Claim logic:**
     - Từ Kho Phòng Ban: chỉ NV cùng dept claim. Atomic UPDATE WHERE assigned_user_id IS NULL
     - Từ Kho Thả Nổi: bất kỳ user nào claim. Set dept=user's dept, user=claimer, status=ASSIGNED
   - **Transfer logic (POST /leads/:id/transfer):**
     - `DEPARTMENT`: dept=target, user=null, status=POOL (vào kho phòng ban đích)
     - `FLOATING`: dept=null, user=null, status=FLOATING (vào kho thả nổi)
     - `UNASSIGN`: giữ dept, user=null, status=POOL (bỏ gán, về kho phòng ban cũ)
   - SECURITY: Manager assignment boundary check
     On lead assignment (POST /leads/:id/assign):
     - Verify target user belongs to a department the manager manages
     - Verify the lead is in a department the manager manages
     if (!user.managedDeptIds.includes(lead.departmentId)) {
       throw new ForbiddenException('Cannot assign leads outside your managed departments')
     }

6. **Implement label attachment endpoints**
   - `POST /leads/:id/labels` — bulk attach: `{ labelIds: [1, 2, 3] }`
   - `DELETE /leads/:id/labels/:labelId` — single detach
   - Same for customers
   - Log activity on label change

7. **Auto-create Activity records**
   - Inject ActivityService (from phase 06 — stub it now with TODO)
   - On assign: create ASSIGNMENT activity
   - On status change: create STATUS_CHANGE activity
   - On label change: create LABEL_CHANGE activity

8. **Test all endpoints**
   - Create lead → verify pool, customer auto-created
   - Assign lead → verify status, history recorded
   - Convert lead → verify customer linked
   - Dedup: create lead with same phone → error returned
   - Pagination: verify cursor-based results

## Todo List

- [ ] Implement phone normalization utility
- [ ] Create LeadSources CRUD module
- [ ] Create Labels CRUD module
- [ ] Create Customers CRUD (repo, service, controller, DTOs)
- [ ] Implement customer phone dedup on create
- [ ] Create Leads CRUD (repo, service, controller, DTOs)
- [ ] Implement lead creation with auto customer link
- [ ] Implement 3 pool endpoints (Kho Mới, Kho Phòng Ban, Kho Thả Nổi)
- [ ] Implement lead claim (from dept pool + floating pool)
- [ ] Implement lead transfer (to dept / floating / unassign)
- [ ] Implement lead assignment with history tracking
- [ ] Implement lead status transitions (state machine with FLOATING)
- [ ] Implement IN_PROGRESS auto-trigger (on first note/call/order)
- [ ] Implement lead → customer conversion
- [ ] Implement label attach/detach for leads and customers
- [ ] Stub activity logging (prepare for phase 06)
- [ ] Add search (name/phone) to list endpoints
- [ ] Test dedup, assignment, conversion flows
- [ ] Register all modules in AppModule
- [ ] Implement phone field-level permission (manager+ only)
- [ ] Implement customer search by phone endpoint
- [ ] Restrict lead creation to manager+ only
- [ ] Implement IDOR-safe repository queries (buildAccessFilter pattern)
- [ ] Implement CSV sanitization utility (formula injection prevention)
- [ ] Implement lead reopen endpoint (LOST → POOL, manager+ only)
- [ ] Add rate limit + audit log on customer phone search
- [ ] Implement manager department boundary check on assignment
- [ ] Secure dedup response (no data leak to unauthorized users)

## Success Criteria

- Lead creation auto-creates/links customer by phone
- Phone dedup prevents duplicate leads from same source
- Assignment changes lead status and records history
- Conversion creates customer record and updates lead status
- Invalid status transitions are rejected with clear error
- Pool endpoint returns only unassigned leads for manager's department
- Cursor pagination works correctly with filters
- Labels attachable/detachable on both leads and customers
- Lost lead can be reopened to pool by manager+
- Phone edit blocked for non-manager users with 403 error
- Customer search by phone works for all authenticated users
- Lead creation returns 403 for regular users

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Race condition on assignment | Medium | Use `UPDATE ... WHERE assigned_user_id IS NULL RETURNING *` |
| Phone format edge cases | Medium | Comprehensive normalization + validation, reject invalid |
| Status transition bugs | High | Explicit state machine with allowed transitions map |
| N+1 queries on lead list | Medium | Prisma `include` with explicit select, test with 100+ leads |
| SQL injection in search queries | High | Use Prisma tagged template literals for ALL raw queries. Never string interpolation. |
| IDOR via sequential BigInt IDs | Critical | Scope ALL queries to user access level via buildAccessFilter |
| CSV formula injection | Critical | Sanitize dangerous prefixes (= + - @ |) on import AND export |
| Customer phone enumeration | Medium | Rate limit 10/min + audit log on search endpoint |
