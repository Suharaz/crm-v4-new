---
phase: 2
title: "Database Schema & Prisma Setup"
status: pending
priority: P0
effort: 12h
depends_on: [1]
---

# Phase 02: Database Schema & Prisma Setup

## Context Links

- Data model: `plans/reports/brainstorm-260325-1224-internal-crm-system-design.md` (line 36-258)
- PK decision (BIGINT): `plans/reports/review-260325-1353-research-reports-synthesis.md` (line 39-51)
- Enum strategy: `plans/reports/review-260325-1353-research-reports-synthesis.md` (line 98-107)

## Overview

Implement full Prisma 6 schema with all CRM tables, BIGINT primary keys, soft delete, proper indexes, enums for stable values, lookup tables for dynamic values. Create seed script with realistic dev data.

## Requirements

### Functional
- All tables from brainstorm data model (users, departments, employee_levels, teams, manager_departments, customers, leads, lead_sources, products, product_categories, orders, payments, payment_types, labels, lead_labels, customer_labels, activities, activity_attachments, call_logs, assignment_history, ai_distribution_configs)
- product_categories (lookup table for product categorization)
- documents (file uploads for leads/customers - docs, images, PDF)
- BIGINT IDENTITY primary keys on all tables
- Soft delete (`deleted_at` nullable timestamp) on CRM entities
- Seed script with: super_admin user, departments, employee levels, lead sources, payment types, sample data

### Non-Functional
- Partial indexes on `deleted_at IS NULL` for all soft-delete tables
- Composite indexes for common query patterns
- GIN index on JSONB metadata columns
- Phone column indexes for call matching
- Full-text search index on lead/customer name+phone
- Health check endpoint `/health` with DB connectivity check (using @nestjs/terminus)

## Architecture

### Enum Definitions (Prisma native → PG enum)
```
UserRole: SUPER_ADMIN | MANAGER | USER
UserStatus: ACTIVE | INACTIVE
LeadStatus: POOL | ASSIGNED | IN_PROGRESS | CONVERTED | LOST | FLOATING
CustomerStatus: ACTIVE | INACTIVE | FLOATING
OrderStatus: PENDING | CONFIRMED | COMPLETED | CANCELLED | REFUNDED
PaymentStatus: PENDING | VERIFIED | REJECTED
CallType: OUTGOING | INCOMING | MISSED
MatchStatus: AUTO_MATCHED | UNMATCHED | MANUALLY_MATCHED
EntityType: LEAD | CUSTOMER
ActivityType: NOTE | CALL | STATUS_CHANGE | ASSIGNMENT | LABEL_CHANGE | SYSTEM
```

### Lookup Tables (CRUD by super_admin)
- `lead_sources` — dynamic, new sources added frequently
- `payment_types` — dynamic, new payment methods possible
- `labels` — dynamic, user-created tags

### Key Index Strategy (43 total indexes)

**Prisma-level (25):** FK indexes, composite indexes for common queries
**Raw SQL (18):** Partial indexes (WHERE deleted_at IS NULL), GIN for JSONB/FTS, partial unique constraints

**Critical query patterns covered:**
- Lead list filter: `(status, assigned_user_id, created_at DESC) WHERE deleted_at IS NULL`
- Phone dedup/search: `leads(phone)`, `customers(phone)` WHERE active
- Timeline: `activities(entity_type, entity_id, created_at DESC)`
- Call matching: `call_logs(phone_number, call_time)`
- Pool queries: `leads(status, assigned_user_id)`, `customers(dept_id, user_id)`
- Full-text search: GIN on `to_tsvector('simple', name || phone)` for leads + customers
- Unmatched calls: `call_logs(match_status) WHERE UNMATCHED`
- Pending payments: `payments(status) WHERE PENDING`
- Token cleanup: `refresh_tokens(expires_at) WHERE revoked_at IS NULL`
- Unique active: `users(email)`, `departments(name)` WHERE deleted_at IS NULL

## Related Code Files

### Modify
- `packages/database/prisma/schema.prisma` — full schema

### Create
- `packages/database/prisma/seed.ts` — seed script
- `packages/database/prisma/migrations/` — auto-generated
- `packages/database/src/index.ts` — PrismaClient singleton export
- `packages/database/src/prisma.extension.ts` — soft delete middleware/extension

## Implementation Steps

1. **Define enums in schema.prisma**
   - All 8 enum types listed above
   - Keep enums for status fields only (stable values)

