#!/bin/bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════════════════════
# CRM V4 — Interactive Production Setup
# Creates .env.production with auto-generated secrets, then runs deploy.
# Usage: bash scripts/setup.sh
# ═══════════════════════════════════════════════════════════════════════════════

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env.production"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║      CRM V4 — Production Setup      ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Check existing .env.production ──────────────────────────────────────────
if [ -f "$ENV_FILE" ]; then
  echo "⚠  File .env.production đã tồn tại!"
  read -rp "Ghi đè? (y/N): " overwrite
  if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
    echo "Giữ file cũ. Chạy scripts/deploy.sh để deploy."
    exit 0
  fi
  echo ""
fi

# ── Collect info ────────────────────────────────────────────────────────────
echo "=== Thông tin cấu hình ==="
echo ""

# Domain
read -rp "Tên miền (VD: crm.company.com): " DOMAIN
while [ -z "$DOMAIN" ]; do
  read -rp "Bắt buộc nhập tên miền: " DOMAIN
done

# Protocol
read -rp "Dùng HTTPS? (Y/n): " use_https
if [[ "$use_https" =~ ^[Nn]$ ]]; then
  PROTOCOL="http"
else
  PROTOCOL="https"
fi

# Ports
read -rp "Port API (mặc định 3010): " API_PORT
API_PORT=${API_PORT:-3010}

read -rp "Port Web (mặc định 3011): " WEB_PORT
WEB_PORT=${WEB_PORT:-3011}

read -rp "Port PostgreSQL (mặc định 5433): " DB_PORT
DB_PORT=${DB_PORT:-5433}

read -rp "Port Redis (mặc định 6380): " REDIS_PORT
REDIS_PORT=${REDIS_PORT:-6380}

# Database
read -rp "Database user (mặc định crm): " DB_USER
DB_USER=${DB_USER:-crm}

read -rp "Database name (mặc định crm_v4): " DB_NAME
DB_NAME=${DB_NAME:-crm_v4}

# AI (optional)
echo ""
read -rp "OpenAI API Key (bỏ trống nếu chưa có): " OPENAI_KEY
read -rp "SePay API Key (bỏ trống nếu chưa có): " SEPAY_KEY

# ── Generate secrets ────────────────────────────────────────────────────────
echo ""
echo ">>> Đang tạo secrets..."

gen_secret() {
  openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 64
}

gen_password() {
  openssl rand -base64 16 2>/dev/null | tr -dc 'a-zA-Z0-9' | head -c 20 || head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 20
}

DB_PASSWORD=$(gen_password)
REDIS_PASSWORD=$(gen_password)
JWT_SECRET=$(gen_secret)
JWT_REFRESH_SECRET=$(gen_secret)
SEED_PASSWORD=$(gen_password)

# ── Build URLs ──────────────────────────────────────────────────────────────
FRONTEND_URL="${PROTOCOL}://${DOMAIN}"
API_URL="${PROTOCOL}://${DOMAIN}/api/v1"
DATABASE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@localhost:${DB_PORT}/${DB_NAME}"
REDIS_URL="redis://:${REDIS_PASSWORD}@localhost:${REDIS_PORT}"

# ── Write .env.production ──────────────────────────────────────────────────
cat > "$ENV_FILE" << ENVEOF
# ═══════════════════════════════════════════════════════════════
# CRM V4 — Production Environment
# Generated: $(date '+%Y-%m-%d %H:%M:%S')
# Domain: ${DOMAIN}
# ═══════════════════════════════════════════════════════════════

# Node
NODE_ENV=production

# Database (Docker PostgreSQL)
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
DB_NAME=${DB_NAME}
DB_PORT=${DB_PORT}
DATABASE_URL=${DATABASE_URL}

# Redis (Docker)
REDIS_PASSWORD=${REDIS_PASSWORD}
REDIS_PORT=${REDIS_PORT}
REDIS_URL=${REDIS_URL}

# Auth (auto-generated secrets)
JWT_SECRET=${JWT_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}

# Seed password (for pnpm db:seed in production)
SEED_PASSWORD=${SEED_PASSWORD}

# URLs
API_PORT=${API_PORT}
FRONTEND_URL=${FRONTEND_URL}
NEXT_PUBLIC_API_URL=${API_URL}

# Storage
UPLOAD_DIR=./uploads
ENVEOF

# Optional keys
if [ -n "${OPENAI_KEY:-}" ]; then
  echo "" >> "$ENV_FILE"
  echo "# AI" >> "$ENV_FILE"
  echo "OPENAI_API_KEY=${OPENAI_KEY}" >> "$ENV_FILE"
fi

if [ -n "${SEPAY_KEY:-}" ]; then
  echo "" >> "$ENV_FILE"
  echo "# Payment Gateway" >> "$ENV_FILE"
  echo "SEPAY_API_KEY=${SEPAY_KEY}" >> "$ENV_FILE"
fi

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════╗"
echo "║         Setup hoàn tất!              ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "  Domain:     ${PROTOCOL}://${DOMAIN}"
echo "  API:        localhost:${API_PORT} → ${API_URL}"
echo "  Web:        localhost:${WEB_PORT}"
echo "  PostgreSQL: localhost:${DB_PORT} (user: ${DB_USER})"
echo "  Redis:      localhost:${REDIS_PORT}"
echo ""
echo "  File:       .env.production"
echo ""
echo "  DB Password:     ${DB_PASSWORD}"
echo "  Redis Password:  ${REDIS_PASSWORD}"
echo "  Seed Password:   ${SEED_PASSWORD}"
echo ""
echo "  ⚠  Lưu lại passwords ở trên! Chúng sẽ không hiện lại."
echo ""

# ── Ask to deploy ───────────────────────────────────────────────────────────
read -rp "Chạy deploy ngay? (Y/n): " run_deploy
if [[ ! "$run_deploy" =~ ^[Nn]$ ]]; then
  echo ""
  echo ">>> Đang deploy..."
  bash "$APP_DIR/scripts/deploy.sh"
else
  echo ""
  echo "Chạy deploy sau: bash scripts/deploy.sh"
fi
