# VPS Deployment Guide — Multi-Project Setup

## Tổng quan kiến trúc

```
Cloudflare (DNS + SSL + CDN)
    ↓
VPS :80/:443 → Nginx Proxy Manager (route theo domain)
    ├── crm.domain.com      → crm-web:3011 + crm-api:3010
    ├── app.domain.com      → app-web:3021 + app-api:3020
    └── admin.domain.com    → admin-web:3031
```

Mỗi project có Docker compose riêng, share chung `proxy-network`.

---

## Phần 1: Setup VPS lần đầu

### 1.1 Yêu cầu VPS

- OS: Ubuntu 22.04 / Debian 12
- RAM: 2GB+ (mỗi project thêm ~512MB)
- Disk: 20GB+ SSD
- Đã có IP public

### 1.2 SSH vào VPS

```bash
# Từ máy local — tạo SSH key (nếu chưa có)
ssh-keygen -t ed25519 -C "deploy-key"
# Enter → Enter → Enter (không cần passphrase)

# Copy public key lên VPS
ssh-copy-id root@YOUR_VPS_IP

# Test — không cần nhập password
ssh root@YOUR_VPS_IP
```

### 1.3 Cài đặt trên VPS

```bash
# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Git
apt install -y git

# Tạo SSH key trên VPS (để pull code từ GitHub)
ssh-keygen -t ed25519 -C "vps-github"
cat ~/.ssh/id_ed25519.pub
# → Copy output → GitHub.com → Settings → SSH and GPG keys → New SSH key → Paste
```

### 1.4 Test GitHub SSH

```bash
ssh -T git@github.com
# Output: "Hi username! You've successfully authenticated..."
```

### 1.5 Setup Nginx Proxy Manager (1 lần duy nhất)

```bash
# Tạo shared proxy network
docker network create proxy-network

# Tạo proxy directory
mkdir -p /opt/proxy
cat > /opt/proxy/docker-compose.yml <<'EOF'
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
EOF

cd /opt/proxy && docker compose up -d
```

### 1.6 Cấu hình Nginx Proxy Manager

1. Truy cập `http://YOUR_VPS_IP:81`
2. Login: `admin@example.com` / `changeme`
3. Đổi email + password ngay lập tức
4. (Optional) Sau khi setup xong, block port 81 từ bên ngoài bằng firewall:
   ```bash
   ufw allow 80
   ufw allow 443
   ufw allow 22
   ufw enable
   # Port 81 chỉ truy cập qua SSH tunnel: ssh -L 81:localhost:81 root@VPS_IP
   ```

---

## Phần 2: Deploy dự án CRM

### 2.1 Clone + config

```bash
cd /opt
git clone git@github.com:YOUR_ORG/crm-v4.git
cd crm-v4

# Tạo env production
cp .env.production.example .env.production
nano .env.production
```

### 2.2 Sửa `.env.production`

```env
DB_USER=crm
DB_PASSWORD=THAY_MAT_KHAU_MANH
DB_NAME=crm_v4
JWT_SECRET=THAY_RANDOM_32_KY_TU
JWT_REFRESH_SECRET=THAY_RANDOM_32_KY_TU_KHAC
REDIS_PASSWORD=THAY_MAT_KHAU_REDIS
FRONTEND_URL=https://crm.yourdomain.com
```

Tạo random secret:
```bash
openssl rand -hex 32
```

### 2.3 Deploy

```bash
chmod +x scripts/*.sh
./scripts/deploy.sh
```

### 2.4 Cấu hình domain trong Nginx Proxy Manager

1. Truy cập NPM UI (`:81`)
2. **Proxy Hosts → Add Proxy Host**
3. Tab **Details**:
   - Domain: `crm.yourdomain.com`
   - Forward Hostname: `crm-web`
   - Forward Port: `3011`
   - Block Common Exploits: ✅
4. Tab **Advanced** — paste nội dung file `nginx/proxy-host.conf`:
   ```nginx
   client_max_body_size 10M;

   location /api/ {
       proxy_pass http://crm-api:3010;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }

   location /files/ {
       proxy_pass http://crm-api:3010;
       proxy_set_header Host $host;
   }

   location /health {
       proxy_pass http://crm-api:3010/api/v1/health;
   }
   ```
5. **Save**

### 2.5 Cloudflare DNS

1. Vào Cloudflare → DNS
2. Thêm record:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | crm | `YOUR_VPS_IP` | Proxied ☁️ |

3. SSL/TLS → mode: **Full**

### 2.6 Kiểm tra

```bash
curl https://crm.yourdomain.com/health
```

---

## Phần 3: Seed dữ liệu ban đầu

```bash
cd /opt/crm-v4

# Chạy seed script trong container
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm api sh -c "npx prisma db seed"
```

---

## Phần 4: Cập nhật code

### Từ local

```bash
# Code + commit + push
git add . && git commit -m "feat: ..." && git push

# Deploy lên VPS (1 lệnh)
ssh root@VPS_IP "cd /opt/crm-v4 && ./scripts/deploy.sh"
```

### Trực tiếp trên VPS

```bash
ssh root@VPS_IP
cd /opt/crm-v4
./scripts/deploy.sh
```

