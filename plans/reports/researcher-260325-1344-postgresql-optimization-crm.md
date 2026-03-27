# PostgreSQL Design & Optimization for CRM System
**Report Date:** 2026-03-25
**Research Focus:** Schema design, indexing, query optimization, and Prisma integration
**Scale Context:** 50-200 users, tens of thousands leads/month

---

## Executive Summary

For a CRM system at this scale (50-200 users, ~10K leads/month), PostgreSQL offers several critical design decisions that impact performance, maintainability, and scalability. Key recommendations:

- **UUID primary keys** acceptable but **BIGINT with IDENTITY** preferable for performance at this scale
- **JSONB + GIN indexes** for flexible fields — use strategically, not for every field
- **Polymorphic pattern via entity_type/entity_id** is viable; consider separate tables for high-query-volume entities
- **Soft deletes via timestamp** (deleted_at) for CRM data retention; use partial indexes
- **Prisma ORM** handles most patterns well; use raw queries selectively for analytics
- **Composite + partial indexes** critical for lead/customer filtering queries
- **Cursor-based pagination** for efficient list queries over 1000s of records

---

## 1. PRIMARY KEY STRATEGY: UUID vs BIGINT

### Context
CRM scale (millions of records eventually, ~50-200 active users) benefits from sequential IDs more than distributed systems do.

### UUID Approach

**Pros:**
- Globally unique across systems (useful if multi-tenant planned)
- No coordination needed during inserts
- Privacy (non-sequential IDs)
- Can generate client-side

**Cons:**
- 16 bytes vs 8 bytes (BIGINT) — increases index size and memory pressure
- Random distribution causes **index fragmentation** and **slower page lookups**
- Poor cache locality; UUID index lookups ~10% slower than BIGINT
- Slower than sequential IDs in writes due to random B-tree insertion points

### BIGINT + IDENTITY (RECOMMENDED for CRM)

**Decision:** Use `BIGINT` with `GENERATED ALWAYS AS IDENTITY`

**Pros:**
- 8 bytes — smaller indexes, better memory usage
- Sequential insertion — optimal B-tree performance, minimal fragmentation
- Better cache locality, ~10-15% faster range queries
- At 10K leads/month, reaches max BIGINT (9.2e18) in ~27 billion years
- Default in most ORMs; no special handling

**Cons:**
- Slightly less privacy (sequential)
- Coordination needed if multi-database replication (minor issue here)

### Prisma Schema Pattern

```prisma
model Lead {
  id        BigInt     @id @default(autoincrement())
  createdAt DateTime   @default(now())
  updatedAt DateTime   @updatedAt
  deletedAt DateTime?  // soft delete

  phone     String?
  email     String?
  name      String
  // ... rest of fields

  @@index([deletedAt])  // for soft delete queries
  @@index([createdAt])  // for date range queries
}
```

### Recommendation
**Use BIGINT with GENERATED ALWAYS AS IDENTITY.** UUID is over-engineered for this CRM. If you anticipate multi-tenant or distributed future, revisit when that becomes requirement (YAGNI).

---

## 2. JSONB FLEXIBLE FIELDS

### When to Use JSONB

**Use JSONB for:**
- Customer custom fields that vary by business rules
- Dynamic metadata (tags, labels, custom attributes)
- Activity timeline payloads (flexible data structures)
- Feature flags or configuration per record

**Don't use JSONB for:**
- Phone, email, name (queryable, searchable core fields)
- Status, type enums (use native PG enum or lookup table)
- Foreign keys (use relation columns)

### Schema Example

```prisma
model Customer {
  id              BigInt   @id @default(autoincrement())
  phone           String?  @db.VarChar(20)
  email           String?
  name            String

  // Flexible custom fields
  customData      Json     @default("{}") // JSONB in PG

  // Activity/history (flexible structure)
  metadata        Json     @default("{}")

  @@index([phone])
  @@index([email])
  @@fulltext([name, phone, email]) // PostgreSQL full-text search
}
```

### JSONB Indexing Strategy

**GIN Index (Generalized Inverted Index)** for JSONB:
- Use for existence checks: `customData ? 'company'`
- Use for contains: `customData @> '{"status":"VIP"}'`
- Cost: slower writes (+5-10%), faster reads on filtered queries

```sql
-- Add GIN index on JSONB column
CREATE INDEX idx_customer_custom_data_gin ON "Customer" USING GIN (customData);

-- Partial GIN index if only some records have specific fields
CREATE INDEX idx_customer_custom_vip ON "Customer" USING GIN (customData)
WHERE customData ? 'vipStatus';
```

**When to add GIN:**
- If querying JSONB field in >50% of queries
- After profiling shows JSONB filtering as bottleneck
- For activity timeline if filtering by event type is common

**Prisma + Raw Query for JSONB:**
```typescript
const vipCustomers = await prisma.$queryRaw`
  SELECT * FROM "Customer"
  WHERE "customData" @> '{"status":"VIP"}'
  AND "deletedAt" IS NULL
`;
```

### JSONB Size Consideration
- Each JSONB column adds 1-2KB overhead per record
- For 100K customers: ~100-200MB additional storage
- At this scale, acceptable. Monitor if exceeds 1MB per record.

### Recommendation
- Use JSONB for custom fields (2-3 columns max)
- Add GIN indexes only after profiling shows need
- Keep JSONB payloads under 10KB per record
- Document JSONB field schemas (critical for maintainability)

---

## 3. POLYMORPHIC ASSOCIATIONS: ACTIVITY TIMELINE

### The Challenge
Activity timeline needs to track: Lead created, Customer updated, Order placed, Payment received, Call logged — different entity types.

### Option A: Single Table Polymorphism (RECOMMENDED)

**Pattern:** `entity_type` + `entity_id` columns

