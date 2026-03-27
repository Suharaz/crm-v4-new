# Brainstorm: Internal CRM System Design

## Problem Statement

Build internal CRM optimizing for: sales team efficiency, customer data storage, sales performance evaluation, lead quality assessment. Support 50-200 users across multiple departments with flexible lead management pipeline.

## Agreed Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Backend | NestJS | Complex business logic, RBAC, 3rd party API, modular architecture |
| Frontend | Next.js | SSR for dashboards/reports, React ecosystem |
| Database | PostgreSQL | JSONB flexibility, full-text search, proven at scale |
| ORM | Prisma | Type-safe, great migrations, JSONB support, best DX |
| Monorepo | Turborepo | Simple, fast, KISS |
| Auth | Email/Password + JWT | Internal tool, refresh token rotation |
| Deploy | VPS + Docker Compose | Cost-controlled, full ownership |

## Architecture Overview

```
crm-v3/
├── apps/
│   ├── api/              # NestJS backend (port 3001)
│   └── web/              # Next.js frontend (port 3000)
├── packages/
│   ├── shared/           # Shared types, constants, utils
│   └── database/         # Prisma schema, migrations, seed
├── turbo.json
├── package.json
└── docker-compose.yml    # PostgreSQL, API, Web, MinIO (files)
```

**API ↔ Frontend communication**: REST (KISS, well-suited for CRUD-heavy CRM)

## Core Data Model

### 1. Organization & Users

```
users
├── id (uuid)
├── email (unique, required)
├── password_hash
├── phone
├── name
├── role (enum: super_admin | manager | user)
├── department_id → departments
├── manager_id → users (self-ref, nullable)
├── employee_level_id → employee_levels (nullable)
├── is_leader (boolean, default false)
├── status (enum: active | inactive)
├── metadata (jsonb)
└── timestamps

departments
├── id (uuid)
├── name (unique)
├── description
└── timestamps

employee_levels
├── id (uuid)
├── name (e.g. senior, junior)
├── rank (int, for ordering/comparison)
└── timestamps
```

**Key constraints:**
- 1 user → 1 department
- 1 user → 1 manager (nullable for super_admin)
- employee_levels CRUD by super_admin only

### 2. Leads & Customers

```
customers
├── id (uuid)
├── phone (required, indexed)
├── name
├── email
├── metadata (jsonb) — flexible extra fields
├── assigned_user_id → users (nullable, current owner)
├── assigned_department_id → departments (nullable)
└── timestamps

leads
├── id (uuid)
├── customer_id → customers
├── product_id → products (nullable)
├── source_id → lead_sources
├── assigned_user_id → users (nullable, current owner)
├── status (enum: pool | assigned | in_progress | converted | lost | transferred)
├── phone (required, indexed) — denormalized for quick lookup
├── name
├── email
├── metadata (jsonb)
└── timestamps

lead_sources
├── id (uuid)
├── name
├── description
├── is_active (boolean)
└── timestamps
```

**Critical logic:**
- New lead → status = `pool`, assigned_user_id = null
- Manager phân phối → status = `assigned`, set assigned_user_id
- Lead converted → tạo/update customer record, lead status = `converted`
- Transfer across departments → unassign current user, customer enters department pool

### 3. Products (Simple)

```
products
├── id (uuid)
├── name
├── price (decimal)
├── description
├── status (enum: active | inactive)
└── timestamps
```

### 4. Orders & Payments

```
orders
├── id (uuid)
├── lead_id → leads
├── customer_id → customers
├── product_id → products
├── amount (decimal)
├── status (enum: pending | confirmed | completed | cancelled | refunded)
├── notes
├── created_by → users
└── timestamps

payments
├── id (uuid)
├── order_id → orders
├── payment_type_id → payment_types
├── amount (decimal)
├── status (enum: pending | verified | rejected)
├── status_verify (boolean, default false)
├── verified_by → users (nullable)
├── verified_at (timestamp, nullable)
├── notes
└── timestamps

payment_types
├── id (uuid)
├── name (e.g. transfer_full, transfer_partial, COD, installment)
├── description
├── is_active (boolean)
└── timestamps
```

