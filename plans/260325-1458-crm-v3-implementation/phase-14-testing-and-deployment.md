---
phase: 14
title: "Testing & Deployment"
status: pending
priority: P1
effort: 12h
depends_on: [1-13]
---

# Phase 14: Testing & Deployment

## Context Links

- Deploy: VPS + Docker Compose (brainstorm line 17)
- Success metrics: brainstorm (line 359-366)

## Overview

Comprehensive testing (unit, integration, E2E), Docker production build, deployment configuration. Ensure all success metrics met before production release.

## Requirements

### Functional
- Unit tests for services (business logic)
- Integration tests for API endpoints (with test DB)
- E2E tests for critical user flows
- Docker multi-stage build for production
- Docker Compose production config
- Database backup strategy
- Health check endpoints

### Non-Functional
- Test coverage >80% on services
- E2E covers: login, create lead, assign, convert, payment verify, transfer, claim
- Docker image size optimized (<500MB per app)
- Zero-downtime deployment strategy
- Automated DB migration on deploy

## Architecture

### Test Structure
```
apps/api/
├── test/
│   ├── setup.ts                    # Test DB setup, cleanup
│   ├── helpers/
│   │   ├── test-app.ts             # NestJS testing module factory
│   │   ├── auth-helper.ts          # Generate test JWT tokens
│   │   └── seed-helper.ts          # Quick seed for tests
│   ├── unit/
│   │   ├── auth.service.spec.ts
│   │   ├── leads.service.spec.ts
│   │   ├── payments.service.spec.ts
│   │   ├── scoring.service.spec.ts
│   │   └── phone.util.spec.ts
│   ├── integration/
│   │   ├── auth.e2e-spec.ts
│   │   ├── leads.e2e-spec.ts
│   │   ├── orders.e2e-spec.ts
│   │   ├── payments.e2e-spec.ts
│   │   ├── import.e2e-spec.ts
│   │   └── transfer.e2e-spec.ts
│   └── e2e/
│       └── critical-flows.e2e-spec.ts

apps/web/
├── __tests__/
│   ├── components/
│   │   ├── login-form.test.tsx
│   │   ├── lead-table.test.tsx
│   │   └── data-table.test.tsx
│   └── lib/
│       ├── api-client.test.ts
│       └── phone.test.ts
```

### Docker Production
```
docker/
├── api.Dockerfile              # NestJS multi-stage build
├── web.Dockerfile              # Next.js multi-stage build
├── nginx.conf                  # Reverse proxy config
└── docker-compose.prod.yml     # Production compose

# api.Dockerfile stages:
# 1. deps: pnpm install --frozen-lockfile
# 2. build: pnpm build --filter=api
# 3. prod: copy dist + node_modules, run node dist/main.js

# web.Dockerfile stages:
# 1. deps: pnpm install --frozen-lockfile
# 2. build: pnpm build --filter=web
# 3. prod: copy .next/standalone, run node server.js
```

### Production Stack
```
docker-compose.prod.yml:
├── nginx        (reverse proxy, SSL termination)
├── api          (NestJS, 2 replicas via nginx upstream)
├── web          (Next.js standalone)
├── postgres     (PostgreSQL 16, persistent volume)
├── redis        (Redis 7, for BullMQ, AOF persistence enabled)
└── backup       (pg_dump cron job)
```
**Note:** NO MinIO — file storage uses local filesystem (`uploads/` volume mount). Redis uses AOF persistence to survive restarts (job queue data is ephemeral but AOF prevents unnecessary loss).

## Related Code Files

### Create
- `apps/api/test/` — all test files
- `apps/web/__tests__/` — frontend tests
- `docker/api.Dockerfile`
- `docker/web.Dockerfile`
- `docker/nginx.conf`
- `docker/docker-compose.prod.yml`
- `scripts/backup.sh` — DB backup script
- `scripts/deploy.sh` — deployment script
- `apps/api/src/modules/health/` — health check module

### Modify
- `turbo.json` — add test pipeline
- `package.json` — add test scripts
- `apps/api/package.json` — add jest config

## Implementation Steps

1. **Set up test infrastructure**
   - Configure Jest for NestJS (`@nestjs/testing`)
   - Configure Jest for Next.js (jest + @testing-library/react)
   - Test database: separate `DATABASE_URL_TEST` pointing to test schema
   - `test/setup.ts`: create test DB, run migrations, cleanup between tests
   - `test/helpers/test-app.ts`: factory for creating NestJS testing module with real DB

2. **Write unit tests for critical services**
   - `auth.service.spec.ts`: login, token generation, refresh rotation, logout
   - `leads.service.spec.ts`: create (dedup), assign (state machine), convert
   - `payments.service.spec.ts`: verify (triggers conversion), reject
   - `scoring.service.spec.ts`: score calculation with known inputs
   - `phone.util.spec.ts`: normalization edge cases (VN formats, invalid input)

