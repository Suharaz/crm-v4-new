# Project Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Labels — Missing DELETE endpoint (2026-04-17)
- **Bug:** Settings → Nhãn: clicking delete hit 404 (`/api/proxy/labels/:id`). `LabelsController` only had `GET/POST/PATCH`.
- **Fix:** Added `DELETE /labels/:id` → soft-deactivate (`isActive=false`) matching `lead-sources`/`payment-types` pattern. Preserves `LeadLabel`/`CustomerLabel` history; `list()` already filters `isActive:true` and invalidates `LOOKUP_LABELS` cache.
- **Files:** `apps/api/src/modules/labels/labels.{controller,service}.ts`

### Comprehensive Security & Performance Audit — Round 5 (2026-04-16)
- **Audit scope:** 94 raw findings from 4 parallel agents (backend security, backend perf, frontend, DB+infra). 12 eliminated as by-design/accepted risks. 82 genuine issues fixed.
- **Branch:** `fix/audit-round5-260416`

#### CRITICAL fixes (5)
- **Soft-delete extension:** `findUnique`/`aggregate`/`groupBy` now filter `deletedAt:null`. Previously 24 `findUnique` calls could return deleted records
- **Proxy token refresh body loss:** Buffered request body before first fetch. POST/PATCH/PUT during token refresh previously sent empty payload
- **CSV export/import auth bypass:** Routed through `/api/proxy` instead of calling NestJS directly. httpOnly cookie was not sent cross-origin — features broken in production
- **AI API key masking:** `GET /system-settings` now masks `ai_api_key` (first 8 chars + ••••••). Previously returned plaintext
- **Profile page useState misuse:** Replaced `useState(callback)` with `useEffect` for data fetching

#### HIGH fixes (10)
- **Bulk operation limits:** `bulkAssign`, `bulkRecall`, `applyTemplate` capped at 500 items (DoS prevention)
- **Redis KEYS → SCAN:** `delByPrefix` now uses non-blocking `scanStream` instead of blocking `KEYS` command
- **ReactMarkdown XSS:** Sanitize `javascript:` URLs in AI-generated markdown content
- **localStorage cache TTL:** 24h → 5min (3 components). Prevents stale prices/data
- **Polling on hidden tab:** NotificationBell + LeadPoolTable pause polling via `visibilitychange`
- **Error boundary:** Always shows generic message (no `error.message` leak)
- **Metadata editor:** Blocks `__proto__`/`constructor`/`prototype` keys
- **.env.example:** Redis URL now includes password (fixes new dev setup NOAUTH error)

#### MEDIUM fixes (17)
- **Third-party API:** Throw proper HTTP errors (was returning error as 200 OK). Honor `skipPool` flag for ZOOM status
- **searchByPhone:** Added 10/min burst rate limit alongside daily 100 limit
- **Notification markAsRead:** BigInt comparison via `.toString()` (safe cross-type)
- **SystemSettings cache:** 5-min in-memory cache on `get()`, invalidate on `set()`
- **RecallConfig:** Validate `entityType` must be LEAD or CUSTOMER
- **Database indexes:** Added `leads.phone`, `customers.phone`, `payments.status`, `leads(phone,source_id,product_id)` composite dedup index
- **Customer.phone unique:** Partial unique index `WHERE deleted_at IS NULL`
- **Order.vatRate:** Added `@default(0)` (was missing unlike Product.vatRate)
- **Docker:** Added healthcheck for PostgreSQL + Redis
- **Schema comment:** Documented `@@unique([email, deletedAt])` is misleading — raw index is real enforcement
- **Search AbortController:** Cancel stale search requests on new input
- **lead-form deps:** Fixed stale closure — added `form.name`/`form.email` to useEffect deps
- **Password change:** Now requires current password
- **AI settings frontend:** Mask API key, skip save if masked value unchanged

#### LOW fixes (3)
- **Pool endpoints:** Limit capped to max 100 (was uncapped)
- **poolNewFiltered:** Distributed leads query capped at 200
- **Error toasts:** Note save failures now show toast instead of silent catch

- **Report:** `plans/reports/audit-synthesis-260416-1620-comprehensive-filtered.md`

### Security Audit & Fixes — Round 4 (2026-04-16)
- **Audit scope:** 43 findings from 3 parallel agents (backend, frontend, DB+infra)
- **CSV error report injection:** Import error CSV wrote user-supplied values without sanitization → Excel formula injection. Applied `sanitizeCsvCell()` + quote escaping
- **Open redirect:** Login `?redirect=` param accepted absolute URLs → phishing. Now validates relative path only
- **Import polling memory leak:** `setInterval` in `useState` initializer never cleaned up on unmount. Replaced with `useEffect` + cleanup
- **Prototype pollution:** CSV column headers stored as JSONB metadata keys without filtering `__proto__`/`constructor`/`prototype`. Added guard
- **File size validation:** Upload UI showed "tối đa 10MB" but didn't validate. Added client-side 10MB check
- **ZOOM claim bug:** ZOOM leads were not claimable — guard check and WHERE clause only had POOL+FLOATING. Added ZOOM to both (ZOOM → IN_PROGRESS is valid per ALLOWED_TRANSITIONS)
- **Report:** `plans/reports/code-review-260416-1512-comprehensive-audit-round4.md`

### Customer CSV Import — Extended Columns (2026-04-16)
- **New optional columns:** `companyName`/`Công ty`, `facebookUrl`/`Facebook`, `instagramUrl`/`Instagram`, `zaloUrl`/`Zalo`, `linkedinUrl`/`LinkedIn`, `shortDescription`/`Mô tả ngắn`, `description`/`Mô tả`, `labels`/`Nhãn`
- **Labels:** Comma-separated names (e.g. "VIP,Quan tâm"), matched case-insensitive against DB labels, attached via `customerLabel` junction table
- **Bilingual headers:** All columns accept both English (camelCase) and Vietnamese names
- **Labels preloaded:** Added to lookup preload alongside sources/products for O(1) matching

### Security Audit Remediation — Round 3 (2026-04-16)
- **Audit scope:** 25 findings reviewed with product owner; 11 fixed, 14 accepted as non-issues (internal app context)
- **Auth hardening:**
  - `@Throttle({ auth: 5/min })` enforced on login + refresh endpoints (was falling back to global 100/min)
  - Refresh token reuse detection — revokes ALL user sessions if stolen token replayed
  - Account lockout: skip counter increment when already locked (prevent perpetual DoS)
