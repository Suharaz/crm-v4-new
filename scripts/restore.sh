#!/bin/bash
set -euo pipefail

# CRM V4 Restore: Download backup from R2 → restore database + uploads
# Usage: ./scripts/restore.sh [BACKUP_DATE]
# Example: ./scripts/restore.sh 20260429-020000

export PATH="/www/server/nodejs/v22.17.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env.production"
BACKUP_DIR="$APP_DIR/backups"

# ── Load env vars ────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi
set -a; source "$ENV_FILE"; set +a

R2_BUCKET="${R2_BACKUP_BUCKET:-}"
R2_ACCESS_KEY="${R2_ACCESS_KEY_ID:-}"
R2_SECRET_KEY="${R2_SECRET_ACCESS_KEY:-}"
R2_ACCOUNT_ID="${CF_ACCOUNT_ID:-}"

if [ -z "$R2_BUCKET" ] || [ -z "$R2_ACCESS_KEY" ] || [ -z "$R2_SECRET_KEY" ] || [ -z "$R2_ACCOUNT_ID" ]; then
  echo "ERROR: R2 credentials missing in $ENV_FILE"
  exit 1
fi

R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

# rclone config inline
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

# ── Select backup to restore ────────────────────────────────────────────
if [ -n "${1:-}" ]; then
  BACKUP_DATE="$1"
else
  echo "Available backups on R2:"
  echo ""
  rclone lsf "r2:$R2_BUCKET/" --dirs-only | sort -r | head -20
  echo ""
  read -rp "Nhập ngày backup (vd: 20260429-020000): " BACKUP_DATE
fi

if [ -z "$BACKUP_DATE" ]; then
  echo "ERROR: Backup date required"
  exit 1
fi

# Bỏ trailing slash nếu có
BACKUP_DATE="${BACKUP_DATE%/}"

# Kiểm tra backup tồn tại trên R2
if ! rclone lsf "r2:$R2_BUCKET/$BACKUP_DATE/" --quiet 2>/dev/null | grep -q "db-"; then
  echo "ERROR: Backup '$BACKUP_DATE' not found on R2"
  exit 1
fi

echo "=== CRM V4 Restore - $BACKUP_DATE ==="
echo ""
echo "WARNING: Thao tác này sẽ GHI ĐÈ database hiện tại!"
read -rp "Bạn chắc chắn? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
  echo "Cancelled."
  exit 0
fi

mkdir -p "$BACKUP_DIR"

# ── Step 1: Download from R2 ────────────────────────────────────────────
echo ">>> [1/3] Downloading backup from R2..."
rclone copy "r2:$R2_BUCKET/$BACKUP_DATE/" "$BACKUP_DIR/" --quiet
echo "✓ Downloaded"

# ── Step 2: Restore database ────────────────────────────────────────────
echo ">>> [2/3] Restoring database..."
DB_USER="${DB_USER:-crm}"
DB_NAME="${DB_NAME:-crm_v4}"
DB_FILE=$(ls "$BACKUP_DIR"/db-"$BACKUP_DATE".sql.gz 2>/dev/null | head -1)

if [ -z "$DB_FILE" ]; then
  echo "ERROR: Database dump file not found"
  exit 1
fi

# Giải nén và restore vào PostgreSQL container
gunzip -c "$DB_FILE" | docker exec -i crm-postgres psql -U "$DB_USER" -d "$DB_NAME" --quiet

echo "✓ Database restored"

# ── Step 3: Restore uploads ─────────────────────────────────────────────
echo ">>> [3/3] Restoring uploads..."
UPLOADS_FILE="$BACKUP_DIR/uploads-$BACKUP_DATE.tar.gz"

if [ -f "$UPLOADS_FILE" ]; then
  # Backup uploads hiện tại trước khi ghi đè
  if [ -d "$APP_DIR/uploads" ]; then
    mv "$APP_DIR/uploads" "$APP_DIR/uploads.old-$(date +%Y%m%d%H%M%S)"
    echo "  → Old uploads moved to uploads.old-*"
  fi
  tar -xzf "$UPLOADS_FILE" -C "$APP_DIR"
  echo "✓ Uploads restored"
else
  echo "- No uploads archive in this backup"
fi

# ── Cleanup ─────────────────────────────────────────────────────────────
rm -f "$BACKUP_DIR/db-$BACKUP_DATE.sql.gz" "$BACKUP_DIR/uploads-$BACKUP_DATE.tar.gz"

echo ""
echo "=== Restore complete ==="
echo ""
echo "Next steps:"
echo "  1. Restart API:  pm2 restart crm-api"
echo "  2. Check health: curl http://localhost:${API_PORT:-3010}/api/v1/health"
echo "  3. Verify data in browser"
