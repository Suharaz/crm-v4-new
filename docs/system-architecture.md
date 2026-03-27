# System Architecture

## Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                               │
│  Browser (Next.js)  │  Mobile Browser  │  3rd Party APIs    │
└─────────┬───────────┴────────┬─────────┴────────┬───────────┘
          │                    │                   │
          ▼                    ▼                   ▼
┌─────────────────────────────────────────────────────────────┐
│                     NGINX (Reverse Proxy)                    │
│              SSL termination, load balancing                 │
├────────────────────────┬────────────────────────────────────┤
│  / → Next.js :3000     │  /api → NestJS :3001              │
└────────────┬───────────┴──────────────┬─────────────────────┘
             │                          │
             ▼                          ▼
┌────────────────────┐    ┌──────────────────────────────────┐
│  Next.js 16        │    │  NestJS 11                        │
│  (Frontend)        │    │  (API Server)                     │
│                    │    │                                    │
│  Server Components │    │  Controller → Service → Repo      │
│  Client Components │    │  Guards, Interceptors, Filters    │
│  API Route (auth   │───→│  JWT Auth, RBAC                   │
│   cookie proxy)    │    │  BullMQ Workers                   │
│                    │    │  Cron Jobs (reminder, recall,      │
│  shadcn/ui         │    │             cleanup, batch match) │
│  Tailwind 4        │    │                                    │
└────────────────────┘    └──────┬──────────────┬─────────────┘
                                 │              │
                    ┌────────────┘              └──────────┐
                    ▼                                      ▼
          ┌──────────────────┐                   ┌──────────────┐
          │  PostgreSQL 16   │                   │  Redis 7     │
          │                  │                   │              │
          │  Prisma ORM      │                   │  BullMQ jobs │
          │  31 tables       │                   │  AOF persist │
          │  43+ indexes     │                   └──────────────┘
          │  FTS (GIN)       │
          │  Soft delete     │
          └──────────────────┘
```

## Data Flow

### Authentication

```
Browser → POST /api/auth/login (Next.js API Route)
  → Proxy to NestJS POST /auth/login
  → NestJS validates credentials, returns JWT + refresh token
  → Next.js API Route sets httpOnly cookies
  → Browser receives cookies (no JS access)

Subsequent requests:
  Browser → Next.js Server Component → reads cookie → adds Authorization header
  → NestJS validates JWT → returns data

Token refresh:
  NestJS returns 401 → API client auto-calls /auth/refresh
  → New tokens → retry original request
```

### Lead Lifecycle

```
Input (CSV/Manual/API) → Kho Mới (POOL, dept=null)
  → Manager phân phối → Kho Phòng Ban (POOL, dept=X)
  → Sale claim/assign → Kho Cá Nhân (ASSIGNED)
  → Sale tạo note/gọi → IN_PROGRESS (auto)
  → Chốt deal → Order + Payment → CONVERTED → Customer
  → Transfer → Kho Phòng Ban đích hoặc Kho Thả Nổi
  → LOST → FLOATING (kho thả nổi)
  → Auto-recall (dept pool quá X ngày) → FLOATING
```

### Payment Verification

```
Sale tạo payment (PENDING)
  ↕ Auto-match
Webhook bank transaction (UNMATCHED)
  → Match: amount + content khớp → auto-verify
  → Miss: cron 2h fuzzy match retry
  → Still miss: manager verify thủ công
  → Tổng verified >= order amount → Lead CONVERTED
```

## Module Dependency Graph

```
AppModule
├── AuthModule (JWT, Passport, guards)
├── UsersModule
├── DepartmentsModule
├── EmployeeLevelsModule
├── TeamsModule
├── CustomersModule ← LabelsModule
├── LeadsModule ← LabelsModule, CustomersModule
├── LeadSourcesModule
├── ProductsModule ← ProductCategoriesModule
├── OrdersModule ← LeadsModule, CustomersModule, ProductsModule
├── PaymentsModule ← OrdersModule, LeadsModule (conversion trigger)
│   └── PaymentMatchingService (shared)
├── BankTransactionsModule ← PaymentMatchingService
├── PaymentTypesModule
├── ActivitiesModule (exported, injected by leads/payments)
├── CallLogsModule ← ActivitiesModule
├── FileUploadModule
├── ImportModule (BullMQ) ← LeadsModule, CustomersModule
├── ExportModule ← LeadsModule, CustomersModule, OrdersModule
├── ThirdPartyApiModule ← LeadsModule
├── DistributionModule ← LeadsModule (AI scoring)
├── TransfersModule ← CustomersModule, LeadsModule
├── SearchModule ← LeadsModule, CustomersModule, OrdersModule
├── NotificationsModule (exported, injected by many)
├── TasksModule ← NotificationsModule
├── AnalyticsModule
└── HealthModule
```

## Cron Jobs

| Job | Schedule | Description |
|-----|----------|-------------|
| Refresh token cleanup | Daily 3 AM | Delete expired/revoked tokens >30 days |
| Payment batch match | Every 2h | Fuzzy match PENDING payments ↔ UNMATCHED bank TX |
| Auto-recall | Daily 1 AM | Dept pool leads/customers >X days → FLOATING + labels |
| Task reminder | Every 5 min | Send notification for due tasks (1 time via remindedAt flag) |
| Task escalation | Every 30 min | Overdue 1h → notify user, 24h → notify manager |
| Notification cleanup | Daily 4 AM | Delete read >90 days, all >180 days |

## Database Schema Overview

### Entity Counts

- **Auth:** User, RefreshToken, ApiKey (3)
- **Organization:** Department, Team, ManagerDepartment, EmployeeLevel (4)
- **CRM Core:** Customer, Lead, LeadSource, Label, LeadLabel, CustomerLabel (6)
- **Commerce:** Product, ProductCategory, Order, Payment, PaymentType, BankTransaction (6)
- **Activity:** Activity, ActivityAttachment, Document, CallLog, AssignmentHistory (5)
- **Distribution:** AiDistributionConfig, AssignmentTemplate, AssignmentTemplateMember, RecallConfig (4)
- **System:** ImportJob, Notification, Task (3)
- **Total: 31 tables**

### Enums (10)

UserRole, UserStatus, LeadStatus, CustomerStatus, OrderStatus, PaymentStatus,
CallType, MatchStatus, EntityType, ActivityType, TaskStatus, TaskPriority,
ImportStatus, VerifiedSource

## Infrastructure

### Development

```
Docker Compose: PostgreSQL 16 + Redis 7
Turborepo: parallel build, dev, lint
Hot reload: NestJS (webpack HMR) + Next.js (Fast Refresh)
```

### Production

```
nginx → NestJS (2 replicas) + Next.js (standalone)
PostgreSQL 16 (persistent volume)
Redis 7 (AOF persistence)
uploads/ (volume mount, local filesystem)
pg_dump cron (7 daily + 4 weekly backups)
GitHub Actions CI/CD
UptimeRobot monitoring
```
