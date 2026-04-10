#!/bin/bash
# Interactive SSL cert installer for aaPanel
# Usage: ./scripts/install-ssl-cert.sh [domain]
# Default domain: crm.taki.vn
#
# Flow: opens nano for private key → nano for cert → validates → installs.
# Avoids heredoc paste issues (indent / line wrap) that break PEM format.

set -euo pipefail

DOMAIN="${1:-crm.taki.vn}"
CERT_DIR="/www/server/panel/vhost/cert/$DOMAIN"
KEY_FILE="$CERT_DIR/privkey.pem"
CERT_FILE="$CERT_DIR/fullchain.pem"

echo "=== aaPanel SSL Cert Installer ==="
echo "Domain: $DOMAIN"
echo "Cert dir: $CERT_DIR"
echo ""

# Check nano available
if ! command -v nano &>/dev/null; then
  echo "ERROR: nano not found. Install: apt install nano"
  exit 1
fi

# Create cert dir
mkdir -p "$CERT_DIR"
echo "✓ Created $CERT_DIR"
echo ""

# ── Step 1: Private key ────────────────────────────────────────────────
echo "── Step 1/3: Private key ──"
echo "Nano sẽ mở. Paste toàn bộ PRIVATE KEY bao gồm:"
echo "  -----BEGIN PRIVATE KEY-----"
echo "  <content>"
echo "  -----END PRIVATE KEY-----"
echo ""
echo "Lưu: Ctrl+O → Enter → Ctrl+X"
echo ""
read -rp "Nhấn Enter để mở nano..."

# Start with empty file so nano doesn't show old content
> "$KEY_FILE"
nano "$KEY_FILE"

# Validate
if [ ! -s "$KEY_FILE" ]; then
  echo "✗ Private key file trống. Abort."
  exit 1
fi
if ! head -1 "$KEY_FILE" | grep -q "BEGIN .*PRIVATE KEY"; then
  echo "✗ Dòng đầu không phải BEGIN PRIVATE KEY. Check paste format."
  echo "  Hiện tại: $(head -1 "$KEY_FILE")"
  exit 1
fi
chmod 600 "$KEY_FILE"
echo "✓ Private key saved ($(wc -l < "$KEY_FILE") lines)"
echo ""

# ── Step 2: Certificate ────────────────────────────────────────────────
echo "── Step 2/3: Certificate ──"
echo "Nano sẽ mở. Paste toàn bộ CERTIFICATE bao gồm:"
echo "  -----BEGIN CERTIFICATE-----"
echo "  <content>"
echo "  -----END CERTIFICATE-----"
echo ""
echo "Lưu: Ctrl+O → Enter → Ctrl+X"
echo ""
read -rp "Nhấn Enter để mở nano..."

> "$CERT_FILE"
nano "$CERT_FILE"

# Validate
if [ ! -s "$CERT_FILE" ]; then
  echo "✗ Certificate file trống. Abort."
  exit 1
fi
if ! head -1 "$CERT_FILE" | grep -q "BEGIN CERTIFICATE"; then
  echo "✗ Dòng đầu không phải BEGIN CERTIFICATE. Check paste format."
  echo "  Hiện tại: $(head -1 "$CERT_FILE")"
  exit 1
fi
chmod 644 "$CERT_FILE"
echo "✓ Certificate saved ($(wc -l < "$CERT_FILE") lines)"
echo ""

# ── Step 3: Verify match ───────────────────────────────────────────────
echo "── Step 3/3: Verify cert ↔ key match ──"

KEY_MODULUS=$(openssl rsa -noout -modulus -in "$KEY_FILE" 2>/dev/null | openssl md5 | awk '{print $NF}')
CERT_MODULUS=$(openssl x509 -noout -modulus -in "$CERT_FILE" 2>/dev/null | openssl md5 | awk '{print $NF}')

echo "Key modulus MD5:  $KEY_MODULUS"
echo "Cert modulus MD5: $CERT_MODULUS"

if [ -z "$KEY_MODULUS" ] || [ "$KEY_MODULUS" = "d41d8cd98f00b204e9800998ecf8427e" ]; then
  echo "✗ Private key parse failed. File có thể corrupted hoặc wrong format."
  exit 1
fi

if [ "$KEY_MODULUS" = "$CERT_MODULUS" ]; then
  echo "✓ MATCH — cert và key là cặp hợp lệ"
else
  echo "✗ MISMATCH — cert và key không phải 1 cặp. Redo từ Cloudflare."
  exit 1
fi

# Show cert info
echo ""
echo "── Certificate info ──"
openssl x509 -noout -subject -issuer -dates -in "$CERT_FILE"

echo ""
echo "=========================================="
echo "✅ SSL cert installed successfully"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Login aaPanel UI"
echo "2. Website → $DOMAIN → Settings → SSL"
echo "3. aaPanel sẽ detect cert mới trong $CERT_DIR"
echo "4. Enable SSL / tick Force HTTPS"
echo "5. Cloudflare → SSL/TLS → Overview → Full (strict)"
echo ""
echo "Verify:"
echo "  curl -I https://$DOMAIN/health"