```prisma
model Activity {
  id           BigInt    @id @default(autoincrement())
  createdAt    DateTime  @default(now())

  entityType   String    // "lead", "customer", "order", "payment", "call"
  entityId     BigInt    // polymorphic foreign key

  actionType   String    // "created", "updated", "assigned", "called"
  description  String

  actorId      BigInt    @relation("ActivityActor", fields: [actorId], references: [id])
  actor        User      @relation("ActivityActor")

  metadata     Json      @default("{}")

  @@index([entityType, entityId, createdAt])
  @@index([actorId, createdAt])
  @@index([entityType, createdAt]) // for timeline views
}

model User {
  id          BigInt     @id @default(autoincrement())
  activities  Activity[] @relation("ActivityActor")
}
```

**Pros:**
- Single table, simple queries
- Flexible — add new entity types without schema changes
- JSONB metadata handles variant fields

**Cons:**
- No referential integrity (entity_id can point to deleted records)
- Queries slower if filtering by specific entity type (needs full scan)
- Can't use JOIN to entity details directly

**Query Example:**
```typescript
// Get activity timeline for a lead
const timeline = await prisma.activity.findMany({
  where: {
    entityType: 'lead',
    entityId: leadId,
    deletedAt: null,
  },
  orderBy: { createdAt: 'desc' },
  take: 50,
});
```

### Option B: Separate Tables per Entity Type

```prisma
model LeadActivity {
  id        BigInt @id @default(autoincrement())
  leadId    BigInt @relation(fields: [leadId], references: [id], onDelete: Cascade)
  lead      Lead
  actionType String
  // ...
}

model CustomerActivity {
  id          BigInt @id @default(autoincrement())
  customerId  BigInt @relation(fields: [customerId], references: [id], onDelete: Cascade)
  customer    Customer
  actionType  String
  // ...
}
```

**Pros:**
- Strong referential integrity
- Faster queries (no type filtering)
- Can add entity-specific fields

**Cons:**
- Schema duplication
- Harder to query "all activities across entities"
- More migration burden adding new entity types

### Recommendation
**Use Option A (Single Table Polymorphism)** for your CRM:
- Activity timeline is mostly read-only (high writes, but mostly inserts)
- You need cross-entity activity feed (dashboard, audit trail)
- Future entity types unknown — JSONB flexibility important

Add this index for most common queries:
```sql
CREATE INDEX idx_activity_entity_timeline ON "Activity"(entityType, entityId, createdAt DESC)
WHERE "deletedAt" IS NULL;
```

---

## 4. ENUM HANDLING: NATIVE PG vs PRISMA STRING

### Option A: Native PostgreSQL Enum Type

```prisma
enum LeadStatus {
  NEW
  CONTACTED
  QUALIFIED
  UNQUALIFIED
  CONVERTED
}

model Lead {
  id     BigInt     @id @default(autoincrement())
  status LeadStatus @default(NEW)
}
```

**Pros:**
- Type safety at database level
- Storage: 1 byte (vs 10+ bytes for VARCHAR)
- Query optimizer understands enums
- Prevents invalid states

**Cons:**
- Enum changes require ALTER TYPE (complex migrations)
- Adding value takes exclusive table lock (~100ms on small table)
- Dropping value requires careful migration
- Less flexible if values change frequently

### Option B: String Enum (with CHECK constraint)

```prisma
model Lead {
  id     BigInt  @id @default(autoincrement())
  status String  @db.VarChar(20) @default("NEW")

  @@index([status])
}
```

With database check:
```sql
ALTER TABLE "Lead" ADD CONSTRAINT check_lead_status
CHECK (status IN ('NEW', 'CONTACTED', 'QUALIFIED', 'UNQUALIFIED', 'CONVERTED'));
```

**Pros:**
- Flexible — add values without locks
- Prisma native support
- Easier migrations

**Cons:**
- Slightly larger storage (10+ bytes per enum field)
- Less type safety
- CHECK constraint less efficient than native enum

### Option C: Lookup Table (Multi-tenant Pattern)

```prisma
model LeadStatusEnum {
  id    BigInt  @id @default(autoincrement())
  value String  @unique
  label String
}

model Lead {
  id            BigInt @id @default(autoincrement())
  statusId      BigInt @relation(fields: [statusId], references: [id])
  status        LeadStatusEnum
}
```

**Pros:**
- Multi-tenant support (status varies by workspace)
- Queryable from app (show labels)
- Flexible

**Cons:**
- Extra JOIN for every query
- Slower than native enum (~5% overhead)
- Over-engineered for single-tenant

### Recommendation
**Use Native PostgreSQL Enum** for core CRM fields (lead status, order status, payment status):
- Status values stable after initial design
- Performance matters (millions of rows)
- Type safety critical

```prisma
enum LeadStatus {
  NEW
  CONTACTED
  QUALIFIED
  UNQUALIFIED
  CONVERTED
}

enum OrderStatus {
  DRAFT
  CONFIRMED
  SHIPPED
  DELIVERED
  CANCELLED
}

enum PaymentStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  REFUNDED
}
```

---

## 5. SOFT DELETE vs HARD DELETE STRATEGY

### Context
CRM data (leads, customers, orders) often must be retained for compliance, audit, and recovery.

### Soft Delete Pattern (RECOMMENDED for CRM)

```prisma
model Lead {
  id        BigInt    @id @default(autoincrement())
  name      String
  email     String?
  phone     String?

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime? // null = active, timestamp = deleted

  @@index([deletedAt])
  @@index([email])
  @@uniqueConstraint([email, deletedAt]) // allows same email if one is deleted
}

model Customer {
  id        BigInt    @id @default(autoincrement())
  leadId    BigInt?   @relation(fields: [leadId], references: [id])
  lead      Lead?

  name      String
  createdAt DateTime  @default(now())
  deletedAt DateTime?

  @@index([deletedAt])
}
```

**Indexes for Soft Delete:**
```sql
-- Partial index: only active records (most queries)
CREATE INDEX idx_lead_active ON "Lead"(id) WHERE "deletedAt" IS NULL;

-- Partial index: search active leads by email
CREATE INDEX idx_lead_email_active ON "Lead"(email)
WHERE "deletedAt" IS NULL AND email IS NOT NULL;

-- For deleted records queries
CREATE INDEX idx_lead_deleted ON "Lead"("deletedAt")
WHERE "deletedAt" IS NOT NULL;
```

