# VPS Deployment Guide — PM2 + Docker Hybrid

## Kiến trúc

```
Cloudflare (DNS + SSL)
    ↓
VPS :80/:443 → Nginx Proxy Manager (route theo domain)
    ├── crm.domain.com  → localhost:3011 (PM2 crm-web)
    │                      localhost:3010 (PM2 crm-api)
    ├── app.domain.com  → localhost:3021 (PM2 app-web)
    └── ...

Docker: PostgreSQL + Redis (infrastructure)
PM2: API + Web apps (fast restart, easy debug)
```

---

## Phần 1: Setup VPS lần đầu

### 1.1 SSH key (máy local)

```bash
# Tạo SSH key
ssh-keygen -t ed25519 -C "deploy-key"

# Copy lên VPS
ssh-copy-id root@YOUR_VPS_IP

# Test (không cần password)
ssh root@YOUR_VPS_IP
```

### 1.2 Chạy setup script trên VPS

```bash
ssh root@YOUR_VPS_IP

# Clone repo trước (hoặc copy script lên)
cd /opt
git clone git@github.com:YOUR_ORG/crm-v4.git
cd crm-v4

# Chạy setup — cài Docker, Node.js 20, pnpm, PM2, Nginx Proxy Manager
chmod +x scripts/*.sh
./scripts/setup-vps.sh
```

Script tự cài: Docker, Node.js 20, pnpm, PM2 (auto-start), Nginx Proxy Manager, firewall.

### 1.3 GitHub SSH key trên VPS

```bash
ssh-keygen -t ed25519 -C "vps-github"
cat ~/.ssh/id_ed25519.pub
# → Copy → GitHub.com → Settings → SSH and GPG keys → New SSH key

# Test
ssh -T git@github.com
```

### 1.4 Cấu hình Nginx Proxy Manager

```bash
# Truy cập qua SSH tunnel (port 81 blocked bởi firewall)
# Từ máy local:
ssh -L 81:localhost:81 root@YOUR_VPS_IP
# → Mở browser: http://localhost:81
```

Login: `admin@example.com` / `changeme` → đổi password ngay.

---

## Phần 2: Deploy CRM

### 2.1 Config

```bash
cd /opt/crm-v4
cp .env.production.example .env.production
nano .env.production
```

Sửa các giá trị:
```env
DB_PASSWORD=mat_khau_manh_123
DATABASE_URL=postgresql://crm:mat_khau_manh_123@localhost:5433/crm_v4
REDIS_PASSWORD=redis_manh_456
REDIS_URL=redis://:redis_manh_456@localhost:6380
JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>
FRONTEND_URL=https://crm.yourdomain.com
NEXT_PUBLIC_API_URL=http://localhost:3010/api/v1
```

### 2.2 Deploy

```bash
./scripts/deploy.sh
```

Flow: `git pull → docker up (PG+Redis) → pnpm install → build → pm2 start`

### 2.3 Seed dữ liệu (lần đầu)

```bash
cd /opt/crm-v4
source .env.production
pnpm db:seed
```

### 2.4 Nginx Proxy Manager — Add domain

SSH tunnel → `http://localhost:81` → **Proxy Hosts → Add**:

**Tab Details:**
- Domain: `crm.yourdomain.com`
- Forward Hostname: `127.0.0.1`
- Forward Port: `3011`
- Block Common Exploits: ✅

**Tab Advanced** — paste:
```nginx
client_max_body_size 10M;

location /api/ {
    proxy_pass http://127.0.0.1:3010;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /files/ {
    proxy_pass http://127.0.0.1:3010;
    proxy_set_header Host $host;
}

location /health {
    proxy_pass http://127.0.0.1:3010/api/v1/health;
}
```

### 2.5 Cloudflare DNS

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | crm | `YOUR_VPS_IP` | Proxied ☁️ |

SSL/TLS mode: **Full**

### 2.6 Kiểm tra

```bash
pm2 status                                    # apps running
curl http://localhost:3010/api/v1/health       # API health
curl https://crm.yourdomain.com               # public access
```

---

## Phần 3: Cập nhật code hàng ngày

```bash
# Từ local: code → commit → push → deploy
git push && ssh root@VPS_IP "cd /opt/crm-v4 && ./scripts/deploy.sh"
```

Hoặc SSH vào VPS:
```bash
cd /opt/crm-v4
./scripts/deploy.sh
```

---

## Phần 4: Thêm dự án mới

### 4.1 Quy tắc port

