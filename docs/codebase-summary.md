# Codebase Summary

> Auto-updated document. Reflects current state of implementation.

## Status: Pre-Implementation

Codebase chưa có code. Chỉ có plans và docs.

## Structure

```
crm-v4/
├── apps/
│   ├── api/                    # NestJS 11 — chưa tạo
│   └── web/                    # Next.js 16 — chưa tạo
├── packages/
│   ├── database/               # Prisma — chưa tạo
│   ├── types/                  # Shared types — chưa tạo
│   └── utils/                  # Utilities — chưa tạo
├── docs/                       # Documentation ✅
├── plans/                      # Implementation plans ✅
├── CLAUDE.md                   # Project instructions ✅
└── (package.json, turbo.json, etc. — chưa tạo)
```

## Implementation Progress

| Phase | Name | Status | Progress |
|-------|------|--------|----------|
| 01 | Monorepo Setup | Pending | 0% |
| 02 | Database Schema | Pending | 0% |
| 03 | Auth & User Management | Pending | 0% |
| 04 | Core CRM: Leads & Customers | Pending | 0% |
| 05 | Products, Orders & Payments | Pending | 0% |
| 06 | Activity Timeline & Call Integration | Pending | 0% |
| 07 | Data Import & Third-Party API | Pending | 0% |
| 08 | Frontend Layout & Auth UI | Pending | 0% |
| 09 | Frontend Leads & Customers | Pending | 0% |
| 10 | Frontend Orders, Payments & Settings | Pending | 0% |
| 11 | Frontend Analytics Dashboard | Pending | 0% |
| 12 | AI Lead Distribution | Pending | 0% |
| 13 | Tasks, Transfer & Advanced Features | Pending | 0% |
| 14 | Testing & Deployment | Pending | 0% |

## Key Files (to be created)

### Backend
- `apps/api/src/main.ts` — NestJS entry point
- `apps/api/src/app.module.ts` — Root module
- `apps/api/src/common/` — Guards, interceptors, filters, pipes
- `apps/api/src/modules/` — Feature modules

### Frontend
- `apps/web/src/app/layout.tsx` — Root layout
- `apps/web/src/middleware.ts` — Auth middleware
- `apps/web/src/lib/api-client.ts` — API client
- `apps/web/src/components/` — UI components

### Shared
- `packages/database/prisma/schema.prisma` — Database schema
- `packages/types/src/index.ts` — Shared types
- `packages/utils/src/phone.ts` — Phone normalization