**Prisma Query Helpers:**
```typescript
// Create a helper for "soft delete awareness"
const leadsRepo = {
  findActive: (where) => prisma.lead.findMany({
    where: { ...where, deletedAt: null },
  }),

  findAll: (where) => prisma.lead.findMany({
    where, // includes deleted
  }),

  softDelete: (id) => prisma.lead.update({
    where: { id },
    data: { deletedAt: new Date() },
  }),

  hardDelete: (id) => prisma.lead.delete({
    where: { id },
  }),
};
```

**Unique Constraint Handling:**
```prisma
model Lead {
  email String?

  // Allow duplicate email if one is soft-deleted
  @@unique([email, deletedAt])
  @@index([deletedAt])
}
```

### Hard Delete Pattern (when NOT to use)

Only use hard delete for:
- Temporary/draft data (never queried after deletion)
- PII cleanup (GDPR right to be forgotten)
- Spam/test records

### Soft Delete Maintenance

For old deleted records (>1 year):
```sql
-- Archive to separate table (optional)
INSERT INTO archive.lead_history
SELECT * FROM "Lead" WHERE "deletedAt" < NOW() - INTERVAL '1 year';

-- Permanently delete from main table
DELETE FROM "Lead" WHERE "deletedAt" < NOW() - INTERVAL '1 year';
```

### Recommendation
- **Use soft delete (deleted_at timestamp) for all CRM entities:** Lead, Customer, Order, Payment, Call
- **Add partial indexes** for active records (WHERE deleted_at IS NULL)
- **Create repository/service layer** to enforce soft-delete-awareness
- **Schedule monthly cleanup** of records older than 1 year (move to archive table or delete)

---

## 6. TIMESTAMP PATTERNS WITH PRISMA

### Standard Pattern

```prisma
model Lead {
  id        BigInt    @id @default(autoincrement())

  // Managed by Prisma
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  // Manual management
  deletedAt DateTime?

  // Domain timestamps
  lastContactedAt DateTime?
  nextFollowUpAt  DateTime?
  convertedAt     DateTime?
}
```

### Timezone Handling

PostgreSQL stores `TIMESTAMP` in UTC internally. Prisma handles conversion to JS `Date`.

```typescript
// JS Date is always UTC
const lead = await prisma.lead.create({
  data: {
    name: 'John Doe',
    createdAt: new Date(), // automatically UTC
  },
});

// For user timezone display: handle in API response/view layer
const formatForUser = (date: Date, timezone: string) => {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
};
```

### Query by Timestamp Ranges

```typescript
// Leads created in last 7 days
const recentLeads = await prisma.lead.findMany({
  where: {
    deletedAt: null,
    createdAt: {
      gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
  },
});

// Orders this month
const thisMonth = new Date();
const nextMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth() + 1);

const monthlyOrders = await prisma.order.findMany({
  where: {
    createdAt: {
      gte: new Date(thisMonth.getFullYear(), thisMonth.getMonth(), 1),
      lt: nextMonth,
    },
  },
});
```

### Index Strategy for Timestamps

```sql
-- Range queries on createdAt
CREATE INDEX idx_lead_created_at ON "Lead"("createdAt" DESC);

-- Soft delete awareness
CREATE INDEX idx_lead_created_active ON "Lead"("createdAt" DESC)
WHERE "deletedAt" IS NULL;

-- for "last contacted" queries
CREATE INDEX idx_lead_last_contacted ON "Lead"("lastContactedAt" DESC)
WHERE "lastContactedAt" IS NOT NULL AND "deletedAt" IS NULL;

-- for "next follow-up" queries (used by scheduled tasks)
CREATE INDEX idx_lead_next_followup ON "Lead"("nextFollowUpAt")
WHERE "nextFollowUpAt" IS NOT NULL AND "deletedAt" IS NULL;
```

### Recommendation
- Use standard Prisma `@default(now())` and `@updatedAt`
- Always store in UTC (PostgreSQL default)
- Handle timezone conversion in application/API layer
- Index timestamp columns used in WHERE clauses
- Use `DESC` for most-recent-first sorting

---

## 7. MULTI-TENANT CONSIDERATIONS (IF NEEDED LATER)

### Current: Single Tenant
No multi-tenant column needed if this CRM is single-workspace. Skip this section initially.

### Future: Multi-Tenant Readiness

If you plan multi-tenant (SaaS CRM):

```prisma
model Workspace {
  id        BigInt    @id @default(autoincrement())
  name      String
  createdAt DateTime  @default(now())
}

model User {
  id          BigInt   @id @default(autoincrement())
  workspaceId BigInt   @relation(fields: [workspaceId], references: [id])
  workspace   Workspace
  email       String

  @@unique([workspaceId, email])
}

model Lead {
  id          BigInt   @id @default(autoincrement())
  workspaceId BigInt   @relation(fields: [workspaceId], references: [id])
  workspace   Workspace

  name        String
  createdAt   DateTime @default(now())
  deletedAt   DateTime?

  @@index([workspaceId, deletedAt, createdAt])
  @@index([workspaceId, email]) // multi-tenant email uniqueness

  @@unique([workspaceId, email, deletedAt])
}
```

**Index Strategy:**
- Prefix all indexes with `workspaceId` (partition queries by tenant)
- Prevents cross-tenant data leaks
- Improves locality (data for one tenant in fewer pages)

**Row-Level Security (RLS):**
- PostgreSQL RLS enforces tenant isolation at database level
- With Prisma: RLS is secondary layer (application layer should also check)
- Setup cost: moderate; maintenance cost: low

```sql
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;

CREATE POLICY lead_isolation ON "Lead"
  USING ("workspaceId" = current_setting('app.workspace_id')::bigint);
```

### Recommendation
**For now: skip multi-tenant.** If needed later, add `workspaceId` to all tables and rebuild indexes. Cost is ~3-5 days.

