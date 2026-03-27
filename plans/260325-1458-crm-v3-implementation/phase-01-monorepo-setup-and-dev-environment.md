---
phase: 1
title: "Monorepo Setup & Dev Environment"
status: completed
priority: P0
effort: 8h
---

# Phase 01: Monorepo Setup & Dev Environment

## Context Links

- Brainstorm architecture: `plans/reports/brainstorm-260325-1224-internal-crm-system-design.md` (line 19-32)
- Research synthesis structure: `plans/reports/review-260325-1353-research-reports-synthesis.md` (line 83-95)

## Overview

Bootstrap Turborepo monorepo with NestJS 11 API app, Next.js 16 web app, shared packages (database, types, utils), Docker Compose for PostgreSQL, and shared tooling config.

## Requirements

### Functional
- pnpm workspaces with Turborepo orchestration
- NestJS 11 API app on port 3001
- Next.js 16 web app on port 3000
- Shared packages: `database`, `types`, `utils`
- Docker Compose: PostgreSQL 16
- Create `uploads/` directory in project root for file storage
- Add `uploads/` to .gitignore
- No MinIO/S3 needed — local filesystem for CSV imports and attachments
- Hot reload in dev for both apps

### Non-Functional
- TypeScript strict mode across all packages
- ESLint + Prettier shared config
- Node 20+ enforced via `engines` field
- pnpm 9+ enforced via `packageManager` field

## Architecture

```
crm-v3/
├── apps/
│   ├── api/                    # NestJS 11
│   │   ├── src/
│   │   │   ├── app.module.ts
│   │   │   ├── app.controller.ts
│   │   │   ├── main.ts
│   │   │   └── common/         # Guards, interceptors, filters, decorators
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── web/                    # Next.js 16
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx
│       │   │   └── page.tsx
│       │   └── lib/            # API client, auth helpers
│       ├── next.config.ts
│       ├── tsconfig.json
│       ├── tailwind.config.ts
│       └── package.json
├── packages/
│   ├── database/               # Prisma schema + migrations
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   └── index.ts        # Re-export PrismaClient
│   │   ├── tsconfig.json
│   │   └── package.json
│   ├── types/                  # Shared DTOs, interfaces, enums
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   └── utils/                  # Shared utilities
│       ├── src/
│       │   ├── index.ts
│       │   └── phone.ts        # Phone normalization (VN format)
│       ├── tsconfig.json
│       └── package.json
├── docker-compose.yml
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .eslintrc.js
├── .prettierrc
├── .env.example
├── .gitignore
└── .nvmrc
```

## Related Code Files

### Create
- `package.json` — root workspace config
- `pnpm-workspace.yaml` — workspace definitions
- `turbo.json` — pipeline config (build, dev, lint, db:generate)
- `tsconfig.base.json` — shared TS config
- `.eslintrc.js` — shared ESLint rules
- `.prettierrc` — Prettier config
- `.env.example` — environment template
- `.gitignore` — standard Node + Prisma ignores
- `.nvmrc` — Node version pin
- `docker-compose.yml` — PG 16 service
- `apps/api/package.json` + NestJS bootstrap files
- `apps/web/package.json` + Next.js bootstrap files
- `packages/database/package.json` + Prisma scaffold
- `packages/types/package.json` + barrel export
- `packages/utils/package.json` + phone.ts

## Implementation Steps

1. **Initialize root workspace**
   - `pnpm init` at root
   - Create `pnpm-workspace.yaml` with `apps/*` and `packages/*`
   - Add `turbo.json` with pipelines: `build`, `dev`, `lint`, `db:generate`, `db:push`
   - Add `tsconfig.base.json` with strict mode, paths, ES2022 target

2. **Create NestJS API app**
   - `cd apps && npx @nestjs/cli new api --package-manager pnpm --skip-git`
   - Update to NestJS 11, remove default test files
   - Configure `tsconfig.json` extending `../../tsconfig.base.json`
   - Add `src/main.ts` with CORS enabled, global prefix `/api/v1`, port 3001
   - Add Pino logger (`nestjs-pino`)
   - Add `src/common/` directory skeleton

3. **Create Next.js web app**
   - `cd apps && npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir`
   - Configure Tailwind 4, shadcn/ui init
   - Add `src/lib/api-client.ts` skeleton (fetch wrapper for NestJS API)
   - Update `next.config.ts` with API proxy rewrite to `localhost:3001`

4. **Create shared packages**
   - `packages/database/`: Prisma scaffold with `schema.prisma` (empty model, generator + datasource only)
   - `packages/types/`: barrel `index.ts`, shared enums
   - `packages/utils/`: phone normalization function, `index.ts`

5. **Docker Compose setup**
   - PostgreSQL 16 service: port 5432, volume for data persistence
   - Network: `crm-network`
   - Create `uploads/` directory in project root for file storage
   - Add `uploads/` to .gitignore
   - No MinIO/S3 needed — local filesystem for CSV imports and attachments

6. **Environment configuration**
   - `.env.example` with: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `UPLOAD_DIR`, `API_PORT`, `NEXT_PUBLIC_API_URL`
   - Root `.env` (gitignored) with dev defaults

7. **Verify dev workflow**
   - `pnpm install` succeeds
   - `docker compose up -d` starts PG
   - `pnpm dev` starts both apps with hot reload
   - `pnpm build` compiles both apps
   - `pnpm lint` runs ESLint across workspace

## Todo List

- [ ] Initialize root package.json + pnpm-workspace.yaml
- [ ] Create turbo.json with pipelines
- [ ] Create tsconfig.base.json (strict, ES2022)
- [ ] Scaffold NestJS 11 API app
- [ ] Scaffold Next.js 16 web app with Tailwind 4
- [ ] Init shadcn/ui in web app
- [ ] Create packages/database with Prisma scaffold
- [ ] Create packages/types with barrel exports
- [ ] Create packages/utils with phone normalization
- [ ] Write docker-compose.yml (PG 16)
- [ ] Create uploads/ directory + add to .gitignore
- [ ] Create .env.example
- [ ] Configure ESLint + Prettier
- [ ] Verify `pnpm dev` runs both apps
- [ ] Verify `pnpm build` succeeds
- [ ] Create .gitignore + .nvmrc

## Success Criteria

- `pnpm dev` starts API on :3001 and web on :3000 simultaneously
- `docker compose up -d` provisions PG
- `pnpm build` compiles all apps and packages without errors
- Packages are importable across apps (e.g., `import { ... } from '@crm/types'`)
- TypeScript strict mode active, no `any` in shared packages

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Turborepo cache invalidation issues | Low | Pin turbo version, clear cache on issues |
| pnpm workspace resolution conflicts | Medium | Use `catalog:` for shared deps, strict peer deps |
| Next.js 16 breaking changes | Medium | Check migration guide, pin version |
| Docker networking on Windows | Low | Use `host.docker.internal` if needed |
