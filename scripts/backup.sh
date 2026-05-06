#!/bin/bash
set -euo pipefail

# CRM V4 Backup: pg_dump + uploads → Cloudflare R2
# Usage: ./scripts/backup.sh
# Cron:  0 2 * * * /path/to/crm-v4/scripts/backup.sh >> /var/log/crm-backup.log 2>&1

# Load PATH for non-interactive SSH (cron, GitHub Actions)
export PATH="/www/server/nodejs/v22.17.0/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$APP_DIR/.env.production"
BACKUP_DIR="$APP_DIR/backups"
DATE=$(date +%Y%m%d-%H%M%S)
RETENTION_DAYS=7

# ── Load env vars ────────────────────────────────────────────────────────
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found"
  exit 1
fi
set -a; source "$ENV_FILE"; set +a

# R2 config (set these in .env.production)
R2_BUCKET="${R2_BACKUP_BUCKET:-}"
R2_ACCESS_KEY="${R2_ACCESS_KEY_ID:-}"
R2_SECRET_KEY="${R2_SECRET_ACCESS_KEY:-}"
R2_ACCOUNT_ID="${CF_ACCOUNT_ID:-}"

if [ -z "$R2_BUCKET" ] || [ -z "$R2_ACCESS_KEY" ] || [ -z "$R2_SECRET_KEY" ] || [ -z "$R2_ACCOUNT_ID" ]; then
  echo "ERROR: R2 credentials missing. Set in $ENV_FILE:"
  echo "  R2_BACKUP_BUCKET=crm-backups"
  echo "  R2_ACCESS_KEY_ID=<your-key>"
  echo "  R2_SECRET_ACCESS_KEY=<your-secret>"
  echo "  CF_ACCOUNT_ID=<your-account-id>"
  exit 1
fi

# rclone R2 endpoint
R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

echo "=== CRM V4 Backup - $DATE ==="

# ── Create temp backup dir ───────────────────────────────────────────────
mkdir -p "$BACKUP_DIR"
trap 'rm -f "$BACKUP_DIR/db-$DATE.sql.gz" "$BACKUP_DIR/uploads-$DATE.tar.gz" 2>/dev/null' EXIT

# ── Step 1: Database dump ────────────────────────────────────────────────
echo ">>> [1/4] Dumping database..."
DB_USER="${DB_USER:-crm}"
DB_NAME="${DB_NAME:-crm_v4}"

# pg_dump từ Docker container, nén trực tiếp bằng gzip
docker exec crm-postgres pg_dump \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  | gzip > "$BACKUP_DIR/db-$DATE.sql.gz"

DB_SIZE=$(du -h "$BACKUP_DIR/db-$DATE.sql.gz" | cut -f1)
echo "✓ Database dumped ($DB_SIZE)"

# ── Step 2: Uploads backup ──────────────────────────────────────────────
echo ">>> [2/4] Archiving uploads..."
UPLOADS_DIR="$APP_DIR/uploads"
if [ -d "$UPLOADS_DIR" ] && [ "$(ls -A "$UPLOADS_DIR" 2>/dev/null)" ]; then
  tar -czf "$BACKUP_DIR/uploads-$DATE.tar.gz" -C "$APP_DIR" uploads/
  UPLOADS_SIZE=$(du -h "$BACKUP_DIR/uploads-$DATE.tar.gz" | cut -f1)
  echo "✓ Uploads archived ($UPLOADS_SIZE)"
  HAS_UPLOADS=true
else
  echo "- No uploads to backup (empty or missing)"
  HAS_UPLOADS=false
fi

# ── Step 3: Upload to R2 ────────────────────────────────────────────────
echo ">>> [3/4] Uploading to Cloudflare R2..."

# Dùng rclone với config inline (không cần file config riêng)
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ACCESS_KEY_ID="$R2_ACCESS_KEY"
export RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$R2_SECRET_KEY"
export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

# Upload database dump
rclone copy "$BACKUP_DIR/db-$DATE.sql.gz" "r2:$R2_BUCKET/$DATE/" --quiet
echo "✓ Database uploaded → r2:$R2_BUCKET/$DATE/db-$DATE.sql.gz"

# Upload uploads archive (nếu có)
if [ "$HAS_UPLOADS" = true ]; then
  rclone copy "$BACKUP_DIR/uploads-$DATE.tar.gz" "r2:$R2_BUCKET/$DATE/" --quiet
  echo "✓ Uploads uploaded → r2:$R2_BUCKET/$DATE/uploads-$DATE.tar.gz"
fi

# ── Step 4: Cleanup old backups ──────────────────────────────────────────
echo ">>> [4/4] Cleaning up old backups (>${RETENTION_DAYS} days)..."

# Lấy danh sách thư mục trên R2, xoá những folder cũ hơn 7 ngày
CUTOFF_DATE=$(date -d "-${RETENTION_DAYS} days" +%Y%m%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y%m%d)

rclone lsf "r2:$R2_BUCKET/" --dirs-only --quiet 2>/dev/null | while read -r dir; do
  # dir format: "20260429-020000/"
  DIR_DATE=$(echo "$dir" | cut -d'-' -f1)
  if [ -n "$DIR_DATE" ] && [ "$DIR_DATE" -lt "$CUTOFF_DATE" ] 2>/dev/null; then
    rclone purge "r2:$R2_BUCKET/$dir" --quiet
    echo "  Deleted old backup: $dir"
  fi
done

echo "✓ Cleanup done"

# ── Cleanup local temp files ─────────────────────────────────────────────
rm -f "$BACKUP_DIR/db-$DATE.sql.gz" "$BACKUP_DIR/uploads-$DATE.tar.gz"

echo ""
echo "=== Backup complete - $DATE ==="
echo "Location: r2:$R2_BUCKET/$DATE/"
echo "Retention: ${RETENTION_DAYS} days"