---

## 8. INDEXING STRATEGY FOR CRM QUERIES

### Common CRM Query Patterns

**Pattern 1: Lead Search**
```sql
SELECT * FROM "Lead"
WHERE "deletedAt" IS NULL
  AND ("email" ILIKE $1 OR "phone" ILIKE $2 OR "name" ILIKE $3)
ORDER BY "createdAt" DESC
LIMIT 50;
```

**Pattern 2: Lead Filtering**
```sql
SELECT * FROM "Lead"
WHERE "deletedAt" IS NULL
  AND "status" = $1
  AND "assignedTo" = $2
  AND "createdAt" > NOW() - INTERVAL '30 days'
ORDER BY "createdAt" DESC;
```

**Pattern 3: Activity Timeline**
```sql
SELECT * FROM "Activity"
WHERE "entityType" = $1
  AND "entityId" = $2
  AND "deletedAt" IS NULL
ORDER BY "createdAt" DESC
LIMIT 100;
```

### Index Recommendations

```sql
-- 1. Lead table indexes
CREATE INDEX idx_lead_email_active ON "Lead"(email)
WHERE "deletedAt" IS NULL;

CREATE INDEX idx_lead_phone_active ON "Lead"(phone)
WHERE "deletedAt" IS NULL;

-- Composite index for status + assignment + date filtering
CREATE INDEX idx_lead_filter ON "Lead"("status", "assignedTo", "createdAt" DESC)
WHERE "deletedAt" IS NULL;

-- For full-text search (if name/email search common)
CREATE INDEX idx_lead_search ON "Lead" USING GIN(
  to_tsvector('english', COALESCE("name", '') || ' ' || COALESCE("email", ''))
) WHERE "deletedAt" IS NULL;

-- 2. Customer table indexes
CREATE INDEX idx_customer_email_active ON "Customer"(email)
WHERE "deletedAt" IS NULL;

CREATE INDEX idx_customer_created ON "Customer"("createdAt" DESC)
WHERE "deletedAt" IS NULL;

-- 3. Order table indexes
CREATE INDEX idx_order_customer ON "Order"("customerId", "createdAt" DESC)
WHERE "deletedAt" IS NULL;

CREATE INDEX idx_order_status ON "Order"("status", "customerId")
WHERE "deletedAt" IS NULL;

-- 4. Payment table indexes
CREATE INDEX idx_payment_order ON "Payment"("orderId", "createdAt" DESC);
CREATE INDEX idx_payment_status ON "Payment"("status")
WHERE "status" != 'COMPLETED';

-- 5. Activity/Call logs
CREATE INDEX idx_activity_timeline ON "Activity"("entityType", "entityId", "createdAt" DESC)
WHERE "deletedAt" IS NULL;

CREATE INDEX idx_call_log_date ON "CallLog"("phoneNumber", "createdAt" DESC)
WHERE "deletedAt" IS NULL;
```

### GIN Index for Full-Text Search

```sql
-- For searching leads across name, email, phone
CREATE INDEX idx_lead_fulltext ON "Lead" USING GIN(
  to_tsvector('english', COALESCE("name", '') || ' ' || COALESCE("email", ''))
) WHERE "deletedAt" IS NULL;
```

**Prisma Query:**
```typescript
const searchLeads = await prisma.$queryRaw`
  SELECT * FROM "Lead"
  WHERE to_tsvector('english', COALESCE("name", '') || ' ' || COALESCE("email", ''))
    @@ plainto_tsquery('english', $1)
    AND "deletedAt" IS NULL
  ORDER BY "createdAt" DESC
  LIMIT 50
`;
```

### Index Size & Maintenance

For 100K leads with 10+ indexes:
- Total index size: ~500MB-1GB
- Index maintenance: automatic (auto-VACUUM)
- Rebuild needed if: index bloat >30% (monitor with `pgstattuple`)

### Recommendation
- **Add indexes incrementally** after profiling
- **Monitor query plans** with `EXPLAIN ANALYZE` before/after
- **Start with:** email, phone, status, created_at, deleted_at filters
- **Add GIN** for full-text search once search feature used
- **Revisit after 6 months** of production usage

---

## 9. QUERY OPTIMIZATION: PAGINATION & AGGREGATION

### Cursor-Based Pagination (RECOMMENDED)

For lists with 1000s of records, offset-based pagination is O(n) — cursor-based is O(1).

```typescript
// Cursor-based: efficient
const leads = await prisma.lead.findMany({
  where: { deletedAt: null },
  orderBy: { id: 'desc' },
  take: 50,
  skip: cursor ? 1 : 0, // skip the cursor itself
  cursor: cursor ? { id: cursor } : undefined,
});

// Get next page cursor
const nextCursor = leads.length > 0 ? leads[leads.length - 1].id : null;
```

**vs Offset-Based (avoid for large datasets):**
```typescript
// Offset-based: slow for high page numbers
// O(n) — PostgreSQL must scan and skip all previous rows
const leads = await prisma.lead.findMany({
  where: { deletedAt: null },
  skip: (page - 1) * pageSize, // SLOW if page is large
  take: pageSize,
});
```

**Cursor Pagination Implementation:**
```typescript
interface PaginationParams {
  cursor?: BigInt;
  limit: number;
}

const paginateLeads = async (params: PaginationParams) => {
  const leads = await prisma.lead.findMany({
    where: { deletedAt: null, status: 'NEW' },
    orderBy: { id: 'desc' },
    take: params.limit + 1, // fetch one extra to detect hasMore
    ...(params.cursor && {
      skip: 1,
      cursor: { id: params.cursor },
    }),
  });

  const hasMore = leads.length > params.limit;
  const data = hasMore ? leads.slice(0, -1) : leads;
  const nextCursor = hasMore ? data[data.length - 1]?.id : null;

  return { data, nextCursor, hasMore };
};
```

### Aggregation Queries: Real-Time vs Materialized