- **Department isolation:** Customer claim now checks department membership (FLOATING: anyone; dept-assigned: same dept only)
- **Rate limiting:** searchByPhone rate-limited to 100/day per user (new `daily` throttler group)
- **Helmet:** CSP, HSTS (1yr + includeSubDomains), strict referrer policy configured
- **Docker:** Ports bound to `127.0.0.1` (not 0.0.0.0). Redis requires password via `REDIS_PASSWORD` env var. Postgres creds via env vars
- **Cookie security:** SameSite upgraded from Lax to Strict (auth + proxy routes)
- **Exception filter:** Production mode returns generic error names (no PrismaClient class leak)
- **Pino logging:** Redact list expanded: `x-api-key`, `cookie`, `set-cookie` headers
- **Metadata validation:** Reject `__proto__`/`constructor`/`prototype` keys in third-party API metadata
- **CLAUDE.md:** Added "Security — Accepted Risks" section documenting intentional design decisions
- **Accepted risks (by product owner):** File serving by UUID, cross-user entity editing (collaborative CRM), MCP full access, webhook HMAC (external processing), API key broad scoping

### Dashboard v2 — Sidebar Sub-pages + Employee Scorecard (2026-04-14)
- **Navigation:** "Trang chủ" now dropdown in sidebar with 4 sub-pages (Tổng quát, Doanh thu, Nhân viên, Khách hàng)
- **Routing:** Each section is a separate page (`/dashboard/revenue`, `/dashboard/employees`, `/dashboard/customers`)
- **Employee Scorecard (`/dashboard/employees`):**
  - Weighted score 0-100 per employee: conversion (40%), revenue (30%), aging (20%), tasks (10%)
  - Color-coded: green ≥70, amber ≥40, red <40 with tinted card backgrounds
  - Metrics: leads assigned/converted, revenue, overdue tasks, aging leads 7+ days
  - Comparison vs department average (±% TB phòng ban)
  - Summary: total employees, KPI achieved %, needs help count
  - Department filter dropdown + time range selector
- **Backend:** New `/dashboard/employee-scores` endpoint with dept filter, cached 30s
- **Sidebar:** Extended `NavItem` with `children` array pattern (reuses existing dropdown UI)
- **Main dashboard:** Simplified to overview only (no tabs), focused KPI + charts

### Dashboard Full Redesign — Smart Dashboard + Domain Tabs (2026-04-14)
- **Architecture:** Replaced monolithic 452-line component with 14 modular files (all <200 lines)
- **Layout:** Main overview (4 KPI + 2 mini charts) + 3 domain tabs (Khách hàng, Doanh thu, Nhân viên)
- **KPI Cards:** Reduced from 8 to 4 primary metrics with ↑↓% trend arrows (vs previous period)
- **Tabs:** Radix UI tabs with URL state sync (`?tab=customers`), lazy-loaded data per tab
- **Role-based:** Staff sees 2 tabs (KH + DT), Manager+ sees 3 tabs (+ Nhân viên)
- **Mobile:** KPI horizontal scroll-snap (70vw), time range dropdown, hidden scrollbar
- **Data hooks:** `useDashboardStats` (main section) + `useTabData` (lazy per tab with cache)
- **Error handling:** Per-section errors instead of empty catch block; loading skeletons
- **Removed:** `dashboard-client-with-charts.tsx` (452 lines), `dashboard-kpi-stats-grid.tsx` (129 lines)
- **New structure:**
  - `dashboard-page.tsx` — orchestrator (42 lines)
  - `dashboard-header.tsx` — title + time range selector (mobile dropdown)
  - `dashboard-kpi-section.tsx` — 4 KPI cards with scroll-snap
  - `dashboard-main-charts.tsx` — revenue + funnel mini charts
  - `dashboard-tabs.tsx` — tab container with URL sync
  - `tabs/tab-customers.tsx` — funnel, aging, conversion trend, sources
  - `tabs/tab-revenue.tsx` — revenue trend, dept revenue
  - `tabs/tab-team.tsx` — top performers, dept + team performance
  - `hooks/` — data fetching with proper error handling
  - `widgets/` — reusable KPI card, chart card, tooltip
  - `constants.ts` — design tokens, formatters, types

### Security & Performance Audit Remediation — Round 2 (2026-04-13)
- **Branch:** `audit/security-performance-260413` — 10 fixes across security and performance
- **Audit scope:** 328 TypeScript files, 7 security areas + 3 performance areas scanned
- **Results:** 1 critical, 12 high, 16 medium, 9 low findings; 44 prior controls verified
- **Security (IDOR fixes):**
  - Lead update IDOR bypass — `findById` now receives user context (H7)
  - Pool department endpoint — USER restricted to own department only (H1)
  - Payment list/findById — USER scoped to own orders (H3/H4)
  - Payment create — order ownership check for USER role (H5)
  - Task complete/cancel/update/remove — ownership check (assignee/creator/MANAGER+) (M8)
  - Label attach/detach — ownership verified via `findById` on leads and customers (M10)
  - Webhook signature guard — fail-closed in production, warn-only in dev (M1)
- **Performance:**
  - Distribution batchDistribute — score once + batch $transaction (~800 → ~7 queries) (CRIT-1)
  - Lead assign — atomic $transaction with `updateMany` status guard prevents race (PH1)
  - Task processReminders — batch `createMany`/`updateMany` for all 3 escalation levels (PH5)
  - 2 new composite indexes: orders(status, created_at), payments(order_id, status) (PM3/PM4)
- **Report:** `plans/reports/audit-260413-1048-security-performance-comprehensive.md`

### Settings Page Grouped Sidebar Navigation (2026-04-12)
- **Layout:** Replaced 12 flat tabs with sidebar grouped into 4 categories
- **Tổ chức:** Phòng ban & Team (combined view), Cấp bậc
- **Lead & KH:** Nguồn lead, Nhãn
- **Đơn hàng & TT:** Thanh toán, Lần CK, Hình thức, Nhóm SP, TK Ngân hàng
- **Hệ thống:** API Keys, AI (admin only)
- **Mobile:** Native select dropdown for settings navigation
- **UX:** Collapsible group headers, icon + active highlight per item

### User Profile Page + Password Toggle (2026-04-12)
- **Profile page:** `/profile` — view account info (email, role, dept, team), edit name/phone, change password
- **Password toggle:** Eye/EyeOff icon on login + profile password fields
- **Header link:** Avatar/name in header now links to `/profile`
- **Password change:** Auto-logout + redirect to login (tokens revoked server-side)