2. **Create User/Org models**
   ```prisma
   model User {
     id              BigInt    @id @default(autoincrement())
     email           String
     passwordHash    String    @map("password_hash")
     phone           String?
     name            String
     role            UserRole  @default(USER)
     departmentId    BigInt?   @map("department_id")
     teamId          BigInt?   @map("team_id")
     employeeLevelId BigInt?   @map("employee_level_id")
     isLeader        Boolean   @default(false) @map("is_leader")
     status          UserStatus @default(ACTIVE)
     failedLoginCount Int      @default(0) @map("failed_login_count")
     lockedUntil     DateTime? @map("locked_until")
     metadata        Json?
     createdAt       DateTime  @default(now()) @map("created_at")
     updatedAt       DateTime  @updatedAt @map("updated_at")
     deletedAt       DateTime? @map("deleted_at")

     department      Department? @relation(fields: [departmentId], references: [id])
     team            Team?       @relation("TeamMembers", fields: [teamId], references: [id])
     leadingTeam     Team?       @relation("TeamLeader")
     managedDepts    ManagerDepartment[] @relation("ManagedDepartments")

     @@unique([email, deletedAt])
     @@map("users")
   }

   model Team {
     id            BigInt     @id @default(autoincrement())
     name          String
     departmentId  BigInt     @map("department_id")
     leaderId      BigInt     @unique @map("leader_id")
     department    Department @relation(fields: [departmentId], references: [id])
     leader        User       @relation("TeamLeader", fields: [leaderId], references: [id])
     members       User[]     @relation("TeamMembers")
     createdAt     DateTime   @default(now()) @map("created_at")
     updatedAt     DateTime   @updatedAt @map("updated_at")
     deletedAt     DateTime?  @map("deleted_at")
     @@map("teams")
   }

   model ManagerDepartment {
     managerId    BigInt     @map("manager_id")
     departmentId BigInt     @map("department_id")
     manager      User       @relation("ManagedDepartments", fields: [managerId], references: [id])
     department   Department @relation(fields: [departmentId], references: [id])
     assignedAt   DateTime   @default(now()) @map("assigned_at")
     @@id([managerId, departmentId])
     @@map("manager_departments")
   }
   ```
   - Note: managerId field REMOVED from User. Manager-department relationship now via junction table.
   - Department, EmployeeLevel models similarly

3. **Create Lead/Customer models**
   - Customer: phone (required, indexed), name, email, metadata, assigned_user_id, assigned_department_id, status (CustomerStatus, default ACTIVE)
     - **ACTIVE:** đang được chăm sóc (có assigned_user hoặc trong dept pool)
     - **INACTIVE:** chăm sóc xong, ẩn khỏi mọi kho. Vẫn tìm được qua search SĐT + API bên thứ 3
     - **FLOATING:** kho thả nổi, ALL users thấy + claim
   - Lead: customer_id FK, product_id FK, source_id FK, assigned_user_id FK, department_id FK (nullable), status enum, phone, name, email, metadata
   - **3 KHO logic (không cần field riêng):**
     - Kho Mới: `status=POOL AND department_id IS NULL` → manager+ thấy, phân phối vào dept
     - Kho Phòng Ban: `status=POOL AND department_id=X AND assigned_user_id IS NULL` → NV dept X thấy + claim
     - Kho Thả Nổi: `status=FLOATING` → ALL users thấy + claim về kho cá nhân
     - Kho Cá Nhân: `assigned_user_id IS NOT NULL` → user đó quản lý
   - Lead mới tạo: department_id=NULL, status=POOL (vào Kho Mới)
   - LeadSource lookup table: name, description, is_active

4. **Create Product/Order/Payment models**
   - Product: name, price (Decimal), description, status enum, categoryId (BigInt? FK → product_categories), vatRate (Decimal(5,2) @default(0) @map("vat_rate"))
   - Order: lead_id, customer_id, product_id, amount (Decimal), status enum, notes, created_by, vatRate (Decimal(5,2) NOT NULL @map("vat_rate") — snapshot from product at creation time), vatAmount (Decimal(10,2) NOT NULL @map("vat_amount") — = amount * vatRate / 100), totalAmount (Decimal(10,2) NOT NULL @map("total_amount") — = amount + vatAmount)
   - Payment: order_id, payment_type_id, amount (Decimal), status enum, status_verify (Boolean), verified_by, verified_at, transfer_content (String? — nội dung CK sale nhập), matched_bank_transaction_id (BigInt? FK → bank_transactions), verified_source (enum: AUTO | MANUAL — ai/cái gì verify)
   - PaymentType lookup table: name, description, is_active
   - Seed PaymentTypes: CK lần 1, CK lần 2, CK lần 3, CK lần 4, CK full, COD, Tiền mặt