**Real-Time Aggregation (< 100K records):**
```typescript
// Count leads by status
const leadsByStatus = await prisma.lead.groupBy({
  by: ['status'],
  where: { deletedAt: null },
  _count: { id: true },
});

// Sales funnel: leads -> customers -> orders -> payments
const funnel = await prisma.$queryRaw`
  SELECT
    COUNT(DISTINCT l.id) as leads,
    COUNT(DISTINCT c.id) as customers,
    COUNT(DISTINCT o.id) as orders,
    COUNT(DISTINCT p.id) as completed_payments
  FROM "Lead" l
  LEFT JOIN "Customer" c ON c."leadId" = l.id AND c."deletedAt" IS NULL
  LEFT JOIN "Order" o ON o."customerId" = c.id AND o."deletedAt" IS NULL
  LEFT JOIN "Payment" p ON p."orderId" = o.id AND p."status" = 'COMPLETED'
  WHERE l."deletedAt" IS NULL
    AND l."createdAt" > NOW() - INTERVAL '30 days'
`;
```

**Materialized View (if aggregations run hourly):**
```sql
CREATE MATERIALIZED VIEW crm_analytics_daily AS
SELECT
  DATE(l."createdAt") as date,
  COUNT(DISTINCT l.id) as leads_created,
  COUNT(DISTINCT CASE WHEN c.id IS NOT NULL THEN c.id END) as leads_converted,
  COUNT(DISTINCT o.id) as orders_placed,
  COALESCE(SUM(p."amount"), 0) as revenue
FROM "Lead" l
LEFT JOIN "Customer" c ON c."leadId" = l.id AND c."deletedAt" IS NULL
LEFT JOIN "Order" o ON o."customerId" = c.id AND o."deletedAt" IS NULL
LEFT JOIN "Payment" p ON p."orderId" = o.id AND p."status" = 'COMPLETED'
WHERE l."deletedAt" IS NULL
GROUP BY DATE(l."createdAt");

-- Index on materialized view
CREATE INDEX idx_analytics_daily_date ON crm_analytics_daily(date DESC);

-- Refresh schedule
REFRESH MATERIALIZED VIEW CONCURRENTLY crm_analytics_daily;
```

### Window Functions for Ranking

```sql
-- Top leads by engagement (calls + activities)
SELECT
  l.id,
  l.name,
  COUNT(cl.id) as call_count,
  ROW_NUMBER() OVER (ORDER BY COUNT(cl.id) DESC) as engagement_rank
FROM "Lead" l
LEFT JOIN "CallLog" cl ON cl."leadId" = l.id AND cl."deletedAt" IS NULL
WHERE l."deletedAt" IS NULL
GROUP BY l.id, l.name
LIMIT 100;

-- Monthly revenue trend
SELECT
  DATE_TRUNC('month', p."createdAt") as month,
  SUM(p."amount") as revenue,
  LAG(SUM(p."amount")) OVER (ORDER BY DATE_TRUNC('month', p."createdAt"))
    as prev_month_revenue
FROM "Payment" p
WHERE p."status" = 'COMPLETED'
GROUP BY DATE_TRUNC('month', p."createdAt")
ORDER BY month DESC;
```

### Recommendation
- **Use cursor-based pagination** for all list endpoints
- **Real-time aggregation** for < 100K records
- **Materialized views** for dashboard metrics (refresh nightly)
- **Window functions** for ranking/trends (efficient in PG)

---

## 10. FULL-TEXT SEARCH

### PostgreSQL Built-in Full-Text Search

```sql
-- Create GIN index for fast text search
CREATE INDEX idx_lead_search ON "Lead" USING GIN(
  to_tsvector('english', COALESCE("name", '') || ' ' || COALESCE("email", '') || ' ' || COALESCE("phone", ''))
) WHERE "deletedAt" IS NULL;
```

**Query:**
```typescript
const searchResults = await prisma.$queryRaw`
  SELECT id, name, email, phone,
    ts_rank(
      to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(email, '')),
      plainto_tsquery('english', $1)
    ) as relevance
  FROM "Lead"
  WHERE to_tsvector('english', COALESCE(name, '') || ' ' || COALESCE(email, '') || ' ' || COALESCE(phone, ''))
    @@ plainto_tsquery('english', $1)
    AND "deletedAt" IS NULL
  ORDER BY relevance DESC
  LIMIT 50
`;
```

### Recommendation
- **Use PostgreSQL full-text search** for name/email/phone search
- **Add GIN index** once search feature is active
- **Avoid Elasticsearch** until you need faceted search (overkill for CRM at this scale)

---

## 11. BULK OPERATIONS & CSV IMPORT

### Bulk Insert Optimization

**Option A: Prisma createMany (slower, ~10K/sec)**
```typescript
const leads = [...]; // 50K leads from CSV

const result = await prisma.lead.createMany({
  data: leads,
  skipDuplicates: true, // ignore unique constraint violations
});
```

**Option B: Raw COPY (faster, ~100K/sec)**
```typescript
import { copyFrom } from 'pg-copy-streams';
import fs from 'fs';

const stream = fs.createReadStream('leads.csv');
const pgStream = copyFrom(`COPY "Lead"(name, email, phone) FROM STDIN WITH (FORMAT csv, HEADER true)`);

stream.pipe(pgStream).on('finish', () => console.log('Import complete'));
```

**Option C: Batched inserts with ON CONFLICT (good balance)**
```typescript
const leads = [...]; // 50K leads
const batchSize = 5000;

for (let i = 0; i < leads.length; i += batchSize) {
  const batch = leads.slice(i, i + batchSize);

  await prisma.$executeRaw`
    INSERT INTO "Lead" (name, email, phone, "createdAt", "deletedAt")
    VALUES ${Prisma.raw(batch.map(l => `(${sql}, ${sql}, ${sql}, NOW(), NULL)`).join(','))}
    ON CONFLICT (email) WHERE "deletedAt" IS NULL
      DO UPDATE SET "updatedAt" = NOW()
  `;
}
```

### Handling Duplicates

