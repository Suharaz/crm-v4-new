---
phase: 13
title: "Department Transfer & Advanced Features"
status: pending
priority: P1
effort: 16h
depends_on: [4, 5, 9]
---

# Phase 13: Department Transfer & Advanced Features

## Context Links

- Transfer flow: `plans/reports/brainstorm-260325-1224-internal-crm-system-design.md` (line 281-289)
- Free claim: brainstorm (line 339)
- Global search: `plans/reports/review-260325-1353-research-reports-synthesis.md` (line 192)

## Overview

Implement cross-department customer transfer flow, free claim system (users claim unclaimed customers in their department), global search across entities (leads/customers/orders), and notification system for assignments and transfers.

## Requirements

### Functional
- **Transfer**: sale initiates transfer of converted customer to target department
- Transfer puts customer in target department pool (unassigned)
- Transfer records history (from dept, to dept, initiated by, reason)
- **Free Claim**: any user in target department can claim unassigned customer
- Claim uses optimistic locking (prevent double-claim)
- **Global Search**: search across leads, customers, orders by name/phone/email
- Search results grouped by entity type
- **Notifications**: in-app notification for: new lead assigned, transfer received, claim happened
- Notification bell in header with unread count

### Non-Functional
- Claim race condition: DB-level `UPDATE ... WHERE assigned_user_id IS NULL RETURNING *`
- Global search <500ms (PostgreSQL full-text search)
- Notifications stored in DB, not real-time (polling every 30s)

## Architecture

### Module Structure
```
apps/api/src/modules/
├── tasks/
│   ├── tasks.module.ts
│   ├── tasks.controller.ts
│   ├── tasks.service.ts
│   ├── tasks.repository.ts
│   ├── task-reminder.service.ts      # Cron reminder + escalation
│   └── dto/
│       ├── create-task.dto.ts
│       └── task-query.dto.ts
├── transfers/
│   ├── transfers.module.ts
│   ├── transfers.controller.ts
│   ├── transfers.service.ts
│   └── dto/
│       ├── create-transfer.dto.ts
│       └── transfer-query.dto.ts
├── search/
│   ├── search.module.ts
│   ├── search.controller.ts
│   └── search.service.ts
├── notifications/
│   ├── notifications.module.ts
│   ├── notifications.controller.ts
│   ├── notifications.service.ts
│   ├── notifications.repository.ts
│   └── dto/
```

### Transfer Flow
```
Sale converts lead → lead.status = CONVERTED
Sale clicks "Transfer to Department X"
    │
    ▼
transfers.service.ts:
├── Set customer.assigned_user_id = null
├── Set customer.assigned_department_id = target dept
├── Create assignment_history record
├── Log activity (SYSTEM: "Transferred from Sales to Support")
├── Create notification for target dept manager
    │
    ▼
Target dept users see customer in their pool
User clicks "Claim" → claim endpoint
    │
    ▼
UPDATE customers SET assigned_user_id = :userId
WHERE id = :id AND assigned_user_id IS NULL
RETURNING *
    │
    ├─ Rows affected = 1 → Success, log activity + history
    └─ Rows affected = 0 → Already claimed, return error
```

### Notification Table
```prisma
model Notification {
  id         BigInt    @id @default(autoincrement())
  userId     BigInt    @map("user_id")
  type       String    // LEAD_ASSIGNED | TRANSFER_RECEIVED | CUSTOMER_CLAIMED | SYSTEM
  title      String
  content    String?
  entityType String?   @map("entity_type")  // lead | customer
  entityId   BigInt?   @map("entity_id")
  isRead     Boolean   @default(false) @map("is_read")
  createdAt  DateTime  @default(now()) @map("created_at")
  user       User      @relation(fields: [userId], references: [id])
  @@index([userId, isRead, createdAt])
  @@map("notifications")
}
```

### API Endpoints

**Tasks (todo/reminder):**
- `GET /tasks` — list tasks của mình (filter: status, dueDate, priority, entityType)
- `GET /tasks/today` — tasks đến hạn hôm nay + quá hạn
- `GET /tasks/overdue` — tasks quá hạn chưa complete
- `GET /leads/:id/tasks` — tasks gắn với lead
- `GET /customers/:id/tasks` — tasks gắn với customer
- `POST /tasks` — tạo task. Body: `{ title, entityType?, entityId?, dueDate?, remindAt?, priority?, assignedTo? }`
  - assignedTo mặc định = currentUser (tự tạo cho mình)
  - manager có thể giao cho người khác
  - remindAt mặc định = dueDate - 15 phút
- `POST /tasks/quick` — quick create với smart time parsing. Body: `{ text, entityType?, entityId? }`
  - Parse "Gọi lại chiều mai 14h" → title + dueDate + remindAt tự động