**Conversion rule (KISS):** Any payment with `status_verify = true` → lead converts to customer.

### 5. Labels/Tags

```
labels
├── id (uuid)
├── name
├── color (hex)
├── category (optional grouping)
├── is_active (boolean)
└── timestamps

lead_labels (many-to-many)
├── lead_id → leads
└── label_id → labels

customer_labels (many-to-many)
├── customer_id → customers
└── label_id → labels
```

### 6. Activity Timeline

```
activities
├── id (uuid)
├── entity_type (enum: lead | customer)
├── entity_id (uuid)
├── user_id → users (nullable, null = system)
├── type (enum: note | call | status_change | assignment | label_change | system)
├── content (text)
├── metadata (jsonb)
└── created_at

activity_attachments
├── id (uuid)
├── activity_id → activities
├── file_name
├── file_url
├── file_type
├── file_size
└── created_at
```

### 7. Call Logs (3rd Party API)

```
call_logs
├── id (uuid)
├── external_id (varchar, from 3rd party)
├── phone_number (indexed)
├── call_type (enum: outgoing | incoming | missed)
├── call_time (timestamp)
├── duration (int, seconds)
├── content (text, transcription/notes)
├── matched_entity_type (enum: lead | customer | null)
├── matched_entity_id (uuid, nullable)
├── matched_user_id → users (nullable, auto-determined)
├── match_status (enum: auto_matched | unmatched | manually_matched)
├── verified_by → users (nullable)
└── timestamps

unmatched_calls (view or filtered query on call_logs where match_status = 'unmatched')
```

**Auto-match logic:**
1. API nhận call → tìm lead/customer bằng phone_number
2. Nếu tìm được → check assigned_user_id tại thời điểm call_time → gắn matched_user_id
3. Nếu không tìm được → match_status = `unmatched` → manager/super_admin review

### 8. Lead Assignment History

```
assignment_history
├── id (uuid)
├── entity_type (enum: lead | customer)
├── entity_id (uuid)
├── from_user_id → users (nullable)
├── to_user_id → users (nullable)
├── from_department_id → departments (nullable)
├── to_department_id → departments (nullable)
├── assigned_by → users
├── reason (text, nullable)
└── created_at
```

### 9. AI Lead Distribution Config

```
ai_distribution_configs
├── id (uuid)
├── department_id → departments
├── is_active (boolean)
├── matching_criteria (jsonb) — rules for matching
├── weight_config (jsonb) — {workload: 0.3, skill: 0.4, performance: 0.3}
└── timestamps
```

## Key Business Logic

### Lead Input Pipeline

```
CSV Import ─────┐
Manual Entry ───┤──→ Validation (phone required) ──→ Dedupe check ──→ Pool
3rd Party API ──┘                                     │
                                                      ├─ New customer? Create
                                                      └─ Existing? Link to customer
```

### Lead Lifecycle

```
Pool (unassigned) → Assigned (sale) → In Progress → Converted ──→ Customer
                                         │                         │
                                         └─→ Lost                  └─→ Transfer to
                                                                       support dept
                                                                       (free claim)
```

### Department Transfer & Claim

```
Sale closes deal → Lead converts to Customer
                 → Sale initiates transfer to target department
                 → Customer enters target department pool (assigned_user = null)
                 → Any user in target department can claim (free claim)
                 → Claim = set assigned_user_id to claimer
```

## Analytics Requirements