---

## Phần 5: Thêm dự án mới

### 5.1 Quy tắc port

Mỗi project dùng 1 dải port riêng để tránh xung đột:

| Project | Web Port | API Port | DB Port (internal) |
|---------|----------|----------|-------------------|
| CRM V4 | 3011 | 3010 | 5432 |
| Project B | 3021 | 3020 | 5432 |
| Project C | 3031 | 3030 | 5432 |

**Quy ước:** Project thứ N dùng port `30N0` (API) và `30N1` (Web).

### 5.2 Kiểm tra port đã dùng

```bash
# Xem tất cả container đang chạy + port
docker ps --format "table {{.Names}}\t{{.Ports}}"

# Xem port nào đang listen
ss -tlnp | grep -E '30[0-9]{2}'
```

### 5.3 Context cho AI Agent khi tạo project mới

Khi nhờ AI Agent tạo deployment cho project mới, cung cấp context sau:

```
## Deployment Context

- VPS đã setup Nginx Proxy Manager tại /opt/proxy
- Shared Docker network: proxy-network (external: true)
- Port convention: API=30N0, Web=30N1 (N = project number)
- Ports đã dùng: 3010-3011 (CRM)
- Domain: [domain cho project mới]
- Container naming: [project]-api, [project]-web, [project]-postgres, [project]-redis

## Docker compose yêu cầu:
- KHÔNG có nginx service (dùng NPM chung)
- api + web containers join `proxy-network` (external: true)
- postgres + redis chỉ join internal network
- Container name phải unique (prefix bằng tên project)
- Volumes prefix bằng tên project để tránh xung đột

## Sau khi deploy:
- Vào NPM UI :81 → Add Proxy Host cho domain mới
- Forward đến [project]-web:[port]
- Advanced tab: thêm location /api/ proxy_pass đến [project]-api:[port]
- Cloudflare: thêm A record cho domain mới
```

### 5.4 Ví dụ docker-compose cho project mới

```yaml
# /opt/project-b/docker-compose.prod.yml
services:
  postgres:
    image: postgres:16-alpine
    container_name: projectb-postgres    # ← unique name
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - projectb-pg-data:/var/lib/postgresql/data   # ← unique volume
    networks:
      - projectb-internal

  api:
    build: ...
    container_name: projectb-api         # ← unique name
    expose:
      - "3020"                           # ← unique port
    networks:
      - projectb-internal
      - proxy-network                    # ← shared

  web:
    build: ...
    container_name: projectb-web         # ← unique name
    expose:
      - "3021"                           # ← unique port
    networks:
      - projectb-internal
      - proxy-network                    # ← shared

volumes:
  projectb-pg-data:

networks:
  projectb-internal:
    driver: bridge
  proxy-network:
    external: true                       # ← shared
```

---

## Phần 6: Backup

### Database backup script

```bash
# /opt/scripts/backup-all.sh
#!/bin/bash
BACKUP_DIR="/opt/backups/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# CRM
docker exec crm-postgres pg_dump -U crm crm_v4 | gzip > "$BACKUP_DIR/crm_v4.sql.gz"

# Project B (khi có)
# docker exec projectb-postgres pg_dump -U user db | gzip > "$BACKUP_DIR/projectb.sql.gz"

# Giữ 7 ngày gần nhất
find /opt/backups -maxdepth 1 -type d -mtime +7 -exec rm -rf {} \;

echo "Backup done: $BACKUP_DIR"
```

### Auto backup (cron)

```bash
crontab -e
# Thêm dòng: backup lúc 3h sáng mỗi ngày
0 3 * * * /opt/scripts/backup-all.sh >> /var/log/backup.log 2>&1
```

### Restore

```bash
gunzip -c /opt/backups/20260410/crm_v4.sql.gz | docker exec -i crm-postgres psql -U crm crm_v4
```

---

## Phần 7: Monitoring

### Kiểm tra nhanh

```bash
# Tất cả container
docker ps

# Logs CRM
docker logs crm-api --tail 50
docker logs crm-web --tail 50

# Health check
curl http://localhost:3010/api/v1/health

# Disk usage
df -h
docker system df
```

### Cleanup Docker

```bash
# Xóa images/containers không dùng
docker system prune -af

# Xóa volumes không dùng (CẨN THẬN — chỉ khi biết chắc)
docker volume prune
```

---

## Tóm tắt commands

| Việc | Command |
|------|---------|
| Setup VPS lần đầu | `./scripts/setup-proxy.sh` |
| Deploy CRM | `./scripts/deploy.sh` |
| Deploy từ local | `ssh root@VPS "cd /opt/crm-v4 && ./scripts/deploy.sh"` |
| Xem logs | `docker logs crm-api --tail 50 -f` |
| Vào DB | `docker exec -it crm-postgres psql -U crm crm_v4` |
| Backup | `/opt/scripts/backup-all.sh` |
| Xem port đang dùng | `docker ps --format "table {{.Names}}\t{{.Ports}}"` |
| Restart 1 service | `docker restart crm-api` |
| NPM UI | `http://VPS_IP:81` hoặc `ssh -L 81:localhost:81 root@VPS` |