```sql
-- Insert, update if email exists and not deleted
INSERT INTO "Lead" (email, name, phone, "createdAt")
VALUES
  ('john@example.com', 'John Doe', '555-1234', NOW()),
  ('jane@example.com', 'Jane Smith', '555-5678', NOW())
ON CONFLICT (email) WHERE "deletedAt" IS NULL
  DO UPDATE SET
    name = EXCLUDED.name,
    phone = EXCLUDED.phone,
    "updatedAt" = NOW();
```

### Recommendation
- **Batched inserts (5K per batch)** for CSV import from Prisma
- **Raw COPY** if importing > 100K records (10x faster)
- **ON CONFLICT** to handle duplicate emails gracefully
- **Transaction wrapper** for atomicity

---

## 12. PRISMA-SPECIFIC PATTERNS

### Efficient Relations (select/include)

```typescript
// ❌ AVOID: N+1 query problem
const leads = await prisma.lead.findMany();
for (const lead of leads) {
  const customer = await prisma.customer.findFirst({
    where: { leadId: lead.id },
  }); // 1 + N queries!
}

// ✅ GOOD: Include relations
const leads = await prisma.lead.findMany({
  include: { customer: true },
});

// ✅ BETTER: Select only needed fields
const leads = await prisma.lead.findMany({
  select: {
    id: true,
    name: true,
    email: true,
    customer: {
      select: { id: true, name: true },
    },
  },
});
```

### Raw Queries for Complex Analytics

```typescript
// Complex aggregation - use raw query
const dashboard = await prisma.$queryRaw`
  SELECT
    COUNT(DISTINCT l.id) as total_leads,
    COUNT(DISTINCT c.id) as total_customers,
    SUM(CASE WHEN o.id IS NOT NULL THEN 1 ELSE 0 END) as total_orders,
    COALESCE(SUM(p."amount"), 0) as total_revenue
  FROM "Lead" l
  LEFT JOIN "Customer" c ON c."leadId" = l.id AND c."deletedAt" IS NULL
  LEFT JOIN "Order" o ON o."customerId" = c.id AND o."deletedAt" IS NULL
  LEFT JOIN "Payment" p ON p."orderId" = o.id AND p."status" = 'COMPLETED'
  WHERE l."createdAt" > NOW() - INTERVAL '30 days'
`;
```

### Transactions for Multi-Entity Operations

```typescript
// Create lead + customer + activity in single transaction
const result = await prisma.$transaction(async (tx) => {
  const lead = await tx.lead.create({
    data: { name: 'John', email: 'john@example.com' },
  });

  const customer = await tx.customer.create({
    data: { leadId: lead.id, name: 'John' },
  });

  const activity = await tx.activity.create({
    data: {
      entityType: 'lead',
      entityId: lead.id,
      actionType: 'created',
      actorId: userId,
    },
  });

  return { lead, customer, activity };
});
```

### Recommendation
- **Always use select/include** to avoid N+1
- **Raw queries** for complex analytics only (not everyday queries)
- **Transactions** for operations touching multiple tables
- **Prisma types** for generated SQL type safety

---

## 13. CONNECTION POOLING: PRISMA + PGBOUNCER

### Current Setup (Development)

```env
# .env
DATABASE_URL=postgresql://user:password@localhost:5432/crm_dev
```

### Production Setup with PgBouncer

PgBouncer sits between Prisma and PostgreSQL, pooling connections.

```ini
# /etc/pgbouncer/pgbouncer.ini
[databases]
crm_prod = host=localhost port=5432 dbname=crm_prod

[pgbouncer]
pool_mode = transaction  # transaction-level pooling
max_client_conn = 1000
default_pool_size = 25   # 5-10 per core typically
min_pool_size = 10
reserve_pool_size = 5
reserve_pool_timeout = 3
```

**Prisma Configuration:**
```env
# Point to PgBouncer, not PostgreSQL directly
DATABASE_URL=postgresql://user:password@localhost:6432/crm_prod
```

### Why PgBouncer?
- Prisma creates connection per request (expensive)
- PgBouncer reuses connections at transaction level
- Reduces connection overhead ~90%
- For 100 concurrent users: 100+ connections → ~30 pooled

### Monitoring

```sql
-- Check connection count
SELECT datname, count(*) as connections
FROM pg_stat_activity
GROUP BY datname;

-- If > 200 connections: pool size too small or memory leak
```

### Recommendation
- **Development:** skip PgBouncer (use Prisma directly)
- **Production:** deploy PgBouncer with transaction-level pooling
- **Monitor:** alert if connections > 50% of max

---

## 14. ROW-LEVEL SECURITY (RLS)

### When to Use RLS

RLS enforces row-level access at database, not application. **Only use if:**
- Multi-tenant (different users access different rows)
- Compliance requirement (GDPR, healthcare)
- Application-level auth is untrusted

**For a single-tenant CRM:** RLS is **not necessary** — skip it.

### If Multi-Tenant (Future)

```sql
-- Enable RLS
ALTER TABLE "Lead" ENABLE ROW LEVEL SECURITY;

-- Create policy: users only see leads in their workspace
CREATE POLICY lead_workspace_policy ON "Lead"
  USING ("workspaceId" = current_setting('app.workspace_id')::bigint)
  WITH CHECK ("workspaceId" = current_setting('app.workspace_id')::bigint);
```

**Set in Prisma:**
```typescript
await prisma.$executeRaw`
  SET app.workspace_id = $1
`;
```

### Performance Implication
- RLS adds ~5-10% query overhead (plans per user+table)
- Caching helps but complex

### Recommendation
- **For single-tenant:** skip RLS. Enforce in application layer.
- **For multi-tenant future:** add RLS at that time (not now — YAGNI)

---

## 15. DATA ENCRYPTION FOR SENSITIVE FIELDS

### Transparent Column Encryption (pgcrypto)

For phone, email, SSN:

