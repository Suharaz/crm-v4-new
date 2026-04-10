#!/bin/bash
set -euo pipefail

# CRM V4 deployment script for VPS
# Usage: ./scripts/deploy.sh

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"
ENV_FILE="$APP_DIR/.env.production"

echo "=== CRM V4 Deploy ==="
echo "Dir: $APP_DIR"

# Check .env.production exists
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: .env.production not found. Copy from .env.production.example and fill in values."
  exit 1
fi

# Pull latest code
echo ">>> Pulling latest code..."
cd "$APP_DIR"
git pull origin master

# Build containers
echo ">>> Building containers..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build

# Run database migration
echo ">>> Running database migration..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" run --rm api sh -c "npx prisma db push --skip-generate"

# Start/restart services
echo ">>> Starting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

# Cleanup old images
echo ">>> Cleaning up old images..."
docker image prune -f

echo "=== Deploy complete ==="
echo "Check health: curl http://localhost/health"
