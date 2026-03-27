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