### VeloCRM Rebrand + Design System Overhaul (2026-04-12)
- **Rebrand:** "CRM V4" → "VeloCRM" across all UI (sidebar logo, login page, metadata, dashboard)
- **Design System:** Sky Blue (#0ea5e9) primary + Cyan (#06b6d4) accent. Plus Jakarta Sans font. Colored shadows, hover-lift cards, gradient text
- **Font:** Plus Jakarta Sans (geometric sans-serif, Vietnamese subset) via next/font/google
- **Design Tokens:** globals.css @theme — sky primary scale, cyan accent, blue-tinted shadows, gradient utilities
- **shadcn/ui:** All 11 base components updated — gradient buttons (sky→cyan), colored card shadows, sky focus rings
- **Layout Shell:** Sidebar gradient active indicator, gradient avatar, responsive hamburger menu
- **Login:** Split-screen design — left branded panel (sky gradient, feature highlights), right clean form. Responsive on mobile
- **Dashboard:** KPI cards with hover-lift, gradient time range selector (sky→cyan), chart color update
- **Landing Page:** Root `/` (public) — nav, hero (isometric mockup), features (8 cards), stats (dark sky gradient), CTA, footer
- **Routing:** `/` = landing (public), `/dashboard` = CRM home (auth). Middleware PUBLIC_PATHS array
- **Responsive:** Mobile sidebar drawer with hamburger toggle, auto-close on navigate, h-dvh layout, responsive padding
- **Docs:** Updated design-guidelines.md, CLAUDE.md, changelog

### Audit Remediation — 40+ Fixes Across Security, Performance, Database (2026-04-12)
- **Branch:** `fix/audit-remediation-260412` — 12 commits addressing 40+ audit findings
- **Security (Critical/High):**
  - Path traversal in file serving (already patched in prior commit)
  - Payment matching race condition — optimistic locking with `updateMany` guards
  - IDOR in `findById` — USER role now scoped to own leads/customers/orders
  - Helmet security headers (X-Frame-Options, CSP, HSTS, etc.)
  - Webhook HMAC-SHA256 signature verification (`WEBHOOK_SECRET` env var)
  - MCP endpoint rate limiting (was @SkipThrottle, now 100 req/min)
  - File upload magic bytes validation (file-type package)
  - API key permission scope enforcement
- **Security (Medium):**
  - CORS production guard — throws on missing `FRONTEND_URL` in production
  - `externalId` format validation (max 255, alphanumeric+dash)
  - Third-party API metadata size limit (10KB max)
  - Global search scoped by user role (USER sees only own records)
- **Performance:**
  - Import processor: streaming CSV + DI PrismaClient (was: readFileSync + new PrismaClient per worker)
  - Scoring service: 4 batch queries replaces 6000 queries per distribute batch
  - Assignment template apply: grouped `updateMany` + `createMany` per user
  - CSV import: preloaded source/product/phone Maps — 1 query/row instead of 4-6
  - Dashboard `getLeadFunnel`: single `groupBy` replaces 7 COUNT queries
  - Dashboard `getLeadAging`: LATERAL JOIN replaces correlated subquery
  - Recall service: chunk processing (500/batch) prevents large IN clauses
  - Activities stats: bounded to 500 records max
- **Database:**
  - 17 new indexes: partial (leads/activities/customers/tasks), pg_trgm (phone/name search), functional (date cast), payment status+amount
  - Connection pool config documented (`connection_limit=20&pool_timeout=10`)
  - Notification cleanup cron (delete >90 days, daily at 3 AM)
- **~~Still remaining:~~ Redis caching layer (PERF-M1) — DONE** (see below), streaming CSV export (PERF-M3)

### Database Optimization & Redis Caching — 5 Phases (2026-04-12)
- **Branch:** `fix/audit-remediation-260412`
- **Phase 01 — PrismaClient Singleton:** Fixed 35 modules each creating `new PrismaClient()` → single @Global() PrismaModule with shared singleton. Connection pool: 20 connections, 10s timeout.
- **Phase 02 — Redis Cache Infrastructure:** `CacheService` with BigInt-safe serialization, fail-open pattern, `getOrSet()` helper, `@CacheInvalidate()` decorator. Uses existing Redis 7 on port 6380 with `crm:cache:` key prefix.
- **Phase 03 — Lookup Table Caching:** 9 lookup services (labels, lead-sources, payment-types, order-formats, product-groups, payment-installments, product-categories, bank-accounts, employee-levels) cached with 10min TTL + write-through invalidation on mutations.
- **Phase 04 — Dashboard Caching:** 9 dashboard query methods cached with 30s TTL, hash-based cache keys scoped by userId/role/date range.
- **Phase 05 — PostgreSQL Docker Tuning:** `shared_buffers=512MB`, `work_mem=16MB`, `effective_cache_size=2GB`, `random_page_cost=1.1`, slow query logging (>500ms). Redis: `maxmemory=128mb` with `allkeys-lru` eviction.

### Full Codebase Audit — Security, Performance, Query Speed (2026-04-12)
- **Scope:** 51 findings across 3 categories — Security (15), Performance (15), Database/Query (21)
- **Critical (7):** Path traversal in file serving, payment matching race condition, missing partial indexes on leads/activities/phone, import processor memory+connection leak, no notification cleanup
- **High (16):** IDOR in findById methods, missing Helmet headers, N+1 in scoring (6000 queries/batch), webhook auth gaps, MCP rate limit bypass, search/export role scoping, dashboard cross-joins
- **Medium (17):** Zero caching layer, unbounded queries, missing customer/task indexes, connection pool defaults, CORS fallback, metadata validation
- **Report:** `plans/reports/audit-260412-2116-security-performance-query.md`
- **Remediation roadmap:** 3 phases (~34h total effort), prioritized by risk severity

### MCP Server + AI Agent REST API (2026-04-12)
- **MCP Server:** Streamable HTTP transport at `POST /api/v1/mcp` (stateless mode). Read-only tools for AI agents to query CRM data
- **MCP Tools (18):** 10 core tools + 8 analytics tools for Sales Director
  - Core: `get_schema`, `search_leads`, `get_lead_detail`, `search_customers`, `get_customer_detail`, `search_orders`, `get_order_detail`, `list_products`, `get_stats`, `list_users`
  - Analytics: `get_revenue_trend`, `get_top_performers`, `get_dept_performance`, `get_team_performance`, `get_leads_by_source`, `get_conversion_trend`, `get_lead_aging`, `analyze_lead_quality` (CPL/CPA/ROAS with adSpend input)
  - Ads: `analyze_ads_effectiveness` — phone dedup, true duplicates, multi-product interest, revenue per source, avg conversion time, source×product matrix
- **Smart filtering:** All tools enforce `limit` (default 20, max 100), cursor pagination. Never return all data
- **Auth:** API key via `x-api-key` header with granular `mcp:*` permissions (leads, customers, orders, products, stats, users, schema)
- **REST fallback:** `/ai-agent/` endpoints reuse same query service for non-MCP AI clients
- **Frontend:** MCP permission checkboxes in API key creation dialog, MCP connection info (endpoint URL + Claude Desktop config JSON), MCP badge on key list

### Payment Excel Export/Import + Customer AI Rating + Activity Chart (2026-04-11)
- **Export Excel:** Manager+ can download verified payments as .xlsx with date range filter (23 columns, Vietnamese headers)
- **Import Excel:** Upload .xlsx with 20 columns (order + payment data). Auto-maps SĐT→customer, product→order. Creates new customers/orders if needed. Returns summary: created/matched/new customers/errors
- **AI Rating:** Customer analysis now returns 1-5 star rating. Saved to `aiRating` field, displayed as gold stars on analysis card
- **Activity by Department:** Horizontal bar chart on customer detail showing interaction count per department (NOTE + CALL). Click to expand inline activity list per dept

### Payment Reconciliation Redesign (2026-04-11)
- **Expanded payment data:** API now includes order→customer, product, creator, lead in payment responses
- **Filter bar:** Search by nội dung CK/customer name, filter by payment type, date range for pending payments
- **Expandable rows:** Click any payment (pending or verified) to see full detail inline: order info, customer, product, lead, VAT, installment, bank match
- **Verified table:** Added columns: khách hàng, sản phẩm, người tạo, ngày CK
- **Backend:** Offset pagination + filters (paymentTypeId, search, dateFrom, dateTo) for payments list

### UX Improvements (2026-04-11)
- **Lead expand instant actions:** Quick action buttons (note, label, transfer, payment) render immediately on click; data loads async with spinner in data column
- **Zoom pool fix:** Pool/zoom page no longer triggers auto-refresh of pool/new data (was using wrong poolMode)
- **Numbered pagination:** Replaced "Tải thêm" cursor pagination with numbered pages (1,2...N) + first/prev/next/last buttons + page size selector (10/50/100/500) saved to localStorage. Backend supports offset+total count via `?page=N&limit=M`. All list pages (leads, customers, orders, users) updated

### Dynamic Order/Payment Lookup Tables + New Payment Fields (2026-04-11)
- **Schema:** 3 new lookup tables — `OrderFormat` (Hình thức), `ProductGroup` (Nhóm sản phẩm), `PaymentInstallment` (Lần CK)
- **Schema:** Order: added `vatEmail`, `formatId`, `productGroupId` foreign keys (legacy string fields kept)
- **Schema:** Payment: added `transferDate`, `vatAmount`, `installmentId`
- **API:** 3 new CRUD modules (GET/POST/PATCH/DELETE) with SUPER_ADMIN guards
- **API:** Orders accept `formatId`, `productGroupId`, `vatEmail` in create/list
- **API:** Payments accept `transferDate`, `vatAmount`, `installmentId` in create
- **Settings:** SuperAdmin can CRUD all 3 lookup tables in Settings page (3 new tabs)
- **Order creation:** Dynamic format/group selects from API, `vatEmail` field, payment VAT auto-calc
- **Payment creation:** `transferDate` input, installment select, VAT auto-calculated from product rate
- **Order filters:** Dynamic format/group from API instead of hardcoded arrays
- **Order detail:** Shows `orderFormat`, `productGroup`, `vatEmail`, payment installment info
- **Seeded defaults:** Zoom Replay/Live/Khách cũ, Online/Tool/Offline, CK lần 1-4/Full

### Type Safety Cleanup (2026-04-10)
- **65 files fixed:** Eliminated all `@typescript-eslint/no-explicit-any` warnings across frontend
- **New types:** `apps/web/src/types/entities.ts` — 15 entity interfaces (LeadRecord, CustomerRecord, OrderRecord, etc.)
- **Pattern:** `Record<string, unknown>` replaces `Record<string, any>`, `err: unknown` replaces `err: any`

### Bug Fixes (2026-04-10)
- **Duplicate key fix:** Dedup merged pool+distributed leads in `poolNewFiltered` API (race condition)
- **Duplicate key fix:** Dedup orders/activities in `LeadInlineExpandDetail` (stale cache + API aggregation)

### Security: SEED_PASSWORD env var (2026-04-10)
- **Repo flip private → public:** `gh repo edit Suharaz/crm-v4-new --visibility public`. Pre-flight scan: `.env*` trong gitignore, không có hardcoded secrets trong source.
- **Seed credential leak fix:** `packages/database/prisma/seed.ts` cũ hardcode `changeme` cho 6 accounts bao gồm SUPER_ADMIN → repo public sẽ leak credentials. Refactor:
  - Dev: default `changeme` (backward compat)
  - Production: **bắt buộc** env `SEED_PASSWORD` (min 8 chars) — throw error nếu thiếu để tránh leak
- **`.env.production.example`:** thêm `SEED_PASSWORD`, `NODE_ENV=production`, sửa comment `NEXT_PUBLIC_API_URL` phải dùng HTTPS public URL (không localhost)
- **`docs/demo-accounts.md`:** thêm warning DEV ONLY, phân biệt rõ dev password vs production SEED_PASSWORD

### aaPanel Deployment Guide (2026-04-10)
- **New doc:** `docs/aapanel-deployment-guide.md` — multi-project VPS deployment playbook với aaPanel 7.x
- **Research:** `plans/reports/research-260410-1114-aapanel-facts.md` — verified facts từ aapanel.com docs + forum + GitHub source code
- **Kiến trúc:** aaPanel 7 **Proxy Project** site type + **Customized Configuration Files** (persistent custom nginx) + PM2 Manager plugin + Docker Manager plugin + Cloudflare Full(Strict) + Let's Encrypt **DNS-01 via CF API**
- **Hardening checklist:** bt 8 (đổi port), bt 14 (Security Entrance), 2FA, IP whitelist, BasicAuth, panel SSL — mandatory trước production
- **Auto-deploy:** GitHub Actions → SSH → `scripts/deploy.sh` (tái sử dụng từ commit 16bb453)
- **Playbook thêm project mới:** Port convention (API=30N0, Web=30N1, PG=543(N+2), Redis=638N), 13-step checklist, template files cho docker-compose + PM2 + deploy script
- **Gotchas documented:** vhost regeneration wipes raw edits, Repair button drops reverse proxy, firewall ufw desync, HTTP-01 fail với CF proxied, phpMyAdmin 888 no-SSL, Node Project vs PM2 Manager dual systems, CVE-2022-28117 (aaPanel ≤6.6.6)

### Customer Detail Redesign (2026-04-09)
- **Remove "Thông tin thêm":** Metadata section removed from detail view (already in edit form)
- **Social icons in info card:** Facebook, Instagram, Zalo, LinkedIn shown as icons — colored+clickable if link exists, grey if not. Opens in new tab
- **"Phân tích khách hàng" card:** Shows short description with expandable full description. CTA to edit page if no analysis exists
- **Expandable orders:** Click order row to expand inline payment history (fetched on-demand from `/orders/:id`). No more navigation to order page
- **Backend:** Customer detail orders now include product name, sorted by date desc
- **Fix: Customer timeline:** Now aggregates activities from customer + all related leads (was only showing direct customer activities)
- **Customer list:** Click name navigates directly to detail page (removed popup preview dialog)
- **Back button:** All detail, edit, and create pages now have "Quay lại" button (9 pages: customers, leads, orders, users)
- **Customer info card:** Removed nhân viên/phòng ban fields, added SĐT, labels inline, company if available. No separate labels section

### AI Analysis System Rewrite (2026-04-09)
- **Schema:** `CallLog.analysis` field for call analysis results. `SystemSetting` key-value table for admin config
- **Call analysis:** Auto-triggered when call duration > 60s. Prompt configurable by super admin in Settings > AI tab
- **Customer analysis:** Auto-triggered when call > 120s, or manual via "Phân tích ngay" button on customer detail
- **Customer analysis input:** Notes, payment history, call analyses — merged from customer + all related leads
- **Customer analysis output:** Saves to `shortDescription` (tóm tắt) + `description` (chi tiết) fields. Fixed JSON output wrapper ensures structured extraction regardless of prompt
- **Settings > AI tab:** Super admin configures call analysis prompt and customer analysis prompt
- **Removed:** `aiSummaryShort` / `aiSummaryDetail` metadata approach (replaced by direct field writes)
- **API:** `POST /customers/:id/analyze` for on-demand AI analysis. `GET/PUT /system-settings` for admin config
- **AI config UI:** API key + model stored in DB via Settings > AI tab. Model selector fetches OpenRouter model list with search, free models first. No more env var dependency for AI
- **Customer analysis markdown:** Detail renders as rich markdown (bold, lists, headings). Added "Phân tích chi tiết chân dung khách hàng" heading above content
- **Call logs page overhaul:** Date range filter (dateFrom/dateTo), AI analysis shown per call (markdown), sparkle icon for analyzed calls. "Tóm tắt AI" button summarizes filtered calls with strengths/weaknesses
- **Call summary prompt:** New setting in Settings > AI for daily call summary prompt
- **API:** `POST /call-logs/summarize` for date-range call summary, `GET /call-logs?dateFrom=&dateTo=` date filter
- **Call analysis tags:** AI outputs structured JSON `{tags:[], detail:""}`. Tags shown as hash-colored pastel badges on call rows (8-color palette). Content + analysis sections collapsible with "Xem thêm"
- **Call summary refactor:** "Tóm tắt AI" now sends only tag frequency table (max 150 calls) with fixed prompt. Returns: tổng quan, điểm mạnh, điểm yếu, đề xuất. No configurable prompt needed

### Advanced Filter Bars — Customers & Orders (2026-04-08)
- **Customers filter:** Status, phòng ban, nhân viên, nhãn, khoảng ngày. Search tên/SĐT/email
- **Orders filter:** Status, sản phẩm, người tạo, hình thức, nhóm, khoảng ngày. Search tên KH/SĐT/mã khoá
- URL-based state (shareable links), localStorage persistence, badge count active filters
- Backend DTOs expanded: `labelId`/`dateFrom`/`dateTo` (customers), `search`/`productId`/`createdBy`/`format`/`groupType`/`dateFrom`/`dateTo` (orders)

### Lead Distribution Monitoring + Customer Schema Update (2026-04-08)
- **Distribution monitoring:** Kho Mới page now shows recently distributed leads (72h) alongside unassigned leads. Columns: "Phân cho" (user + relative time), "Tương tác" (color-coded activity count). Auto-refresh 30s
- **Recall:** Single/bulk recall leads back to Kho Mới. New endpoints `POST /leads/:id/recall` and `POST /leads/bulk-recall`
- **Customer schema:** Renamed `zaloPhone` → `zaloUrl` (both Customer & Lead). Added `shortDescription` and `description` fields to Customer
- **Bug fixes:** Removed unused imports causing build failures (`lead-inline-expand-detail`, `entity-quick-preview-dialog`, `create-order-dialog`)

### Access Control + Dashboard Redesign (2026-04-02)
- **Leads RBAC:** USER sees only assigned leads. New `/my-dept-pool` endpoint. User sidebar: My Lead, Kho phòng ban, Thả nổi
- **Orders RBAC:** USER sees only own orders. Inline expandable row replaces link-to-detail
- **Call logs RBAC:** Opened to all roles. USER filtered by matchedUserId
- **Products:** Click card to view full description in popup dialog
- **Dashboard:** Time range picker (Hôm nay/Tuần/Tháng/Quý/Năm). Revenue bar chart + lead status pie chart. Role-based data filtering

### UI Redesign — Status Rename + Role-based Navigation + Products Tabs (2026-04-02)
- **Status rename:** REDATA → ZOOM across full stack (Prisma enum, backend, frontend, routes)
- **Role-based sidebar:** Manager sees Leads submenu (Chờ phân phối, Zoom, Kho thả nổi). Super Admin sees flat /leads link
- **Products page:** Merged products + categories into one tabbed page (Sản phẩm / Danh mục). Removed Danh mục SP from Settings
- **Auth fix:** Prevent stale cookies from blocking login — middleware JWT expiry check, proxy cookie cleanup on failed refresh, api-client 401 redirect

### Phase 23: RBAC E2E Tests + Lead Flow (2026-03-28)
- **RBAC E2E** (19 tests): Kiểm tra sidebar, page access, action buttons cho 3 roles qua trình duyệt
- **Lead Lifecycle Flow** (7 tests): Manager tạo lead → assign → sale claim → note → convert → order → dashboard
- Fix API proxy route cho cross-origin cookie auth (401 bug)
- Fix port-in-use detection khi khởi động API

### Phase 22: Lead Pool Inline Actions (2026-03-28)
- **Kho Mới:** Nút "Phân" inline trên bảng — manager chọn nhân viên qua dialog
- **Kho Thả Nổi:** Nút "Nhận" + "Phân" inline — user claim nhanh, manager assign
- New component: `lead-pool-action-buttons.tsx`
- `LeadTable` nhận `poolMode` prop để hiện cột Thao tác

### Phase 21: Test Execution & Bug Fixes (2026-03-28)

#### Test Results — 531/531 PASSED (18 skipped)
- **Unit:** 9 files, 195/195 tests passed (~1.2s)
- **API Integration:** 16 files, 288/288 tests passed (~88s)
- **E2E Playwright:** 13 files, 48/48 tests passed, 18 skipped (~19min)

#### Bug Fixes (discovered via test execution)
- **Zod 4 API change:** `orderSchema.customerId` — use `error` instead of `required_error`
- **Self-deactivation guard:** `UsersService.deactivate()` now blocks admin self-deactivation (400)
- **Task creation crash:** `BigInt(undefined)` for missing `assignedTo` — made optional
- **Payment verify stale read:** Moved `findById()` outside `$transaction()` scope
- **Activities validation:** Empty content → 400, non-existent entity → 404
- **12 action endpoints:** Added `@HttpCode(200)` on assign, claim, transfer, verify, reject, etc.
- **Query filter DTOs:** Added typed DTOs for tasks, orders, products, bank-transactions filter params
- **Leads DTO:** Added `notes` field to `CreateLeadDto`
- **EmployeeLevels access:** All authenticated users can view (removed class-level `@Roles`)
- **Configurable throttle:** `THROTTLE_LIMIT` / `THROTTLE_AUTH_LIMIT` env vars for testing

### Phase 20: Comprehensive Test Suites (2026-03-28)

#### E2E Tests (Playwright) — 14 spec files, ~87 tests
- Auth: login/logout/session guard, 3 roles
- Leads: CRUD, status flow, 3 Kho pools, assign/claim/transfer
- Customers: CRUD, claim, transfer, role visibility
- Orders: create, status change, payment verify/reject
- Products: dialog CRUD, VND price format
- Settings: 5 tabs CRUD (departments, levels, sources, labels, payment types)
- Users: CRUD, roles, deactivate (SUPER_ADMIN only)
- Tasks: quick add, complete, cancel, edit, delete
- Dashboard: KPI stats per role
- Search: global search dropdown, navigation
- Notifications: bell, unread count, mark read
- Import/Export: CSV upload/download
- AI Distribution: config, weights, batch assign
- Screenshot capture on all key steps

#### API Integration Tests (Vitest) — 16 test files, ~90+ tests
- All REST endpoints with HTTP status assertions
- RBAC verification: 3 roles per protected endpoint
- Business logic: status transitions, payment matching, bank webhook dedup
- Cursor pagination, phone normalization, auto IN_PROGRESS trigger

#### Unit Tests (Vitest) — 10 test files, ~192 tests
- Phone normalization + validation (VN format)
- CSV formula injection sanitizer
- Zod form schemas (Vietnamese error messages)
- Lead status transition rules (valid/invalid paths)
- Payment matching + conversion trigger logic
- AI distribution weighted scoring
- Round-robin assignment template distribution
- Auto-recall pool expiry criteria
- Roles guard authorization logic

### Phase 19: Full Project Audit & Quality Fixes (2026-03-28)

#### Backend
- **Manager dept permission**: `checkTransferPermission()` now queries ManagerDepartment table (leads + customers)
- **Activities controller**: Replaced standalone PrismaClient with LeadsService DI for `triggerInProgress`
- **Cron error handling**: `processReminders()` and `runAutoRecall()` wrapped with try-catch + Logger
- **Redis config**: BullMQ now parses `REDIS_URL` env var, fallback to `REDIS_HOST`/`REDIS_PORT`
- **Bank transaction validation**: Amount must be > 0 on webhook ingest

#### Frontend
- **API port fix**: Corrected fallback from 3001 to 3010 in api-client.ts
- **Error boundary**: Dashboard-level `error.tsx` catches runtime errors gracefully
- **Zod form validation**: 8 schemas for all forms (lead, customer, user, product, order, task, settings)
  - Vietnamese phone validation (0 + 9-10 digits), field-level Vietnamese error messages
  - Shared `zod-form-validation-schemas.ts` + `parseZodErrors()` helper
- **Mobile responsive tables**: Hide non-essential columns on mobile (md:hidden, lg:hidden)
- **Loading skeletons**: `loading.tsx` for dashboard, leads, customers, orders routes using DataTableSkeleton

#### Audit Summary
- Full scan: 28 backend modules, 25 frontend pages, 70+ components, 3 packages
- Backend actual completeness: ~90% (was reported 85%, @Roles pattern verified correct via service-layer checks)
- Frontend actual completeness: ~85% (validation + error handling gaps now fixed)
- Remaining: Test coverage (0%), @crm/types population (deferred), Prisma migrations init

### Phase 18: Tasks/Todo Full Enhancement (2026-03-28)

#### Backend
- `PATCH /tasks/:id` — update title, description, dueDate, remindAt, priority, assignedTo
- `DELETE /tasks/:id` — soft delete
- Escalation cron: overdue >1h → notify assigned user, >24h → notify department manager
- Reminder reset: changing remindAt clears remindedAt flag

#### Frontend
- **Quick add bar**: inline task creation with Enter key + quick time presets (Hôm nay/Ngày mai/Tuần sau)
- **Enhanced create/edit dialog**: priority selector (Thấp/TB/Cao), remindAt datetime, assign-to-user dropdown
- **Edit task**: click title or pencil icon → pre-filled dialog → PATCH
- **Delete task**: trash icon with confirm dialog → soft DELETE
- **Priority badges**: color-coded (red HIGH, yellow MEDIUM, gray LOW)
- **Entity links**: LEAD/CUSTOMER tasks link to detail pages
- **Overdue indicator**: red "Quá hạn" badge when PENDING + past due
- **From-note task creation**: checkbox in lead note dialog → auto-creates linked task

### Phase 17: Frontend Polish — Dashboard, Pagination, Distribution UI (2026-03-28)

#### Added
- **Dashboard Stats API**: `GET /dashboard/stats` with role-based filtering (8 KPIs)
- **Dashboard KPI Cards**: Real data — new leads, in progress, converted, monthly revenue, total customers, orders, pending payments, overdue tasks
- **Cursor Pagination**: "Tải thêm" controls on leads, customers, orders, users list pages
- **AI Distribution Config UI**: Department-based weight config (workload/level/conversion), scores preview, batch auto-distribute button
- **Pagination Controls**: Reusable component with URL-based cursor state
- Sidebar nav: added "Phân phối AI" link (SUPER_ADMIN/MANAGER)

### Phase 16: Missing Features Gap Fill (2026-03-28)

#### Backend
- **File Upload Controller**: `POST /files/upload` (multipart) + `GET /files/*` (serve static)
- **Assignment Templates CRUD**: Create/update/delete templates with member lists, round-robin apply to POOL/FLOATING leads
- **Recall Config CRUD**: Auto-recall cron (every 2h) moves stale leads/customers to FLOATING + auto-label

#### Frontend
- **Global Search**: Debounced search bar in header with grouped results dropdown (leads/customers/orders)
- **Notifications**: Bell icon with unread count badge, 30s polling, mark read/all, dropdown list
- **Tasks Page**: Create dialog, complete/cancel actions, filter tabs (Tất cả/Đang chờ/Hoàn thành/Đã hủy)
- **CSV Import**: Drag-drop upload zones, job status polling (3s), import history table
- **CSV Export**: Export buttons on leads, customers, orders list pages
- Sidebar nav: added "Công việc" link

### Phase 15: Frontend CRUD Implementation (2026-03-28)

#### Added
- Full CRUD UI for all CRM entities (previously read-only)
- shadcn/ui components: Dialog, Select, Textarea, AlertDialog, DropdownMenu, Tabs, Badge
- Sonner toast notifications on all mutations
- Reusable form infrastructure: useFormAction hook, ConfirmDialog, FormField
- **Settings CRUD**: Tabbed page with create/edit/delete for departments, employee levels, lead sources, payment types, labels (color picker)
- **Users Management**: List/create/edit/deactivate users (SUPER_ADMIN) with department/team cascading dropdowns
- **Leads CRUD**: Create/edit form + action bar (assign, claim, transfer, convert, status change, label management, add notes)
- **Customers CRUD**: Create/edit form + action bar (claim, transfer, reactivate, labels)
- **Products CRUD**: Dialog-based create/edit/delete with price, VAT, category
- **Orders**: Status change dialog, create order from customer detail with product auto-fill
- **Payments**: Create payment, verify/reject buttons for pending payments (MANAGER+)
- Role-based button visibility across all pages
- "Quản lý NV" sidebar nav item for SUPER_ADMIN

### Phase 14: Testing & Deployment (2026-03-28)

#### Added
- API Dockerfile (multi-stage: deps → build → production)
- Full monorepo build verification: all 5 packages compile
- All 14 phases completed, 172h planned implementation

### Phase 12-13: Advanced Features (2026-03-28)

#### Phase 12: AI Lead Distribution
- Weighted scoring: workload (30%) + level (30%) + conversion rate (40%)
- Auto-distribution service: pick best user for lead assignment
- Batch distribution for department pools
- Config CRUD per department (toggle on/off, weight config)
- Score preview endpoint

#### Phase 13: Tasks, Search, Notifications
- Tasks CRUD: create, complete, cancel with priority and due dates
- Task reminders: cron every 5min, creates notification
- Global search: across leads, customers, orders (name/phone/email)
- Notifications: list, unread count, mark read, mark all read
- Notification creation service (injectable by other modules)

### Phase 09-11: Frontend Pages (2026-03-28)

#### Phase 09: Leads & Customers
- Lead list page with table (name, phone, status, source, user, date)
- Lead detail page: info panel + labels + activity timeline
- Kho Mới page (POOL, dept=null, manager+)
- Kho Thả Nổi page (FLOATING, all users)
- Customer list page with table
- Customer detail: info + labels + leads + orders + timeline

#### Phase 10: Orders, Products, Settings
- Orders list with table (customer, product, total, status, date)
- Order detail: info + payments list
- Products grid with price cards
- Call logs table with match status
- Settings page: departments, levels, sources, labels, payment types
- Import page placeholder (CSV upload zones)

#### Phase 11: Dashboard
- Dashboard home with KPI placeholder cards
- Shared components: StatusBadge, DataTableSkeleton

### Phase 08: Frontend Layout & Auth UI (2026-03-28)

#### Added
- Login page: email/password form, error handling, redirect after login
- Auth API proxy route: login/refresh/logout with httpOnly cookie management
- Auth middleware: redirect unauthenticated to /login, redirect logged-in from /login
- Auth provider: server-side user fetch, client-side context
- App shell: collapsible sidebar + header with user menu
- Sidebar navigation: Vietnamese labels, role-based visibility, active state
- shadcn/ui components: Button, Input, Card, Label (no barrel imports)
- Utility functions: cn(), formatVND(), formatDate(), formatNumber()
- Dashboard placeholder with KPI cards

#### Config
- Default ports changed: API 3010, Web 3011 (avoid NocoDB conflict)

### Phase 07: Data Import & Third-Party API (2026-03-28)

#### Added
- CSV import: BullMQ background processing, stream parsing, progress tracking
- ImportJob model with status tracking (PROCESSING/COMPLETED/FAILED)
- Lead import: phone normalization, dedup (phone+source+product), auto-create customer
- Customer import: phone dedup, validation
- Error report CSV generation for failed rows
- CSV export: leads, customers, orders with formula injection prevention
- Third-party lead ingestion API (POST /external/leads)
- BullMQ queue configuration with Redis connection

### Phase 06: Activity Timeline & Call Integration (2026-03-28)

#### Added
- Activities module: create notes, get timeline (cursor paginated) for leads/customers
- System auto-log on status changes, assignments, label changes, payments
- CallLogs module: ingest from 3rd party, auto-match by phone to lead/customer
- Auto IN_PROGRESS trigger on first note or matched call for ASSIGNED leads
- Unmatched call queue with manual match (manager+)
- FileUpload service: local filesystem, UUID filenames, MIME validation, 10MB max

### Phase 05: Products, Orders & Payments (2026-03-28)

#### Added
- ProductCategories CRUD (manager+)
- Products CRUD with Decimal prices, VAT rate, category FK
- PaymentTypes CRUD (lookup: CK lần 1-4, CK full, COD, Tiền mặt)
- Orders CRUD: create (auto-calc VAT), status transitions (PENDING→CONFIRMED→COMPLETED/CANCELLED/REFUNDED)
- Payments: create (PENDING), verify manual (manager+), reject
- Payment auto-match with bank transactions (exact amount + content substring)
- BankTransactions: webhook ingest (dedup by external_id), list, manual match
- PaymentMatching service: auto-match on create, conversion trigger
- Conversion trigger: total verified payments >= order.totalAmount → lead CONVERTED
- Auto IN_PROGRESS trigger when order created for ASSIGNED lead

### Phase 04: Core CRM — Leads & Customers (2026-03-28)

#### Added
- Leads CRUD: create (auto-link customer), list, detail, update, soft delete
- 3 Kho system: Kho Mới (POOL+dept=null), Kho Phòng Ban (POOL+dept=X), Kho Thả Nổi (FLOATING)
- Lead status machine: POOL→ASSIGNED→IN_PROGRESS→CONVERTED|LOST→FLOATING
- Lead assign (manager+), claim (atomic), transfer (DEPARTMENT/FLOATING/UNASSIGN)
- Lead convert to customer (IN_PROGRESS→CONVERTED, auto-create/update customer)
- Auto IN_PROGRESS trigger on first activity
- Customers CRUD: create (phone dedup), list, search by phone, detail, update
- Customer claim, transfer (DEPARTMENT/FLOATING/INACTIVE), reactivate
- Lead Sources CRUD (lookup table, super_admin)
- Labels CRUD + attach/detach on leads and customers
- Phone normalization + validation on all inputs
- Phone field-level permission (manager+ only)
- Assignment history logging on all assignment/transfer operations
- Activity logging on status changes

#### Business Logic
- Lead creation: normalize phone → find/create customer → POOL (Kho Mới)
- LOST→FLOATING (not reopen to POOL)
- Workspace packages now build to dist/ for CJS runtime compatibility

### Phase 03: Authentication & User Management (2026-03-28)

#### Added
- JWT auth: login, refresh token rotation, logout
- Account lockout: 5 failed attempts → 15min lock
- RBAC: @Roles decorator + global guard (SUPER_ADMIN, MANAGER, USER)
- Global JWT guard with @Public() bypass
- Users CRUD: list (cursor pagination), create, update profile, admin update, deactivate
- User deactivation cascade: unassign leads/customers to dept pool + log history
- Departments CRUD: list with user count, create, update, soft delete
- Employee Levels CRUD: list ordered by rank, full CRUD
- Teams CRUD: create with leader validation, update, soft delete
- Common infrastructure: BigInt transform interceptor, HTTP exception filter, ParseBigInt pipe
- Validation: class-validator DTOs with whitelist, separate profile vs admin update DTOs
- Rate limiting: @nestjs/throttler (100 req/min general, 5 req/min auth)
- Token revocation on: password change, deactivation, role change

#### Security
- bcrypt cost 12 for passwords
- SHA-256 hashed refresh tokens in DB
- No user enumeration (generic auth errors)
- Mass assignment prevention (separate DTOs)
- Pino log redaction for auth headers, passwords, tokens

### Phase 02: Database Schema & Prisma Setup (2026-03-28)

#### Added
- Full Prisma 6 schema: 30 tables, 10 enums, 90 indexes
- Models: User, Department, Team, EmployeeLevel, ManagerDepartment
- Models: Customer, Lead, LeadSource, Product, ProductCategory, Order, Payment, PaymentType
- Models: BankTransaction, Label, LeadLabel, CustomerLabel
- Models: Activity, ActivityAttachment, Document, CallLog
- Models: AssignmentHistory, AssignmentTemplate, AiDistributionConfig, RecallConfig
- Models: Task, RefreshToken, ApiKey, Notification
- BIGINT IDENTITY PKs, soft delete (deletedAt), snake_case mappings
- 20 raw SQL indexes: partial (WHERE deleted_at IS NULL), GIN (JSONB, FTS)
- Soft-delete Prisma extension (auto-filter on findMany/findFirst/count)
- Seed script: 6 users, 3 depts, 2 teams, 20 leads, 5 customers, 3 orders
- Docker ports: PG 5433, Redis 6380 (avoid conflicts)

### Phase 01: Monorepo Setup & Dev Environment (2026-03-27)

#### Added
- Turborepo monorepo with pnpm workspaces
- NestJS 11 API app (port 3001, `/api/v1` prefix, Pino logger, CORS, health endpoint)
- Next.js 15 web app (port 3000, Tailwind CSS 4, Turbopack dev)
- `@crm/database` package: Prisma 6 scaffold, PrismaClient singleton
- `@crm/types` package: BigIntString, ApiResponse, ApiErrorResponse
- `@crm/utils` package: phone normalization (VN format), CSV sanitizer
- Docker Compose: PostgreSQL 16 + Redis 7
- ESLint 9 flat config + Prettier
- API client skeleton (`api-client.ts`) for frontend
- `uploads/` directory for file storage

#### Infrastructure
- TypeScript strict mode, ES2022 target
- `pnpm build` compiles all 5 packages
- `pnpm lint` passes across workspace
- `pnpm dev` starts API + Web concurrently

### Planning Phase (2026-03-27)

#### Added
- Project planning: 14 phases, 172h total effort
- Implementation plan with detailed phase files
- Design guidelines: sky blue + white, glassmorphism, responsive
- Documentation suite: PDR, code standards, architecture, roadmap, deployment guide
- CLAUDE.md project instructions

#### Decisions Made
- 3 Kho lead system: Kho Mới, Kho Phòng Ban, Kho Thả Nổi
- Lead status: POOL, ASSIGNED, IN_PROGRESS, CONVERTED, LOST, FLOATING
- Customer status: ACTIVE, INACTIVE, FLOATING
- Payment: hybrid verification (auto-match webhook + batch cron 2h + manual)
- Partial payments support (CK lần 1/2/3/4/full)
- Assignment templates: round-robin vòng lặp, chọn người cụ thể
- Auto-recall: dept pool quá X ngày → FLOATING + auto labels
- Tasks/todo: quick add bar, smart time parsing, reminder escalation
- IN_PROGRESS: auto-trigger on first activity
- LOST → FLOATING (not reopen to POOL)
- Dedup: chỉ CSV import (SĐT+nguồn+sản phẩm)
- Order cancel/refund: không revert CONVERTED
- Transfer permission: user đang giữ + manager + super_admin
- File storage: local filesystem, no MinIO/S3
- Timezone: UTC storage, Asia/Ho_Chi_Minh display

---

*Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)*