4b. **Create ProductCategory model**
    ```prisma
    model ProductCategory {
      id          BigInt    @id @default(autoincrement())
      name        String
      description String?
      isActive    Boolean   @default(true) @map("is_active")
      createdAt   DateTime  @default(now()) @map("created_at")
      updatedAt   DateTime  @updatedAt @map("updated_at")
      products    Product[]
      @@map("product_categories")
    }
    ```
    Add to Product model: categoryId BigInt? FK → product_categories, vatRate Decimal(5,2) default 0

5. **Create Label models**
   - Label: name, color, category, is_active
   - LeadLabel: composite PK (lead_id, label_id)
   - CustomerLabel: composite PK (customer_id, label_id)

6. **Create Activity models**
   - Activity: entity_type enum, entity_id, user_id, type enum, content, metadata
   - ActivityAttachment: activity_id, file_name, file_url, file_type, file_size

6b. **Create Documents model**
    ```prisma
    model Document {
      id          BigInt      @id @default(autoincrement())
      entityType  EntityType
      entityId    BigInt      @map("entity_id")
      uploadedBy  BigInt      @map("uploaded_by")
      fileName    String      @map("file_name")
      fileUrl     String      @map("file_url")
      fileType    String      @map("file_type")
      fileSize    Int         @map("file_size")
      description String?
      createdAt   DateTime    @default(now()) @map("created_at")
      deletedAt   DateTime?   @map("deleted_at")
      uploader    User        @relation(fields: [uploadedBy], references: [id])
      @@index([entityType, entityId, createdAt])
      @@map("documents")
    }
    ```
    Accepted: .pdf, .doc, .docx, .xls, .xlsx, .jpg, .jpeg, .png, .gif, .webp. Max 10MB.

7. **Create CallLog model**
   - external_id (unique), phone_number, call_type enum, call_time, duration, content, matched_entity_type, matched_entity_id, matched_user_id, match_status enum, verified_by

8. **Create AssignmentHistory model**
   - entity_type, entity_id, from_user_id, to_user_id, from_department_id, to_department_id, assigned_by, reason

9. **Create AiDistributionConfig model**
   - department_id, is_active, matching_criteria (Json), weight_config (Json)

9aa. **Create AssignmentTemplate + Member models**
    ```prisma
    model AssignmentTemplate {
      id          BigInt    @id @default(autoincrement())
      name        String                             // "Chia Team A Sales"
      strategy    String    @default("ROUND_ROBIN")   // ROUND_ROBIN | AI_WEIGHTED
      isActive    Boolean   @default(true) @map("is_active")
      createdBy   BigInt    @map("created_by")
      createdAt   DateTime  @default(now()) @map("created_at")
      updatedAt   DateTime  @updatedAt @map("updated_at")
      creator     User      @relation(fields: [createdBy], references: [id])
      members     AssignmentTemplateMember[]
      @@map("assignment_templates")
    }

    model AssignmentTemplateMember {
      templateId  BigInt    @map("template_id")
      userId      BigInt    @map("user_id")
      template    AssignmentTemplate @relation(fields: [templateId], references: [id])
      user        User      @relation(fields: [userId], references: [id])
      @@id([templateId, userId])
      @@map("assignment_template_members")
    }
    ```
    - Manager chọn danh sách người CỤ THỂ khi tạo template
    - Round-robin: chia vòng lặp cho đến hết lead (7 leads / 5 người → 2+2+1+1+1)
    - Không bắt buộc chia hết — vòng lặp tự xử lý số dư