| Metric | Description |
|--------|-------------|
| Conversion rate | Per sale, per team, per source, per period |
| Lead quality score | Based on: source, conversion history, engagement |
| Sale performance ranking | Leads handled, conversion rate, revenue, response time |
| Funnel analysis | Pool → Assigned → In Progress → Converted/Lost |
| Revenue tracking | Per sale, per product, per department, per period |
| Source effectiveness | Which lead sources produce highest quality leads |
| Export | CSV/Excel export for all reports |

## Evaluated Approaches

### Approach 1: Monolith NestJS + Next.js SSR (Chosen)
**Pros:** Simple deployment, shared types, single DB, fast development
**Cons:** Harder to scale individual components
**Verdict:** ✅ Best fit for 50-200 users. Scale up later if needed.

### Approach 2: Microservices
**Pros:** Independent scaling, fault isolation
**Cons:** Overkill for this scale, operational complexity, distributed transactions
**Verdict:** ❌ YAGNI. Premature optimization.

### Approach 3: Low-code (Retool/Appsmith) + Custom API
**Pros:** Fastest MVP, less frontend work
**Cons:** Limited customization, vendor lock-in, doesn't support complex AI distribution
**Verdict:** ❌ Too limited for requirements.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| JSONB query performance at scale | Medium | GIN indexes on JSONB, query optimization, materialized views for reports |
| AI matching complexity | High | Start with rule-based weighted scoring, iterate to AI later |
| CSV import with large files | Medium | Background job processing (Bull queue), chunked parsing |
| Call auto-match false positives | Medium | Confidence scoring, unmatched queue for review |
| Order management scope creep | High | Clear boundaries: NO accounting module, NO inventory, NO invoicing engine |
| Phone number format inconsistency | Medium | Normalize all phone numbers on input (libphonenumber) |

## Honest Challenges & Recommendations

1. **AI matching Phase 1**: Don't use LLM for distribution yet. Start with **weighted scoring**: workload (30%) + employee level (30%) + historical conversion rate (40%). Add AI later when have enough data.

2. **JSONB caution**: Great for flexibility, but don't overuse. If a field is queried frequently → promote to real column. JSONB for truly dynamic data only.

3. **Phone as primary identifier**: Phone deduplication is critical. Normalize format on input. Consider: what if customer changes phone?

4. **Free claim race condition**: Multiple users claiming same customer simultaneously. Use DB-level optimistic locking (`UPDATE ... WHERE assigned_user_id IS NULL RETURNING *`).

5. **Activity table will grow fast**: Partition by created_at (monthly). Index on (entity_type, entity_id, created_at).

6. **File storage**: Use MinIO (S3-compatible, self-hosted) for VPS deployment. Don't store files in DB.

## Suggested Phasing

| Phase | Scope | Priority |
|-------|-------|----------|
| 1. Foundation | Monorepo setup, auth, RBAC, user/dept/level management | P0 |
| 2. Core CRM | Lead CRUD, customer CRUD, pool, manual assignment, sources, labels, products | P0 |
| 3. Orders & Payments | Order management, payment types, payment verification, conversion logic | P0 |
| 4. Activity & Timeline | Notes, system audit log, file attachments | P1 |
| 5. Call Integration | 3rd party API for calls, auto-match, unmatched queue | P1 |
| 6. Data Import | CSV import (leads/customers), 3rd party lead API, dedup logic | P1 |
| 7. Analytics | Dashboard, KPI, funnel, ranking, export | P1 |
| 8. AI Distribution | Weighted scoring → AI matching, config UI | P2 |
| 9. Department Transfer | Cross-department transfer flow, free claim system | P1 |

## Success Metrics

- Lead-to-customer conversion tracking accuracy: 100%
- Call auto-match rate: >85% (remaining go to manual review)
- CSV import: handle 10K+ rows without timeout
- Dashboard load time: <3s for 30-day aggregations
- System uptime: 99.5%+

## Next Steps

1. Create detailed implementation plan with phases
2. Setup monorepo + Docker dev environment
3. Design Prisma schema
4. Implement Phase 1 (Foundation)