- `PATCH /tasks/:id` — update (title, dueDate, priority, status)
- `PATCH /tasks/:id/complete` — đánh dấu hoàn thành
- `DELETE /tasks/:id` — soft delete

**Transfers:**
- `POST /transfers` — initiate transfer (lead hoặc customer)
  Body: `{ entityType, entityId, targetType: "DEPARTMENT"|"FLOATING"|"UNASSIGN", targetDepartmentId?, reason }`
  - `DEPARTMENT`: chuyển sang pool phòng ban khác
  - `FLOATING`: chuyển về kho thả nổi (public, ai cũng claim)
  - `UNASSIGN`: bỏ gán, về pool phòng ban hiện tại
- `GET /transfers` — list transfers (filter: department, date)
- `POST /customers/:id/claim` — claim unassigned customer (từ dept pool hoặc floating)

**Search:**
- `GET /search?q=query` — global search across entities

**Notifications:**
- `GET /notifications` — list user's notifications, cursor paginated
- `GET /notifications/unread-count` — unread count
- `PATCH /notifications/:id/read` — mark as read
- `PATCH /notifications/read-all` — mark all as read

### Frontend Structure
```
apps/web/src/components/
├── transfers/
│   ├── transfer-dialog.tsx          # Initiate transfer modal
│   └── transfer-history.tsx         # Transfer history list
├── search/
│   ├── global-search.tsx            # Search in header (cmdk style)
│   └── search-results.tsx           # Grouped results dropdown
├── notifications/
│   ├── notification-bell.tsx        # Header bell + unread count
│   ├── notification-dropdown.tsx    # Dropdown list
│   └── notification-item.tsx        # Single notification row
```

## Related Code Files

### Create
- `apps/api/src/modules/transfers/` — all transfer files
- `apps/api/src/modules/search/` — all search files
- `apps/api/src/modules/notifications/` — all notification files
- `apps/web/src/components/transfers/` — transfer UI
- `apps/web/src/components/search/` — global search UI
- `apps/web/src/components/notifications/` — notification UI

### Modify
- `packages/database/prisma/schema.prisma` — add Notification model
- `apps/api/src/app.module.ts` — register modules
- `apps/api/src/modules/leads/leads.service.ts` — trigger notification on assign
- `apps/api/src/modules/customers/customers.controller.ts` — add claim endpoint
- `apps/web/src/components/layout/header.tsx` — add search + notification bell
- `apps/web/src/components/customers/customer-detail-panel.tsx` — add transfer button

## Implementation Steps

1. **Add Notification model to Prisma schema** + migrate

2. **Implement Notifications module**
   - `notifications.service.ts`:
     - `create(userId, type, title, content?, entityType?, entityId?)`
     - `getForUser(userId, cursor, limit)` — paginated
     - `getUnreadCount(userId)`
     - `markRead(notificationId, userId)`
     - `markAllRead(userId)`
   - Export service for use by other modules
   - SECURITY: Sanitize notification title and content before storage
     - Strip HTML tags from title (plain text only)
     - Sanitize content (allow basic markdown, strip scripts/HTML)
     - Never render notification content as dangerouslySetInnerHTML on frontend

3. **Implement Transfers module**
   - `transfers.service.ts`:
     - `initiateTransfer(customerId, toDepartmentId, initiatedBy, reason)`:
       - Validate customer exists + is assigned to initiator (or initiator is manager)
       - Set customer.assigned_user_id = null
       - Set customer.assigned_department_id = toDepartmentId
       - Create assignment_history (from/to dept, from/to user)
       - Log activity
       - Notify target dept manager
     - `listTransfers(filters)` — cursor paginated
   - SECURITY: Transfer boundary checks:
     - Initiator must be customer owner OR manager of customer's current department
     - Target department must be a valid active department
     - Manager can only transfer to departments (no restriction on target for manager)
     - Regular user can only transfer customers assigned to them
     - Log transfer initiator for audit

4. **Implement claim endpoint**
   - Add to customers controller: `POST /customers/:id/claim`
   - Raw query: `UPDATE customers SET assigned_user_id = $1 WHERE id = $2 AND assigned_user_id IS NULL AND assigned_department_id = $3 AND deleted_at IS NULL RETURNING *`
   - If no rows returned → already claimed (return 409 Conflict)
   - On success → log activity, create assignment_history, notify previous dept
   - SECURITY: Claim validation in service layer (before raw query):
     - Verify user.departmentId matches customer.assigned_department_id
     - If user has no department → reject
     - If user's department != customer's target department → reject with 403
     ```
     const customer = await prisma.customer.findFirst({ where: { id, deletedAt: null } })
     if (customer.assignedDepartmentId !== user.departmentId) {
       throw new ForbiddenException('Cannot claim customer outside your department')
     }
     ```