9ac. **Create Task model** (todo/reminder cho sales)
    ```prisma
    model Task {
      id              BigInt        @id @default(autoincrement())
      title           String
      description     String?
      entityType      EntityType?
      entityId        BigInt?       @map("entity_id")
      assignedTo      BigInt        @map("assigned_to")
      createdBy       BigInt        @map("created_by")
      dueDate         DateTime?     @map("due_date")
      remindAt        DateTime?     @map("remind_at")
      remindedAt      DateTime?     @map("reminded_at")
      escalation1At   DateTime?     @map("escalation_1_at")
      escalation2At   DateTime?     @map("escalation_2_at")
      status          TaskStatus    @default(PENDING)
      priority        TaskPriority  @default(MEDIUM)
      completedAt     DateTime?     @map("completed_at")
      createdAt       DateTime      @default(now()) @map("created_at")
      updatedAt       DateTime      @updatedAt @map("updated_at")
      deletedAt       DateTime?     @map("deleted_at")
      assignee        User          @relation("TaskAssignee", fields: [assignedTo], references: [id])
      creator         User          @relation("TaskCreator", fields: [createdBy], references: [id])
      @@index([assignedTo, status, dueDate])
      @@index([remindAt, remindedAt, status])
      @@map("tasks")
    }
    ```
    - TaskStatus: PENDING | COMPLETED | CANCELLED
    - TaskPriority: LOW | MEDIUM | HIGH
    - remindedAt: null=chưa gửi, có giá trị=đã gửi (chống spam)
    - escalation1At: quá hạn 1h, escalation2At: quá hạn 24h notify manager

9ab. **Create RecallConfig model** (auto thu hồi lead/customer quá hạn)
    ```prisma
    model RecallConfig {
      id              BigInt    @id @default(autoincrement())
      entityType      String    @map("entity_type")      // LEAD | CUSTOMER
      maxDaysInPool   Int       @map("max_days_in_pool")  // VD: 7
      autoLabelIds    BigInt[]  @map("auto_label_ids")    // label IDs gắn khi thu hồi
      isActive        Boolean   @default(true) @map("is_active")
      createdBy       BigInt    @map("created_by")
      createdAt       DateTime  @default(now()) @map("created_at")
      updatedAt       DateTime  @updatedAt @map("updated_at")
      creator         User      @relation(fields: [createdBy], references: [id])
      @@map("recall_configs")
    }
    ```
    - Super admin config số ngày + nhãn mặc định
    - Cron job dùng config này để thu hồi về kho thả nổi

9a. **Create BankTransaction model** (raw webhook data từ cổng thanh toán)
    ```prisma
    model BankTransaction {
      id                BigInt       @id @default(autoincrement())
      externalId        String       @unique @map("external_id")  // mã GD từ ngân hàng, dedup
      amount            Decimal      @db.Decimal(12, 2)
      content           String       // nội dung chuyển khoản
      bankAccount       String?      @map("bank_account")       // TK nhận
      senderName        String?      @map("sender_name")
      senderAccount     String?      @map("sender_account")
      transactionTime   DateTime     @map("transaction_time")
      matchedPaymentId  BigInt?      @unique @map("matched_payment_id")
      matchStatus       MatchStatus  @default(UNMATCHED) @map("match_status")
      rawData           Json?        @map("raw_data")           // payload gốc webhook
      createdAt         DateTime     @default(now()) @map("created_at")

      matchedPayment    Payment?     @relation(fields: [matchedPaymentId], references: [id])

      @@index([matchStatus, createdAt])
      @@index([amount, transactionTime])
      @@map("bank_transactions")
    }
    ```
    - MatchStatus enum: reuse existing (AUTO_MATCHED | UNMATCHED | MANUALLY_MATCHED)
    - externalId unique → chống dedup webhook trùng
    - matchedPaymentId unique → 1 bank transaction chỉ match 1 payment

9b. **Create ApiKey model**
    ```prisma
    model ApiKey {
      id          BigInt    @id @default(autoincrement())
      name        String
      keyHash     String    @unique @map("key_hash")
      keyPrefix   String    @map("key_prefix")
      permissions String[]  @default(["leads:create"])
      isActive    Boolean   @default(true) @map("is_active")
      lastUsedAt  DateTime? @map("last_used_at")
      createdBy   BigInt    @map("created_by")
      createdAt   DateTime  @default(now()) @map("created_at")
      expiresAt   DateTime? @map("expires_at")
      creator     User      @relation(fields: [createdBy], references: [id])
      @@map("api_keys")
    }
    ```
    - API keys hashed with SHA-256 before storage
    - keyPrefix stores first 8 chars for identification (e.g. "crm_abc1...")
    - Super admin manages API keys via settings