```sql
-- Create encrypted column
ALTER TABLE "Lead" ADD COLUMN phone_encrypted bytea;

-- Encrypt existing data
UPDATE "Lead" SET phone_encrypted = pgp_sym_encrypt(phone, 'secret_key');

-- Create function for transparent access
CREATE OR REPLACE FUNCTION decrypt_phone(encrypted bytea)
RETURNS text AS $$
  SELECT pgp_sym_decrypt(encrypted, 'secret_key')
$$ LANGUAGE SQL STABLE;
```

**Prisma (use raw query):**
```typescript
const lead = await prisma.$queryRaw`
  SELECT id, name, pgp_sym_decrypt("phoneEncrypted", $1) as phone
  FROM "Lead"
  WHERE id = $2
`;
```

### Application-Level Encryption

Better for Prisma — encrypt before insert:

```typescript
import crypto from 'crypto';

const encryptPhone = (phone: string, key: string) => {
  const cipher = crypto.createCipher('aes-256-cbc', key);
  return cipher.update(phone, 'utf8', 'hex') + cipher.final('hex');
};

const lead = await prisma.lead.create({
  data: {
    name: 'John',
    phoneEncrypted: encryptPhone('555-1234', process.env.ENCRYPTION_KEY!),
  },
});
```

### Recommendation
- **Don't encrypt emails** (used for uniqueness indexes)
- **Encrypt phone numbers** if GDPR/compliance required
- **Use application-level encryption** (easier with Prisma)
- **Manage keys** via AWS Secrets Manager or similar

---

## 16. AUDIT TRAIL IMPLEMENTATION

### Simple Audit Pattern

```prisma
model AuditLog {
  id        BigInt    @id @default(autoincrement())

  // Entity being changed
  entityType String   // "lead", "customer", "order"
  entityId   BigInt

  // Who changed it
  userId     BigInt    @relation(fields: [userId], references: [id])
  user       User

  // What changed
  action     String    // "create", "update", "delete"
  oldValues  Json      // before
  newValues  Json      // after

  timestamp  DateTime  @default(now())

  @@index([entityType, entityId, timestamp])
  @@index([userId, timestamp])
}
```

**Trigger-Based Audit (automatic):**
```sql
CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(50),
  entity_id BIGINT,
  user_id BIGINT,
  action VARCHAR(20),
  old_values JSONB,
  new_values JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION audit_lead_changes()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (entity_type, entity_id, action, old_values, new_values)
  VALUES ('lead', NEW.id, TG_OP, row_to_json(OLD), row_to_json(NEW));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lead_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON "Lead"
FOR EACH ROW EXECUTE FUNCTION audit_lead_changes();
```

### Recommendation
- **Use activity timeline** for user-visible audit (what happened)
- **Use audit_log** for compliance (who changed what when)
- **Triggers** for automatic capture (less manual code)
- **Separate table** to avoid bloat on main tables

---

## 17. MIGRATION STRATEGY WITH PRISMA

### Initial Schema

```bash
npx prisma migrate dev --name init
```

### Adding New Fields

```prisma
model Lead {
  // ... existing fields
  internalNotes String? // new field
}
```

```bash
npx prisma migrate dev --name add_internal_notes
```

Generated migration (safe):
```sql
-- AddInternalNotesToLead
ALTER TABLE "Lead" ADD COLUMN "internalNotes" TEXT;
```

### Handling Large Tables (100K+ rows)

For large tables, `ADD COLUMN` requires lock. Use `NOT NULL` carefully:

```prisma
// ❌ RISKY: NOT NULL on large table blocks writes
internalNotes String // no @default, no nullable

// ✅ SAFE: nullable, backfill later
internalNotes String?

// ✅ BETTER: NOT NULL with default
internalNotes String @default("") // backfill in background
```

### Multi-Step Migration for Large Tables

```sql
-- Step 1: Add nullable column (non-blocking)
ALTER TABLE "Lead" ADD COLUMN "internalNotes" TEXT;

-- Step 2: Backfill in batches (background job)
-- Run separately after deployment
UPDATE "Lead" SET "internalNotes" = ''
WHERE "internalNotes" IS NULL;

-- Step 3: Later, add NOT NULL constraint
ALTER TABLE "Lead" ALTER COLUMN "internalNotes" SET NOT NULL;
```

### Recommendation
- **Always add nullable columns first**
- **Backfill data in separate background job**
- **Add NOT NULL constraints only after backfill**
- **Test migrations on staging** before production

---

## 18. PERFORMANCE MONITORING & PROFILING

### Query Analysis

```sql
-- Explain plan for a query
EXPLAIN ANALYZE
SELECT * FROM "Lead"
WHERE "deletedAt" IS NULL
  AND "status" = 'NEW'
  AND "createdAt" > NOW() - INTERVAL '30 days'
ORDER BY "createdAt" DESC
LIMIT 50;
```

Look for:
- Sequential Scan (bad for large tables) → need index
- Seq Scan on 100K rows → add index
- Bitmap Index Scan (good)
- Index Only Scan (best)

### Monitoring in Production

```sql
-- Slow query detection (> 100ms)
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC;

-- Index size & bloat
SELECT schemaname, tablename, indexname, pg_size_pretty(pg_relation_size(indexrelid)) as size
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Recommendation
- **Profile before optimizing** (EXPLAIN ANALYZE)
- **Index if Sequential Scan on > 10K rows**
- **Monitor slow queries** (> 200ms) in production
- **Rebuild indexes** if bloat > 30% (monthly)

---

## SCHEMA RECOMMENDATIONS SUMMARY

### Lead Table (Core)
```prisma
model Lead {
  id            BigInt      @id @default(autoincrement())

  // Core fields
  name          String
  email         String?
  phone         String?

  // Status & assignment
  status        LeadStatus  @default(NEW)
  assignedTo    BigInt?     @relation("LeadAssigned", fields: [assignedToId], references: [id])

  // Timestamps
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
  deletedAt     DateTime?
  lastContacted DateTime?
  nextFollowUp  DateTime?

  // Flexible fields
  customData    Json        @default("{}")
  tags          String[]    @default([])

  // Relations
  customer      Customer?
  activities    Activity[]
  callLogs      CallLog[]

  // Indexes
  @@unique([email, deletedAt])
  @@index([deletedAt])
  @@index([status, assignedTo, createdAt])
  @@index([email])
  @@index([phone])
  @@index([lastContacted])
}

