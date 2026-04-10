#!/bin/bash
set -euo pipefail

# Setup shared Nginx Proxy Manager for multi-project VPS
# Run ONCE on VPS: ./scripts/setup-proxy.sh

echo "=== Setting up Nginx Proxy Manager ==="

# Create shared proxy network
docker network create proxy-network 2>/dev/null || echo "proxy-network already exists"

# Create proxy directory
PROXY_DIR="/opt/proxy"
mkdir -p "$PROXY_DIR"

cat > "$PROXY_DIR/docker-compose.yml" <<'COMPOSE'
services:
  nginx-proxy:
    image: jc21/nginx-proxy-manager:latest
    container_name: nginx-proxy-manager
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "81:81"
    volumes:
      - npm-data:/data
      - npm-letsencrypt:/etc/letsencrypt
    networks:
      - proxy-network

volumes:
  npm-data:
  npm-letsencrypt:

networks:
  proxy-network:
    external: true
COMPOSE

cd "$PROXY_DIR"
docker compose up -d

echo ""
echo "=== Nginx Proxy Manager is running ==="
echo ""
echo "Admin UI: http://your-vps-ip:81"
echo "Default login: admin@example.com / changeme"
echo ""
echo "Setup for CRM:"
echo "  1. Login to :81 and change password"
echo "  2. Add Proxy Host:"
echo "     Domain: crm.yourdomain.com"
echo "     Forward Hostname: crm-web"
echo "     Forward Port: 3011"
echo "  3. Add another Proxy Host for API (if needed):"
echo "     Domain: crm.yourdomain.com"
echo "     Custom location: /api"
echo "     Forward Hostname: crm-api"
echo "     Forward Port: 3010"
echo ""
echo "Or use the custom nginx config in nginx/proxy-host.conf"