10. **Add indexes via raw SQL migration**

    **A. Prisma-level indexes (@@index in schema.prisma):**
    ```prisma
    // USERS
    @@index([departmentId])     // users in dept
    @@index([teamId])           // users in team
    @@index([role, status])     // filter by role+status

    // TEAMS
    @@index([departmentId])     // teams in dept

    // LEADS
    @@index([customerId])       // leads by customer
    @@index([sourceId])         // leads by source
    @@index([productId])        // leads by product
    @@index([status, assignedUserId])  // pool + assignment

    // CUSTOMERS
    @@index([assignedUserId])   // customer by user
    @@index([assignedDepartmentId, assignedUserId])  // dept pool

    // ORDERS
    @@index([leadId])           // orders by lead
    @@index([customerId])       // orders by customer
    @@index([createdBy])        // orders I created

    // PAYMENTS
    @@index([orderId])          // payments for order

    // ACTIVITIES
    @@index([entityType, entityId, createdAt])  // timeline
    @@index([userId, createdAt])                // user activities

    // ACTIVITY_ATTACHMENTS
    @@index([activityId])       // attachments for activity

    // CALL_LOGS
    @@index([phoneNumber, callTime])  // call lookup
    @@index([matchedEntityType, matchedEntityId, callTime])  // entity calls

    // ASSIGNMENT_HISTORY
    @@index([entityType, entityId, createdAt])  // history timeline

    // LEAD_LABELS / CUSTOMER_LABELS (reverse lookup)
    // lead_labels: @@index([labelId])
    // customer_labels: @@index([labelId])

    // REFRESH_TOKENS
    @@index([tokenHash])        // lookup on refresh
    @@index([userId])           // revoke all user tokens

    // MANAGER_DEPARTMENTS
    @@index([departmentId])     // managers of dept (reverse)
    ```

    **B. Raw SQL migration for partial + GIN + FTS indexes (cannot express in Prisma):**
    ```sql
    -- USERS: active users, unique email
    CREATE UNIQUE INDEX idx_users_email_active ON users(email) WHERE deleted_at IS NULL;
    CREATE INDEX idx_users_active ON users(status) WHERE status = 'ACTIVE' AND deleted_at IS NULL;

    -- DEPARTMENTS: unique name
    CREATE UNIQUE INDEX idx_dept_name_active ON departments(name) WHERE deleted_at IS NULL;

    -- LEADS: main filter query (status + user + date, active only)
    CREATE INDEX idx_leads_filter ON leads(status, assigned_user_id, created_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX idx_leads_created ON leads(created_at DESC) WHERE deleted_at IS NULL;
    CREATE INDEX idx_leads_phone_active ON leads(phone) WHERE deleted_at IS NULL;

    -- LEADS: full-text search
    CREATE INDEX idx_leads_fts ON leads USING GIN(
      to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(phone,''))
    ) WHERE deleted_at IS NULL;

    -- LEADS: GIN on JSONB metadata
    CREATE INDEX idx_leads_metadata ON leads USING GIN(metadata) WHERE deleted_at IS NULL;

    -- CUSTOMERS: phone search + pool + FTS
    CREATE INDEX idx_customers_phone_active ON customers(phone) WHERE deleted_at IS NULL;
    CREATE INDEX idx_customers_email_active ON customers(email) WHERE deleted_at IS NULL AND email IS NOT NULL;
    CREATE INDEX idx_customers_dept_pool ON customers(assigned_department_id, assigned_user_id) WHERE deleted_at IS NULL;
    CREATE INDEX idx_customers_fts ON customers USING GIN(
      to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(phone,''))
    ) WHERE deleted_at IS NULL;
    CREATE INDEX idx_customers_metadata ON customers USING GIN(metadata) WHERE deleted_at IS NULL;

    -- ORDERS: status filter
    CREATE INDEX idx_orders_status_active ON orders(status) WHERE deleted_at IS NULL;
    CREATE INDEX idx_orders_customer_date ON orders(customer_id, created_at DESC) WHERE deleted_at IS NULL;

    -- PAYMENTS: pending queue
    CREATE INDEX idx_payments_pending ON payments(status) WHERE status = 'PENDING';

    -- CALL_LOGS: unmatched queue
    CREATE INDEX idx_calls_unmatched ON call_logs(match_status) WHERE match_status = 'UNMATCHED' AND deleted_at IS NULL;

    -- ACTIVITIES: global feed
    CREATE INDEX idx_activities_global ON activities(entity_type, created_at DESC) WHERE deleted_at IS NULL;

    -- REFRESH_TOKENS: cleanup
    CREATE INDEX idx_refresh_cleanup ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;

    -- EMPLOYEE_LEVELS: rank sort
    CREATE INDEX idx_emp_levels_rank ON employee_levels(rank);
    ```

    **Total: ~25 Prisma indexes + ~18 raw SQL indexes = 43 indexes across 21 tables**
    Note: Add indexes incrementally. Profile with EXPLAIN ANALYZE after data loaded. Remove unused indexes after 3 months.