5. **Implement Global Search**
   - `search.service.ts`:
     - SECURITY: Search MUST respect user's access scope
     - Apply role-based filtering to EACH entity search:
       - SUPER_ADMIN: search all entities
       - MANAGER: search entities in managed departments only
       - LEADER: search leads of team members + own assigned entities
       - USER: search only own assigned leads + any customer by phone
     - Implementation: pass user context to each sub-query, apply WHERE clause
     - For customers: all users can search by phone (as per requirement), but full-text name search restricted to manager+
     - Search leads: `WHERE to_tsvector('simple', name || ' ' || phone) @@ plainto_tsquery($1)` + ILIKE fallback
     - Search customers: same pattern
     - Search orders: by order ID or customer name
     - Return top 5 from each entity type
   - Single endpoint: `GET /search?q=term`

6. **Wire notifications into existing modules**
   - Lead assignment → notify assigned user
   - Transfer → notify target dept manager
   - Claim → notify previous dept manager (if any)
   - Payment verified → notify lead owner

7. **Build transfer UI**
   - Transfer dialog on customer detail page (visible after conversion)
   - Select target department, enter reason
   - Confirmation with summary

8. **Build global search**
   - Command palette style (cmdk or custom)
   - Trigger: search icon in header or keyboard shortcut (Ctrl+K)
   - Debounced input, grouped results
   - Click result → navigate to entity detail page

9. **Build notification bell**
   - Bell icon in header with unread badge
   - Dropdown: list recent notifications
   - Click → mark as read + navigate to entity
   - "Mark all as read" button
   - Polling: refetch unread count every 30s

## Todo List

- [ ] Implement Tasks module (CRUD + quick create)
- [ ] Implement task reminder cron (5 min, send once via remindedAt flag)
- [ ] Implement task escalation (overdue 1h → user, overdue 24h → manager)
- [ ] Implement smart time parsing for quick add ("chiều mai 14h", "tuần sau")
- [ ] Build task quick add bar (sticky bottom on lead/customer detail)
- [ ] Build quick time buttons (preset: 30p, 1h, 3h, chiều nay, sáng mai, chiều mai, tuần sau)
- [ ] Build "Tạo nhắc nhở" checkbox in note form
- [ ] Build dashboard widget "Việc cần làm hôm nay"
- [ ] Build lead/customer detail tab "Công việc"
- [ ] Add overdue task badge to header (next to notification bell)
- [ ] Add Notification model to Prisma schema + migrate
- [ ] Implement notifications service (create, list, mark read)
- [ ] Implement transfers service (initiate, list)
- [ ] Implement customer claim endpoint (optimistic locking)
- [ ] Implement global search service (full-text)
- [ ] Wire notifications into lead assign, transfer, claim
- [ ] Build transfer dialog component
- [ ] Build global search (cmdk style)
- [ ] Build notification bell + dropdown
- [ ] Add search + bell to header
- [ ] Test transfer flow end-to-end
- [ ] Test claim race condition (concurrent claims)
- [ ] Test global search accuracy
- [ ] Test notification polling
- [ ] Implement notification cleanup cron (daily at 4 AM):
  - Delete read notifications older than 90 days
  - Delete ALL notifications older than 180 days
  - Use @Cron('0 4 * * *') similar to refresh token cleanup in Phase 03

## Success Criteria

- Transfer moves customer to target department pool
- Claim assigns customer atomically (no double-claim)
- Claim failure returns 409 with clear message
- Global search returns relevant results across entities in <500ms
- Notifications created on assign, transfer, claim
- Notification bell shows unread count
- All actions logged in activity timeline + assignment history

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Double-claim race condition | High | DB-level WHERE clause + RETURNING, not app-level check |
| Full-text search relevance | Medium | Use 'simple' config for VN names, ILIKE fallback |
| Notification volume | Low | Batch notifications, don't notify for own actions |
| Transfer abuse | Low | Only manager+ can initiate, log all transfers |
| Global search RBAC bypass | High | Apply user access scope to every search sub-query |
| Transfer to unauthorized dept | Medium | Validate initiator owns customer or manages current dept |
| Claim outside own dept | High | Verify user.departmentId matches customer target dept before UPDATE |
| Notification XSS | Medium | Sanitize title/content, never render as raw HTML |

## Security Considerations

- Claim only allowed for users in matching department
- Transfer only by customer owner or manager+
- Notifications scoped to user (can't read others' notifications)
- Search respects RBAC: users only see entities in their department scope
