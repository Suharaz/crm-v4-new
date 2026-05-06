#!/bin/bash
set -euo pipefail

# CRM V4 deploy: Docker (PG+Redis) + PM2 (API+Web)
# Usage: ./scripts/deploy.sh

# Load PATH for non-interactive SSH (GitHub Actions, cron)
export PATH="/www/server/nodejs/v22.17.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env.production"
ENV_EXAMPLE="$APP_DIR/.env.production.example"
LOCK_FILE="/tmp/crm-v4-deploy.lock"

echo "=== CRM V4 Deploy ==="
cd "$APP_DIR"

# ── Deploy lock (prevent parallel deploys) ─────────────────────────────
if [ -f "$LOCK_FILE" ]; then
  LOCK_PID=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
  if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
    echo "ERROR: Deploy already running (PID $LOCK_PID). Aborting."
    exit 1
  fi
  echo "WARN: Stale lock file found. Removing."
  rm -f "$LOCK_FILE"
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"' EXIT

# ── Auto-generate .env.production if missing ───────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  if [ ! -f "$ENV_EXAMPLE" ]; then
    echo "ERROR: Neither .env.production nor .env.production.example found"
    rm -f "$LOCK_FILE"
    exit 1
  fi

  echo ">>> .env.production not found - generating from example..."
  cp "$ENV_EXAMPLE" "$ENV_FILE"

  # Generate secure random values
  DB_PASS=$(openssl rand -hex 16)
  REDIS_PASS=$(openssl rand -hex 16)
  JWT_SEC=$(openssl rand -hex 32)
  JWT_REF=$(openssl rand -hex 32)
  SEED_PASS=$(openssl rand -base64 16)

  # Replace placeholders
  sed -i "s|CHANGE_ME_strong_password|$DB_PASS|g" "$ENV_FILE"
  sed -i "s|CHANGE_ME_redis_password|$REDIS_PASS|g" "$ENV_FILE"
  sed -i "s|CHANGE_ME_random_32_chars|$JWT_SEC|" "$ENV_FILE"
  sed -i "s|CHANGE_ME_another_random_32_chars|$JWT_REF|" "$ENV_FILE"
  sed -i "s|CHANGE_ME_min_8_chars|$SEED_PASS|" "$ENV_FILE"

  # Ask for domain
  echo ""
  read -rp "Nhập domain (vd: crm.yourdomain.com): " DOMAIN
  if [ -z "$DOMAIN" ]; then
    echo "ERROR: Domain không được để trống"
    rm -f "$LOCK_FILE"
    exit 1
  fi

  sed -i "s|https://crm.yourdomain.com|https://$DOMAIN|g" "$ENV_FILE"

  echo "✓ Generated .env.production"
  echo "  Domain:  $DOMAIN"
  echo "  Secrets: auto-generated (random)"
  echo ""
fi

# ── Load env vars ──────────────────────────────────────────────────────
set -a; source "$ENV_FILE"; set +a

# Copy .env.production → .env for Prisma CLI (dotenv -e ../../.env)
cp "$ENV_FILE" "$APP_DIR/.env"

# ── Step 1: Pull latest code ──────────────────────────────────────────
echo ">>> [1/6] git pull..."
git config --global --add safe.directory "$APP_DIR"
git pull origin master

# ── Step 2: Start infra (PG + Redis) ─────────────────────────────────
echo ">>> [2/6] Starting infrastructure..."
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" up -d

# ── Step 3: Install dependencies ─────────────────────────────────────
echo ">>> [3/6] pnpm install..."
pnpm install --frozen-lockfile --prod=false

# ── Step 4: Build all (BEFORE db migration) ──────────────────────────
echo ">>> [4/6] Building..."
pnpm db:generate
# Clear stale build artifacts AND Turborepo cache to prevent HTML/chunk hash mismatch.
# Turborepo cache HIT can serve old prerendered HTML referencing chunks
# that were regenerated with new hashes - causing 404 on chunk fetch.
rm -rf apps/web/.next apps/api/dist .turbo node_modules/.cache/turbo
pnpm build --force

# ── Step 5: Database migration (AFTER successful build) ──────────────
echo ">>> [5/6] Database migration..."
# Pre-push: idempotent SQL for data-aware changes (renames, backfills)
# that `prisma db push` cannot perform on its own. See
# packages/database/prisma/pre-push-migrations.sql for the running log.
pnpm db:pre-push
pnpm db:push

# ── Step 6: Restart PM2 ─────────────────────────────────────────────
echo ">>> [6/6] Starting PM2 apps..."
# Use restart (full kill+start) instead of reload (graceful) to ensure
# Next.js process drops in-memory prerender cache and reads fresh .next/
if pm2 describe crm-api > /dev/null 2>&1; then
  pm2 restart ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save

# ── Auto-purge Cloudflare cache (skip if env vars missing) ───────────
# Set CF_ZONE_ID and CF_API_TOKEN in .env.production to enable.
# Without this, CF caches old HTML for s-maxage=31536000 (1 year) → stale chunks → 404
if [ -n "${CF_ZONE_ID:-}" ] && [ -n "${CF_API_TOKEN:-}" ]; then
  echo ">>> Purging Cloudflare cache..."
  curl -s -X POST "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/purge_cache" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data '{"purge_everything":true}' > /tmp/cf-purge.json
  if grep -q '"success":true' /tmp/cf-purge.json; then
    echo "✓ Cloudflare cache purged"
  else
    echo "✗ Cloudflare purge failed: $(cat /tmp/cf-purge.json)"
  fi
else
  echo ">>> Skipping Cloudflare purge (CF_ZONE_ID and CF_API_TOKEN not set)"
fi

# ── Health check ─────────────────────────────────────────────────────
echo ""
echo ">>> Health check..."
sleep 3
API_PORT="${API_PORT:-3010}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:$API_PORT/api/v1/health" || echo "000")

if [ "$HTTP_CODE" = "200" ]; then
  echo "✓ API healthy (HTTP $HTTP_CODE)"
else
  echo "✗ API unhealthy (HTTP $HTTP_CODE) - check: pm2 logs crm-api --err --lines 50"
fi

echo ""
echo "=== Deploy complete ==="
echo "PM2:    pm2 status"
echo "Logs:   pm2 logs crm-api / pm2 logs crm-web"
echo "Health: curl http://localhost:$API_PORT/api/v1/health"