| Project | API Port | Web Port | DB Port | Redis Port |
|---------|----------|----------|---------|------------|
| CRM V4 | 3010 | 3011 | 5433 | 6380 |
| Project B | 3020 | 3021 | 5434 | 6381 |
| Project C | 3030 | 3031 | 5435 | 6382 |

**Quy ước:** Project thứ N dùng `30N0`/`30N1` (app), `543N+2`/`638N` (infra).

### 4.2 Kiểm tra port đang dùng

```bash
# PM2 apps
pm2 status

# Docker infra
docker ps --format "table {{.Names}}\t{{.Ports}}"

# Tất cả ports
ss -tlnp | grep LISTEN
```

### 4.3 Context cho AI Agent

Khi nhờ AI tạo deployment cho project mới, cung cấp:

```
## VPS Deployment Context

Kiến trúc: PM2 (apps) + Docker (PG/Redis) + Nginx Proxy Manager
VPS đã có: Node.js 20, pnpm, PM2, Docker, NPM proxy

### Port convention
- App ports: API=30N0, Web=30N1 (N=project number)
- Infra ports: PG=543(N+2), Redis=638N
- Ports đã dùng: [liệt kê từ `pm2 status` + `docker ps`]

### Files cần tạo cho project mới
1. docker-compose.prod.yml — chỉ PG + Redis (ports unique)
2. ecosystem.config.cjs — PM2 config (ports unique, logs dir)
3. scripts/deploy.sh — git pull → docker up → pnpm install → build → pm2 reload
4. .env.production.example — template env vars
5. nginx/proxy-host.conf — NPM advanced config

### Quy tắc
- Container names prefix bằng tên project (crm-postgres, appb-postgres)
- PM2 app names prefix bằng tên project (crm-api, appb-api)
- Mỗi project có docker-compose + ecosystem config riêng
- Nginx Proxy Manager route domain → localhost:port
- Domain config: 1 lần trong NPM UI, không cần sửa lại khi deploy

### Sau deploy
1. Vào NPM UI → Add Proxy Host cho domain mới
2. Cloudflare → Add A record
```

### 4.4 Ví dụ cấu trúc project mới

```
/opt/project-b/
├── docker-compose.prod.yml    # PG:5434 + Redis:6381
├── ecosystem.config.cjs       # api:3020 + web:3021
├── scripts/deploy.sh
├── .env.production
├── nginx/proxy-host.conf
└── apps/...
```

---

## Phần 5: Quản lý hàng ngày

### PM2 commands

```bash
pm2 status                    # Xem trạng thái
pm2 logs crm-api              # Xem logs API
pm2 logs crm-web              # Xem logs Web
pm2 restart crm-api           # Restart API
pm2 reload ecosystem.config.cjs  # Zero-downtime reload
pm2 monit                     # Monitor realtime
```

### Docker commands

```bash
docker ps                     # PG + Redis status
docker logs crm-postgres      # PG logs
docker exec -it crm-postgres psql -U crm crm_v4   # Vào DB
```

### Backup

```bash
# Database backup
docker exec crm-postgres pg_dump -U crm crm_v4 | gzip > backup_$(date +%Y%m%d).sql.gz

# Restore
gunzip -c backup_20260410.sql.gz | docker exec -i crm-postgres psql -U crm crm_v4

# Auto backup (cron)
crontab -e
0 3 * * * docker exec crm-postgres pg_dump -U crm crm_v4 | gzip > /opt/backups/crm_$(date +\%Y\%m\%d).sql.gz
```

### Monitoring

```bash
pm2 status                    # App health
curl localhost:3010/api/v1/health   # API health
df -h                         # Disk
free -h                       # RAM
```

---

## Tóm tắt commands

| Việc | Command |
|------|---------|
| Setup VPS | `./scripts/setup-vps.sh` |
| Deploy | `./scripts/deploy.sh` |
| Deploy từ local | `ssh root@VPS "cd /opt/crm-v4 && ./scripts/deploy.sh"` |
| Xem logs | `pm2 logs crm-api` |
| Restart app | `pm2 restart crm-api` |
| Vào DB | `docker exec -it crm-postgres psql -U crm crm_v4` |
| NPM UI | `ssh -L 81:localhost:81 root@VPS` → `localhost:81` |
| Xem port | `pm2 status && docker ps` |
| Backup DB | `docker exec crm-postgres pg_dump -U crm crm_v4 \| gzip > backup.sql.gz` |
