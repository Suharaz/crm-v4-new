#!/bin/bash
set -euo pipefail

# CRM V4 deploy: Docker (PG+Redis) + PM2 (API+Web)
# Usage: ./scripts/deploy.sh

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env.production"

echo "=== CRM V4 Deploy ==="
cd "$APP_DIR"

# Check .env.production
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env.production not found"
  exit 1
fi

# Load env vars for build
set -a; source "$ENV_FILE"; set +a

# Pull latest code
echo ">>> git pull..."
git pull origin master

# Start/ensure infra (PG + Redis)
echo ">>> Starting infrastructure..."
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d

# Install dependencies
echo ">>> pnpm install..."
pnpm install --frozen-lockfile

# Generate Prisma client + push schema
echo ">>> Database migration..."
pnpm db:generate
pnpm db:push

# Build all packages + apps
echo ">>> Building..."
pnpm build

# Create logs directory
mkdir -p logs

# Start/restart PM2
echo ">>> Starting PM2 apps..."
if pm2 describe crm-api > /dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs
else
  pm2 start ecosystem.config.cjs
fi

# Save PM2 process list (auto-start on reboot)
pm2 save

echo ""
echo "=== Deploy complete ==="
echo "PM2:    pm2 status"
echo "Logs:   pm2 logs crm-api / pm2 logs crm-web"
echo "Health: curl http://localhost:3010/api/v1/health"
