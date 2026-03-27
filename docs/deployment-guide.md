# Deployment Guide

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Docker Compose
- Git

### Quick Start

```bash
# 1. Clone
git clone <repo-url> crm-v4
cd crm-v4

# 2. Install dependencies
pnpm install

# 3. Start services
docker compose up -d          # PostgreSQL 16 + Redis 7

# 4. Setup database
cp .env.example .env          # Edit DATABASE_URL if needed
pnpm db:generate              # Generate Prisma client
pnpm db:push                  # Push schema to DB
pnpm db:seed                  # Seed dev data

# 5. Start dev servers
pnpm dev                      # API :3001 + Web :3000
```

### Environment Variables

```env
# Database
DATABASE_URL=postgresql://crm:crm@localhost:5432/crm_v4

# Auth
JWT_SECRET=<random-32-chars>
JWT_REFRESH_SECRET=<random-32-chars>

# Server
API_PORT=3001
FRONTEND_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1

# Storage
UPLOAD_DIR=./uploads
REDIS_URL=redis://localhost:6379
```

## Production Deployment

### Docker Compose Stack

```
nginx        → Reverse proxy, SSL (Let's Encrypt)
api (x2)     → NestJS, multi-stage Dockerfile
web          → Next.js standalone
postgres     → PostgreSQL 16, persistent volume
redis        → Redis 7, AOF persistence
```

### Deploy Steps

```bash
# 1. SSH to VPS
ssh user@server

# 2. Pull latest
cd /opt/crm-v4
git pull origin main

# 3. Build + deploy
./scripts/deploy.sh
# This runs:
#   - docker compose build
#   - npx prisma migrate deploy
#   - docker compose up -d (rolling restart)
```

### Backup Strategy

```bash
# Automated via cron
./scripts/backup.sh
# - pg_dump to compressed file
# - Rotate: 7 daily + 4 weekly
# - uploads/ directory backed up separately
```

### Monitoring

- Health endpoint: `GET /api/v1/health` → DB + Redis + disk status
- UptimeRobot: ping health endpoint every 5 min
- Logs: Pino structured JSON, rotated daily

### SSL

- Let's Encrypt via certbot
- Auto-renewal cron
- nginx config handles termination

## CI/CD (GitHub Actions)

### CI (on PR + push to main)

```yaml
jobs:
  lint → test (unit + integration with PG service) → build
```

### Deploy (on push to main, after CI)

```yaml
steps:
  - SSH to VPS → pull → build → migrate → restart
```
