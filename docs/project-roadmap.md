# Project Roadmap

## Timeline Overview

**Total effort:** 172h across 14 phases
**Start:** 2026-03-27
**Plan:** `plans/260325-1458-crm-v3-implementation/plan.md`

## Phase Dependencies

```
Phase 01 (Monorepo) ─── blocks ALL
    │
    ▼
Phase 02 (Schema) ───── blocks 03-07
    │
    ▼
Phase 03 (Auth) ─────── blocks 04-07
    │
    ├──→ Phase 04 (Leads/Customers) ──┐
    ├──→ Phase 05 (Orders/Payments) ──┤ parallel
    ├──→ Phase 06 (Activity/Calls) ───┤
    └──→ Phase 07 (Import/Export) ────┘
                                       │
Phase 08 (Frontend Shell) ────────── blocks 09-11
    │
    ├──→ Phase 09 (Frontend Leads/Customers) ──┐
    ├──→ Phase 10 (Frontend Orders/Settings) ──┤ parallel
    └──→ Phase 11 (Frontend Dashboard) ────────┘
                                                │
Phase 12 (AI Distribution) ← depends on 04     │
Phase 13 (Tasks/Transfer) ← depends on 04,05   │
                                                │
Phase 14 (Testing/Deploy) ← runs LAST ─────────┘
```

## Phases

| # | Phase | Effort | Status | Progress |
|---|-------|--------|--------|----------|
| 01 | Monorepo Setup & Dev Environment | 8h | Complete | 100% |
| 02 | Database Schema & Prisma Setup | 12h | Complete | 100% |
| 03 | Authentication & User Management | 14h | Complete | 100% |
| 04 | Core CRM: Leads & Customers | 16h | Complete | 100% |
| 05 | Products, Orders & Payments + Bank Webhook | 16h | Complete | 100% |
| 06 | Activity Timeline & Call Integration | 12h | Complete | 100% |
| 07 | Data Import & Third-Party API | 10h | Complete | 100% |
| 08 | Frontend Layout & Auth UI | 10h | Pending | 0% |
| 09 | Frontend Leads & Customers Pages | 14h | Pending | 0% |
| 10 | Frontend Orders, Payments & Settings | 10h | Pending | 0% |
| 11 | Frontend Analytics Dashboard | 10h | Pending | 0% |
| 12 | AI Lead Distribution | 8h | Pending | 0% |
| 13 | Tasks, Transfer & Advanced Features | 16h | Pending | 0% |
| 14 | Testing & Deployment | 12h | Pending | 0% |

## Milestones

### M1: Foundation (Phase 01-03) — 34h
- Monorepo running, DB schema applied, auth working
- User/Dept/Team/Level CRUD operational
- **Gate:** `pnpm dev` runs, login works, RBAC enforced

### M2: Core Backend (Phase 04-07) — 54h
- Full lead lifecycle working (POOL → CONVERTED)
- Payment hybrid verification operational
- Call log ingestion + auto-match
- CSV import/export working
- **Gate:** Complete lead flow testable via Postman

### M3: Frontend (Phase 08-11) — 44h
- App shell with sidebar, auth, responsive
- All CRUD pages operational
- Dashboard with analytics
- **Gate:** End-to-end flow testable in browser

### M4: Advanced (Phase 12-13) — 24h
- AI lead distribution
- Tasks/todo system
- Transfer + claim + auto-recall
- Global search + notifications
- **Gate:** All business features operational

### M5: Production (Phase 14) — 12h
- Tests passing (>80% coverage services)
- Docker production build
- CI/CD pipeline
- **Gate:** Deploy to VPS, health check OK

## Changelog

> Updated after each phase completion

### 2026-03-27
- Project planning completed
- 14 phases defined, 172h total
- Design guidelines created
- Documentation initialized