11. **Create Prisma soft-delete extension**
    - Extend `findMany`, `findFirst`, `findUnique` to auto-filter `deletedAt: null`
    - `softDelete` method that sets `deletedAt: new Date()`
    - Export from `packages/database/src/prisma.extension.ts`

12. **Create seed script**
    - 1 super_admin (admin@crm.local / changeme)
    - 3 departments (Sales, Support, Marketing)
    - 3 employee levels (Junior rank=1, Mid rank=2, Senior rank=3)
    - 5 lead sources (Website, Facebook, Referral, Cold Call, Event)
    - 4 payment types (Bank Transfer, COD, Installment, Cash)
    - 10 sample labels
    - 5 sample users across departments
    - 3 teams across departments (e.g. Sales Team A, Sales Team B, Support Team A)
    - Assign managers to departments via manager_departments
    - 20 sample leads in various statuses
    - 5 sample customers with orders

13. **Run migration and verify**
    - `pnpm db:generate` — generate Prisma client
    - `pnpm db:push` or `pnpm db:migrate dev` — apply schema
    - `pnpm db:seed` — populate dev data
    - Verify via `psql` or Prisma Studio

## Todo List

- [ ] Define all 8 Prisma enums
- [ ] Create User, Department, EmployeeLevel models
- [ ] Create Customer, Lead, LeadSource models
- [ ] Create Product, Order, Payment, PaymentType models
- [ ] Create Label, LeadLabel, CustomerLabel models
- [ ] Create Activity, ActivityAttachment models
- [ ] Create CallLog model
- [ ] Create AssignmentHistory model
- [ ] Create AiDistributionConfig model
- [ ] Create Task model + TaskStatus + TaskPriority enums
- [ ] Create AssignmentTemplate + AssignmentTemplateMember models
- [ ] Create RecallConfig model
- [ ] Add CustomerStatus enum (ACTIVE, INACTIVE, FLOATING)
- [ ] Add status field to Customer model
- [ ] Create Team model with leader relation
- [ ] Create ManagerDepartment junction table
- [ ] Create BankTransaction model (webhook raw data)
- [ ] Add transfer_content, matched_bank_transaction_id, verified_source to Payment model
- [ ] Add VerifiedSource enum (AUTO, MANUAL)
- [ ] Create ApiKey model
- [ ] Create ProductCategory model
- [ ] Create Documents model
- [ ] Add VAT fields to Product and Order models
- [ ] Add `department_id` FK to leads table (explicit pool scope)
- [ ] Add `failedLoginCount` and `lockedUntil` to User model
- [ ] Add all `@@map` table name mappings (snake_case)
- [ ] Add all `@map` column name mappings (snake_case)
- [ ] Add ~25 Prisma-level @@index declarations across all models
- [ ] Create raw SQL migration for ~18 partial/GIN/FTS indexes
- [ ] Verify all indexes created with: SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
- [ ] Create soft-delete Prisma extension
- [ ] Create PrismaClient singleton export
- [ ] Write seed script with realistic data
- [ ] Run migration and verify schema
- [ ] Test seed script

## Success Criteria

- `npx prisma migrate dev` runs without errors
- All tables created in PostgreSQL with correct types (BIGINT PKs, proper enums)
- Partial indexes exist on soft-delete tables
- Seed script populates all tables with valid FK relationships
- `PrismaClient` importable from `@crm/database` in API app
- Prisma Studio shows all tables with seed data

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| BIGINT serialization in JSON | Medium | Use Prisma's `BigInt` → `String` serialization, test in API responses |
| Enum migration lock-in | Low | Only use enums for truly stable status values |
| JSONB over-indexing perf | Low | GIN index only on frequently queried JSONB cols |
| Seed script FK ordering | Low | Seed in dependency order: departments → levels → users → customers → leads |
| Soft delete cascade unclear | Medium | Block delete of dept with active users. Add CHECK in service layer, not DB constraint |