3. **Write integration tests**
   - `auth.e2e-spec.ts`: full login/refresh/logout flow via HTTP
   - `leads.e2e-spec.ts`: CRUD, pool, assign, convert via HTTP with auth
   - `orders.e2e-spec.ts`: create order, create payment, verify payment
   - `payments.e2e-spec.ts`: verify triggers conversion, reject flow
   - `import.e2e-spec.ts`: upload CSV, check job status, verify imported data
   - `transfer.e2e-spec.ts`: transfer + claim flow

4. **Write E2E critical flow test**
   - Single test covering: login → create lead → assign → start work → create order → create payment → verify → convert → transfer → claim
   - Validates entire business workflow

5. **Write frontend component tests**
   - Login form: renders, submits, shows errors
   - Lead table: renders data, filters work
   - Data table: pagination, sorting

6. **Create health check endpoint**
   - `GET /health` — returns DB connection status, Redis status, disk space for uploads/
   - Used by Docker health check and monitoring
   - NO MinIO check — using local filesystem

7. **Create Docker production builds**
   - `api.Dockerfile`: multi-stage (deps → build → prod), ~200MB final image
   - `web.Dockerfile`: multi-stage with Next.js standalone output, ~150MB
   - `nginx.conf`: reverse proxy API (/api → api:3001) + Web (/ → web:3000)
   - SSL via Let's Encrypt (certbot sidecar or pre-configured)

8. **Create docker-compose.prod.yml**
   - All services with resource limits
   - Persistent volumes for PG, Redis, uploads/
   - Health checks on all services
   - Restart policies
   - Environment variables from `.env.production`

9. **Create deployment scripts**
   - `scripts/deploy.sh`:
     - Pull latest code
     - Build images
     - Run DB migration (`npx prisma migrate deploy`)
     - Rolling restart (web + api)
   - `scripts/backup.sh`:
     - `pg_dump` to compressed file
     - Rotate backups (keep 7 daily, 4 weekly)
     - Optional: upload to external storage

10. **Create CI/CD pipeline (GitHub Actions)**
    - `.github/workflows/ci.yml`:
      - Trigger: push to main, pull requests
      - Jobs: lint → test (unit + integration with PG service container) → build
      - Cache: pnpm store, turbo cache
      - Secrets: DATABASE_URL_TEST, JWT_SECRET (test values)
    - `.github/workflows/deploy.yml`:
      - Trigger: push to main (after CI passes)
      - Steps: SSH to VPS → pull → build images → migrate → rolling restart
      - Or: build images in CI → push to registry → deploy on VPS
    - Basic monitoring: UptimeRobot or similar for health endpoint polling

11. **Run all tests and validate**
    - `pnpm test` — all unit tests pass
    - `pnpm test:e2e` — all integration tests pass
    - `docker compose -f docker/docker-compose.prod.yml up` — production stack starts
    - Health check returns OK
    - Manual smoke test of critical flow

## Todo List

- [ ] Configure Jest for NestJS + Next.js
- [ ] Set up test database + cleanup helpers
- [ ] Write auth service unit tests
- [ ] Write leads service unit tests
- [ ] Write payments service unit tests
- [ ] Write scoring service unit tests
- [ ] Write phone normalization tests
- [ ] Write auth integration tests
- [ ] Write leads integration tests
- [ ] Write orders + payments integration tests
- [ ] Write import integration test
- [ ] Write transfer + claim integration test
- [ ] Write E2E critical flow test
- [ ] Write frontend component tests (login, table)
- [ ] Create health check endpoint
- [ ] Create API Dockerfile (multi-stage)
- [ ] Create Web Dockerfile (multi-stage)
- [ ] Create nginx.conf
- [ ] Create docker-compose.prod.yml
- [ ] Create backup script
- [ ] Create deploy script
- [ ] Run full test suite, verify >80% coverage on services
- [ ] Create GitHub Actions CI workflow (lint → test → build)
- [ ] Create GitHub Actions deploy workflow (build → push → deploy)
- [ ] Set up basic uptime monitoring for health endpoint
- [ ] Test production Docker stack locally
- [ ] Validate all success metrics

## Success Criteria

- Unit test coverage >80% on service layer
- All integration tests pass with real DB
- E2E critical flow test passes
- Docker images build successfully, <500MB each
- Production stack starts with `docker compose up`
- Health check endpoint returns OK for all services
- DB migration runs automatically on deploy
- Backup script creates valid pg_dump
- All brainstorm success metrics met:
  - Conversion tracking accuracy: 100%
  - Dashboard load: <3s
  - CSV import: 10K+ rows
  - System uptime: 99.5%+

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Test DB cleanup between tests | Medium | Truncate all tables in setup, use transactions |
| Docker build slow on VPS | Low | Use BuildKit cache, multi-stage builds |
| DB migration failure on deploy | High | Always backup before migrate, rollback script |
| Test flakiness (timing) | Medium | Avoid time-dependent tests, use deterministic data |
