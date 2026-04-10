#!/bin/bash
set -euo pipefail

# One-time VPS setup: Node.js, pnpm, PM2, Docker, Nginx Proxy Manager
# Usage: curl -sSL <raw-url> | bash  OR  ./scripts/setup-vps.sh

echo "=== VPS Initial Setup ==="

# System update
echo ">>> Updating system..."
apt update && apt upgrade -y

# Install Docker (for PG + Redis)
echo ">>> Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
else
  echo "Docker already installed"
fi

# Install Node.js 20 via NodeSource
echo ">>> Installing Node.js 20..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt install -y nodejs
else
  echo "Node.js already installed: $(node -v)"
fi

# Install pnpm
echo ">>> Installing pnpm..."
npm i -g pnpm@9

# Install PM2
echo ">>> Installing PM2..."
npm i -g pm2

# PM2 auto-start on reboot
pm2 startup systemd -u root --hp /root
echo "PM2 startup configured"

# Install Git
apt install -y git

# Create shared proxy network
echo ">>> Setting up Nginx Proxy Manager..."
docker network create proxy-network 2>/dev/null || echo "proxy-network exists"

mkdir -p /opt/proxy
cat > /opt/proxy/docker-compose.yml <<'COMPOSE'
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

cd /opt/proxy && docker compose up -d

# Firewall
echo ">>> Configuring firewall..."
ufw allow 22
ufw allow 80
ufw allow 443
ufw --force enable

echo ""
echo "========================================="
echo "  VPS Setup Complete!"
echo "========================================="
echo ""
echo "Installed: Docker, Node.js $(node -v), pnpm, PM2"
echo ""
echo "Nginx Proxy Manager:"
echo "  UI:    http://$(hostname -I | awk '{print $1}'):81"
echo "  Login: admin@example.com / changeme"
echo "  NOTE:  Port 81 blocked by firewall."
echo "  Access via SSH tunnel: ssh -L 81:localhost:81 root@VPS_IP"
echo ""
echo "Next steps:"
echo "  1. SSH tunnel to :81, login NPM, change password"
echo "  2. Setup GitHub SSH key on VPS:"
echo "     ssh-keygen -t ed25519 -C 'vps-github'"
echo "     cat ~/.ssh/id_ed25519.pub  # → add to GitHub"
echo "  3. Clone project:"
echo "     cd /opt && git clone git@github.com:ORG/crm-v4.git"
echo "  4. Deploy:"
echo "     cd /opt/crm-v4"
echo "     cp .env.production.example .env.production"
echo "     nano .env.production"
echo "     ./scripts/deploy.sh"
echo ""
