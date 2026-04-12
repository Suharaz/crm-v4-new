-- Raw SQL indexes for CRM V4
-- These indexes cannot be expressed in Prisma schema (partial, GIN, FTS)
-- Run after initial schema push: psql -f raw-indexes.sql

-- USERS: active users, unique email among non-deleted
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_active ON users(email) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_active ON users(status) WHERE status = 'ACTIVE' AND deleted_at IS NULL;

-- DEPARTMENTS: unique name among non-deleted
CREATE UNIQUE INDEX IF NOT EXISTS idx_dept_name_active ON departments(name) WHERE deleted_at IS NULL;

-- LEADS: main filter query (status + user + date, active only)
CREATE INDEX IF NOT EXISTS idx_leads_filter ON leads(status, assigned_user_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_phone_active ON leads(phone) WHERE deleted_at IS NULL;

-- LEADS: full-text search
CREATE INDEX IF NOT EXISTS idx_leads_fts ON leads USING GIN(
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(phone,''))
) WHERE deleted_at IS NULL;

-- LEADS: GIN on JSONB metadata
CREATE INDEX IF NOT EXISTS idx_leads_metadata ON leads USING GIN(metadata) WHERE deleted_at IS NULL;

-- CUSTOMERS: phone search + pool + FTS
CREATE INDEX IF NOT EXISTS idx_customers_phone_active ON customers(phone) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_email_active ON customers(email) WHERE deleted_at IS NULL AND email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_dept_pool ON customers(assigned_department_id, assigned_user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_fts ON customers USING GIN(
  to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(phone,''))
) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_customers_metadata ON customers USING GIN(metadata) WHERE deleted_at IS NULL;

-- ORDERS: status filter
CREATE INDEX IF NOT EXISTS idx_orders_status_active ON orders(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_date ON orders(customer_id, created_at DESC) WHERE deleted_at IS NULL;

-- PAYMENTS: pending queue
CREATE INDEX IF NOT EXISTS idx_payments_pending ON payments(status) WHERE status = 'PENDING';

-- CALL_LOGS: unmatched queue
CREATE INDEX IF NOT EXISTS idx_calls_unmatched ON call_logs(match_status) WHERE match_status = 'UNMATCHED' AND deleted_at IS NULL;

-- ACTIVITIES: global feed
CREATE INDEX IF NOT EXISTS idx_activities_global ON activities(entity_type, created_at DESC) WHERE deleted_at IS NULL;

-- REFRESH_TOKENS: cleanup
CREATE INDEX IF NOT EXISTS idx_refresh_cleanup ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;

-- EMPLOYEE_LEVELS: rank sort
CREATE INDEX IF NOT EXISTS idx_emp_levels_rank ON employee_levels(rank);

-- ══════════════════════════════════════════════════════════════════════════
-- AUDIT REMEDIATION INDEXES (2026-04-12)
-- Added per audit findings DB-C1/C2/C3, DB-H2/H3/H6/H7, DB-M3/M4
-- ══════════════════════════════════════════════════════════════════════════

-- DB-C1: leads dept+status partial index (kho phòng ban queries)
CREATE INDEX IF NOT EXISTS idx_leads_dept_status_active
  ON leads(department_id, status) WHERE deleted_at IS NULL;

-- DB-C2: activities per-entity lookup (timeline, correlated subqueries)
CREATE INDEX IF NOT EXISTS idx_activities_entity_active
  ON activities(entity_type, entity_id, created_at DESC) WHERE deleted_at IS NULL;

-- DB-C3: trigram indexes for ILIKE substring search (phone/name)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_leads_phone_trgm
  ON leads USING gin(phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_leads_name_trgm
  ON leads USING gin(name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_phone_trgm
  ON customers USING gin(phone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_customers_name_trgm
  ON customers USING gin(name gin_trgm_ops);

-- DB-H2: leads updated_at for getTopPerformers date filtering
CREATE INDEX IF NOT EXISTS idx_leads_updated_at_active
  ON leads(updated_at DESC) WHERE deleted_at IS NULL;

-- DB-H3: functional date indexes for getConversionTrend (::date cast)
CREATE INDEX IF NOT EXISTS idx_leads_created_date
  ON leads((created_at::date)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_converted_date
  ON leads((updated_at::date)) WHERE status = 'CONVERTED' AND deleted_at IS NULL;

-- DB-H6: payment matching by status+amount
CREATE INDEX IF NOT EXISTS idx_payments_status_amount
  ON payments(status, amount);

-- DB-H7: payments verified_at for dashboard revenue aggregation
CREATE INDEX IF NOT EXISTS idx_payments_status_verified_at
  ON payments(status, verified_at);

-- DB-M2: customers status partial index
CREATE INDEX IF NOT EXISTS idx_customers_status_active
  ON customers(status) WHERE deleted_at IS NULL;

-- DB-M3: tasks assigned+status+due for user task queries
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status_due_active
  ON tasks(assigned_to, status, due_date) WHERE deleted_at IS NULL;
-- DB-M3: tasks reminder cron optimization
CREATE INDEX IF NOT EXISTS idx_tasks_remind_active
  ON tasks(remind_at) WHERE status = 'PENDING' AND reminded_at IS NULL AND deleted_at IS NULL;

-- DB-M4: assignment history 72h window query (kho mới monitoring)
CREATE INDEX IF NOT EXISTS idx_assignment_history_type_created
  ON assignment_history(entity_type, created_at DESC) WHERE from_department_id IS NULL;