enum LeadStatus {
  NEW
  CONTACTED
  QUALIFIED
  UNQUALIFIED
  CONVERTED
}
```

### Customer Table
```prisma
model Customer {
  id          BigInt    @id @default(autoincrement())

  leadId      BigInt?   @unique @relation(fields: [leadId], references: [id], onDelete: SetNull)
  lead        Lead?

  name        String
  email       String?
  phone       String?

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  customData  Json      @default("{}")

  orders      Order[]
  activities  Activity[]

  @@index([deletedAt])
  @@index([email])
  @@unique([email, deletedAt])
}
```

### Order & Payment Tables
```prisma
model Order {
  id          BigInt      @id @default(autoincrement())

  customerId  BigInt      @relation(fields: [customerId], references: [id])
  customer    Customer

  status      OrderStatus @default(DRAFT)
  amount      Decimal     @db.Decimal(10, 2)

  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  deletedAt   DateTime?

  payments    Payment[]
  activities  Activity[]

  @@index([customerId, createdAt])
  @@index([status])
  @@index([deletedAt])
}

enum OrderStatus {
  DRAFT
  CONFIRMED
  SHIPPED
  DELIVERED
  CANCELLED
}

model Payment {
  id        BigInt        @id @default(autoincrement())

  orderId   BigInt        @relation(fields: [orderId], references: [id])
  order     Order

  status    PaymentStatus @default(PENDING)
  amount    Decimal       @db.Decimal(10, 2)

  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  @@index([orderId, createdAt])
  @@index([status])
}

enum PaymentStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
  REFUNDED
}
```

### Activity & CallLog Tables
```prisma
model Activity {
  id          BigInt    @id @default(autoincrement())

  entityType  String    // "lead", "customer", "order"
  entityId    BigInt

  actionType  String
  description String

  actorId     BigInt    @relation(fields: [actorId], references: [id])
  actor       User

  metadata    Json      @default("{}")

  createdAt   DateTime  @default(now())
  deletedAt   DateTime?

  @@index([entityType, entityId, createdAt])
  @@index([actorId, createdAt])
  @@index([deletedAt])
}

model CallLog {
  id          BigInt    @id @default(autoincrement())

  leadId      BigInt    @relation(fields: [leadId], references: [id])
  lead        Lead

  phoneNumber String
  duration    Int       // seconds
  notes       String?
  recording   String?   // URL

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  deletedAt   DateTime?

  @@index([leadId, createdAt])
  @@index([phoneNumber, createdAt])
  @@index([deletedAt])
}
```

---

## KEY DECISIONS FOR YOUR CRM

| Decision | Recommendation | Rationale |
|----------|---|---|
| **Primary Key** | BIGINT IDENTITY | Sequential, optimal performance at CRM scale |
| **Flexible Fields** | JSONB (2-3 columns) | Schema flexibility + GIN indexes for queries |
| **Enums** | Native PG enum | Type safety, small storage, stable values |
| **Soft Delete** | deleted_at timestamp + partial indexes | CRM data retention, GDPR-friendly |
| **Polymorphic** | entity_type + entity_id | Activity timeline flexibility |
| **Pagination** | Cursor-based | O(1) performance, no offset scanning |
| **Indexes** | Composite + partial | Status/assignment/date filtering, soft-delete awareness |
| **Aggregations** | Real-time for < 100K rows | Materialized views for dashboards (refresh nightly) |
| **Authentication** | Application layer | Simpler than RLS, sufficient for single-tenant |
| **Connection Pool** | PgBouncer (production) | Reduce connection overhead |

---

## IMPLEMENTATION ROADMAP

### Phase 1: Foundation (Week 1)
- [ ] Set up Prisma schema with Lead, Customer, Order, Payment
- [ ] Implement BIGINT primary keys, soft delete (deleted_at)
- [ ] Add core indexes: email, phone, status, created_at
- [ ] Write initial migrations

### Phase 2: Relations & Activity (Week 2)
- [ ] Implement Activity table (polymorphic pattern)
- [ ] Add CallLog table
- [ ] Set up Prisma relations
- [ ] Create activity logging middleware

### Phase 3: Indexing & Performance (Week 3)
- [ ] Profile queries with EXPLAIN ANALYZE
- [ ] Add composite indexes for common filters
- [ ] Implement cursor-based pagination
- [ ] Performance test with 100K test records

### Phase 4: Advanced Features (Week 4)
- [ ] Implement JSONB custom fields (customData)
- [ ] Add GIN indexes if search queries bottleneck
- [ ] Set up audit trail (Activity table)
- [ ] Full-text search on name/email

### Phase 5: Production Preparation (Week 5)
- [ ] Set up PgBouncer for connection pooling
- [ ] Configure monitoring (pg_stat_statements)
- [ ] Create backup/restore procedures
- [ ] Load testing with concurrent users

---

## UNRESOLVED QUESTIONS

1. **Multi-tenant requirement:** Is this single-tenant forever or future SaaS? (Affects schema design significantly)
2. **Phone number format:** Do you need international numbers? (Affects storage: VARCHAR(20) vs STRING?)
3. **Custom fields frequency:** How often do you add new JSONB fields? (Affects schema vs document DB trade-off)
4. **Search priority:** Is full-text search critical for MVP? (Can defer GIN index to Phase 4)
5. **Audit compliance:** Do you need detailed audit trail for compliance? (Affects Activity schema design)
6. **Encryption requirements:** GDPR-required field encryption? (Affects column design)
7. **Analytics frequency:** Are dashboards real-time or can they be nightly? (Affects materialized view strategy)
8. **Call recording storage:** Where are call recordings stored? (DB or external S3? Affects schema)

---

**Report Generated:** 2026-03-25 at 13:44
**Next Step:** Review with team, clarify unresolved questions, then delegate to planner agent for implementation plan

