# aaPanel Deployment Guide — Multi-Project VPS

> Guide setup VPS với aaPanel để deploy nhiều dự án Node.js (NestJS + Next.js).
> Thiết kế reusable: thêm project mới chỉ cần lặp lại **Phần 5**.

## Kiến trúc

```
                    Cloudflare (DNS + CDN + WAF)
                    SSL mode: Full (Strict)
                              ↓
                    VPS :80/:443 (aaPanel Nginx)
                              ↓
              ┌───────────────┼───────────────┐
              ↓               ↓               ↓
     crm.domain.com   app-b.domain.com   app-c.domain.com
     → localhost:3011 → localhost:3021   → localhost:3031
     + /api/ → :3010  + /api/ → :3020    + /api/ → :3030

PM2 processes:         crm-api (3010), crm-web (3011)
                       appb-api (3020), appb-web (3021)
                       ...

Docker infrastructure: crm-postgres (5433), crm-redis (6380)
                       appb-postgres (5434), appb-redis (6381)
                       ...

aaPanel: Nginx sites + SSL certs + File manager + Monitoring
GitHub Actions: push → SSH → deploy.sh per project
```

**Quyết định kiến trúc:**
- **Reverse proxy:** aaPanel Website (Nginx) — mỗi project = 1 site, SSL 1-click
- **SSL:** Full (Strict) + Let's Encrypt trên VPS — end-to-end encryption
- **Runtime:** PM2 cho apps (fast restart) + Docker cho infra (isolation, version lock)
- **Auto-deploy:** GitHub Actions → SSH script (logs đầy đủ, control tốt)

---

## Phần 1: Setup VPS lần đầu

### 1.1 Yêu cầu VPS

- Ubuntu 22.04 LTS (khuyến nghị) hoặc Debian 12
- Tối thiểu 2 vCPU / 4GB RAM / 40GB SSD (cho 2-3 projects)
- Public IPv4
- Port mở: 22 (SSH), 80, 443, **8888** (aaPanel default panel port)

### 1.2 Cài aaPanel

```bash
# SSH với root
ssh root@YOUR_VPS_IP

# Cài aaPanel (bản tiếng Anh)
URL=https://www.aapanel.com/script/install_7.0_en.sh && \
  wget -O install_7.0_en.sh $URL && \
  bash install_7.0_en.sh aapanel
```

Sau khi cài xong, script in ra:
```
aaPanel Internet address: https://YOUR_VPS_IP:8888/<random-path>
username: <random>
password: <random>
```

**Lưu lại credentials ngay** — hoặc chạy `bt default` để xem lại.

### 1.3 Cấu hình firewall

Trong aaPanel **Security** tab:
- Mở port: 22, 80, 443, 8888
- Đổi SSH port từ 22 → port khác (khuyến nghị), update firewall tương ứng
- Enable SSH key only, tắt password login

Hoặc qua CLI:
```bash
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 8888/tcp
ufw enable
```

### 1.4 Cài software qua aaPanel App Store

Vào **App Store** → cài các app sau:
- **Nginx** (latest stable) — reverse proxy
- **PM2 Manager** (Node.js plugin) — GUI cho PM2
- **Docker Manager** — chạy PostgreSQL + Redis containers
- **Fail2ban** — chống brute force SSH

> **Lưu ý:** KHÔNG cài MySQL/PostgreSQL qua aaPanel. Ta dùng Docker cho DB để version-lock và isolation per-project.

### 1.5 Cài Node.js 20 + pnpm

Vào **PM2 Manager** → **Version Manager** → chọn Node.js **20.x** → Install → Set as default.

Sau đó SSH vào VPS:
```bash
# Verify
node -v   # v20.x.x
npm -v

# Cài pnpm global
npm install -g pnpm@latest
pnpm -v

# Cài PM2 global (nếu plugin chưa cài sẵn)
npm install -g pm2
pm2 startup systemd    # auto-start on reboot
```

### 1.6 Cấu hình SSH deploy key cho GitHub

```bash
# Trên VPS
ssh-keygen -t ed25519 -C "vps-deploy" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub
```

Copy public key → GitHub → **Settings → SSH and GPG keys → New SSH key** (hoặc add vào từng repo → Settings → Deploy keys với write access nếu cần).

Test:
```bash
ssh -T git@github.com
# → Hi <username>! You've successfully authenticated...
```

### 1.7 Tạo user không-root cho deploy (optional nhưng khuyến nghị)

```bash
adduser deploy
usermod -aG docker deploy
usermod -aG sudo deploy

# Copy SSH key
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Từ đây trở đi dùng `deploy@VPS_IP` thay `root@VPS_IP`.

---

## Phần 2: Deploy project (ví dụ CRM V4)

### 2.1 Clone code

```bash
cd /opt
sudo mkdir -p crm-v4 && sudo chown $USER:$USER crm-v4
git clone git@github.com:YOUR_ORG/crm-v4.git crm-v4
cd crm-v4
```

### 2.2 Config environment

```bash
cp .env.production.example .env.production
nano .env.production
```

```env
# Database (Docker container, local only)
DB_PASSWORD=<openssl rand -hex 16>
DATABASE_URL=postgresql://crm:<DB_PASSWORD>@localhost:5433/crm_v4

# Redis
REDIS_PASSWORD=<openssl rand -hex 16>
REDIS_URL=redis://:<REDIS_PASSWORD>@localhost:6380

# JWT secrets
JWT_SECRET=<openssl rand -hex 32>
JWT_REFRESH_SECRET=<openssl rand -hex 32>

# URLs
FRONTEND_URL=https://crm.yourdomain.com
NEXT_PUBLIC_API_URL=https://crm.yourdomain.com/api/v1

# Ports (xem bảng port convention ở Phần 5)
API_PORT=3010
WEB_PORT=3011
```

### 2.3 Chạy deploy script

```bash
chmod +x scripts/*.sh
./scripts/deploy.sh
```

Script flow: `git pull → docker compose up (PG+Redis) → pnpm install → db:generate → db:push → build → pm2 reload`.

### 2.4 Seed data (lần đầu)

```bash
source .env.production
pnpm db:seed
```

### 2.5 Verify local

```bash
pm2 status                              # crm-api + crm-web online
curl http://localhost:3010/api/v1/health  # {"status":"ok"}
curl http://localhost:3011                # Next.js HTML
docker ps                                # crm-postgres + crm-redis
```

---

## Phần 3: Cấu hình domain trong aaPanel

### 3.1 Thêm Website

aaPanel UI → **Website → Add site**:
- **Domain:** `crm.yourdomain.com`
- **Root directory:** `/www/wwwroot/crm.yourdomain.com` (aaPanel tự tạo, ta không dùng)
- **PHP version:** Pure static (không PHP)
- **Database:** None
- **FTP:** None

→ **Submit**.

### 3.2 Convert site thành reverse proxy

Site vừa tạo → **Settings** → **Reverse Proxy** → **Add Reverse Proxy**:
- **Proxy name:** `crm-web`
- **Target URL:** `http://127.0.0.1:3011`
- **Send domain:** `$host`
- **Enable proxy:** ✅

→ **Submit**.

### 3.3 Thêm location cho API (critical)

Site → **Settings** → **Config file** → thêm **TRƯỚC** block reverse proxy `location /`:

```nginx
client_max_body_size 10M;

# API routes → NestJS
location /api/ {
    proxy_pass http://127.0.0.1:3010;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 300s;
}

# File uploads
location /files/ {
    proxy_pass http://127.0.0.1:3010;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}

# Health check
location = /health {
    proxy_pass http://127.0.0.1:3010/api/v1/health;
    access_log off;
}
```

Save → aaPanel tự reload Nginx. Nếu lỗi syntax, xem **Logs** tab.

### 3.4 SSL với Let's Encrypt

Site → **Settings** → **SSL** → tab **Let's Encrypt**:
- Check domain(s)
- **Apply**

aaPanel tự chạy ACME HTTP-01 challenge. Sau ~30s cert được cấp.

→ Tick **Force HTTPS** để redirect 80 → 443.

> **Lưu ý Cloudflare:** Khi request LE cert, Cloudflare proxy phải **OFF** tạm thời (grey cloud) để ACME challenge đi trực tiếp về VPS. Sau khi có cert, bật lại Proxied ☁️.

### 3.5 Cloudflare DNS

Vào Cloudflare dashboard → domain → **DNS → Records**:

| Type | Name | Content | Proxy | TTL |
|------|------|---------|-------|-----|
| A | crm | `YOUR_VPS_IP` | Proxied ☁️ | Auto |

**SSL/TLS mode:** Full (Strict) — Overview tab → SSL/TLS → chọn **Full (strict)**.

**Edge Certificates:**
- ✅ Always Use HTTPS
- ✅ Automatic HTTPS Rewrites
- Min TLS Version: 1.2

### 3.6 Verify public

```bash
curl -I https://crm.yourdomain.com
# HTTP/2 200
# server: cloudflare

curl https://crm.yourdomain.com/health
# {"status":"ok"}
```

---

## Phần 4: GitHub Actions auto-deploy

### 4.1 GitHub Secrets

Repo → **Settings → Secrets and variables → Actions** → New secret:

| Name | Value |
|------|-------|
| `VPS_HOST` | `YOUR_VPS_IP` |
| `VPS_USER` | `deploy` (hoặc `root`) |
| `VPS_SSH_KEY` | Nội dung `~/.ssh/id_ed25519` (private key) từ máy có quyền SSH vào VPS |
| `VPS_PORT` | SSH port (nếu khác 22) |

Để lấy private key: local `cat ~/.ssh/id_ed25519` → copy TOÀN BỘ bao gồm `-----BEGIN/END-----`.

Public key tương ứng phải có trong `~/.ssh/authorized_keys` của user `deploy` trên VPS.

### 4.2 Workflow file `.github/workflows/deploy.yml`

File này đã tồn tại ở commit `16bb453`. Template:

```yaml
name: Deploy to VPS

on:
  push:
    branches: [master]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_PORT || 22 }}
          script: |
            cd /opt/crm-v4
            ./scripts/deploy.sh
```

### 4.3 Test flow

```bash
# Local
git commit -am "test: auto-deploy"
git push origin master
```

→ GitHub → Actions tab → xem job chạy realtime → SSH logs từ `deploy.sh` hiện ra.

---

## Phần 5: Thêm project mới (Playbook)

**Đây là phần reusable.** Mỗi khi thêm project, lặp lại các bước dưới.

### 5.1 Port allocation

Quy ước: project thứ **N** dùng:
- API: `30N0`, Web: `30N1`
- PostgreSQL: `543(N+2)`, Redis: `638N`

| # | Project | API | Web | PG | Redis |
|---|---------|-----|-----|------|-------|
| 1 | crm-v4 | 3010 | 3011 | 5433 | 6380 |
| 2 | app-b | 3020 | 3021 | 5434 | 6381 |
| 3 | app-c | 3030 | 3031 | 5435 | 6382 |
| 4 | app-d | 3040 | 3041 | 5436 | 6383 |

**Kiểm tra port đang dùng trước khi chọn:**
```bash
pm2 status
docker ps --format "table {{.Names}}\t{{.Ports}}"
ss -tlnp | grep LISTEN
```

### 5.2 Checklist thêm project mới

```
[ ] 1. Clone repo vào /opt/<project-name>
[ ] 2. Tạo .env.production với ports unique
[ ] 3. Tạo docker-compose.prod.yml (PG + Redis, ports unique, container names prefix)
[ ] 4. Tạo ecosystem.config.cjs (PM2, app names prefix, ports unique, logs dir riêng)
[ ] 5. Tạo scripts/deploy.sh (copy từ crm-v4, sửa APP_DIR)
[ ] 6. Tạo .github/workflows/deploy.yml (copy, sửa path)
[ ] 7. Add GitHub Secrets (nếu repo khác)
[ ] 8. Run deploy script lần đầu trên VPS
[ ] 9. aaPanel → Add Website → Reverse Proxy → Nginx config (/api/ + /files/)
[ ] 10. aaPanel → SSL → Let's Encrypt → Force HTTPS
[ ] 11. Cloudflare → Add A record → Proxied
[ ] 12. Verify public domain
[ ] 13. Update docs/project-changelog.md với project mới
```

### 5.3 Template files cho project mới

**`docker-compose.prod.yml`** — thay `<NAME>`, `<N>`:
```yaml
services:
  <NAME>-postgres:
    image: postgres:16-alpine
    container_name: <NAME>-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: <NAME>
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: <NAME>_db
    ports:
      - "127.0.0.1:543<N+2>:5432"
    volumes:
      - <NAME>-pgdata:/var/lib/postgresql/data

  <NAME>-redis:
    image: redis:7-alpine
    container_name: <NAME>-redis
    restart: unless-stopped
    command: redis-server --requirepass ${REDIS_PASSWORD}
    ports:
      - "127.0.0.1:638<N>:6379"
    volumes:
      - <NAME>-redisdata:/data

volumes:
  <NAME>-pgdata:
  <NAME>-redisdata:
```

**`ecosystem.config.cjs`** — PM2 config:
```javascript
module.exports = {
  apps: [
    {
      name: '<NAME>-api',
      cwd: './apps/api',
      script: 'dist/main.js',
      instances: 1,
      env: { NODE_ENV: 'production', PORT: 30<N>0 },
      error_file: '../../logs/api-error.log',
      out_file: '../../logs/api-out.log',
      max_memory_restart: '500M',
    },
    {
      name: '<NAME>-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 30<N>1',
      instances: 1,
      env: { NODE_ENV: 'production' },
      error_file: '../../logs/web-error.log',
      out_file: '../../logs/web-out.log',
      max_memory_restart: '500M',
    },
  ],
};
```

### 5.4 Context prompt cho AI khi thêm project

Copy đoạn này khi nhờ Claude tạo deployment cho project mới:

```
## Deployment Context

VPS đã có: aaPanel + Node.js 20 + pnpm + PM2 + Docker
Reverse proxy: aaPanel Website (Nginx) — mỗi project 1 site
SSL: Let's Encrypt qua aaPanel + Cloudflare Full (Strict)
Auto-deploy: GitHub Actions → SSH script

## Port convention
App: API=30N0, Web=30N1 (N = project number)
Infra: PG=543(N+2), Redis=638N

Ports đã dùng: [chạy `pm2 status` + `docker ps` để list]
Project number kế tiếp: N=?

## Files cần tạo
1. docker-compose.prod.yml — PG + Redis, container names prefix, ports unique
2. ecosystem.config.cjs — PM2 apps, names prefix, ports unique
3. scripts/deploy.sh — git pull → docker up → install → build → pm2 reload
4. .env.production.example
5. .github/workflows/deploy.yml
6. Nginx config cho /api/ + /files/ location (paste vào aaPanel site config)

## Quy tắc
- Container names + PM2 app names phải prefix bằng <project-name>
- Mỗi project có logs/ riêng
- .env.production KHÔNG commit
- Follow docs/aapanel-deployment-guide.md (file này)
```

---

## Phần 6: Operations hàng ngày

### 6.1 PM2 commands

```bash
pm2 status                           # Tất cả apps
pm2 logs crm-api --lines 100         # Logs
pm2 restart crm-api                  # Restart 1 app
pm2 reload ecosystem.config.cjs      # Zero-downtime reload
pm2 monit                            # Realtime monitor
pm2 flush                            # Clear logs
```

### 6.2 Docker commands

```bash
docker ps                                          # Containers
docker logs crm-postgres --tail 50                 # DB logs
docker exec -it crm-postgres psql -U crm crm_v4    # Vào DB
docker compose -f docker-compose.prod.yml restart  # Restart infra
```

### 6.3 aaPanel operations

Qua UI:
- **Website** → status, logs, bandwidth per site
- **Security** → firewall, fail2ban
- **Monitor** → CPU/RAM/Disk realtime graphs
- **Cron** → schedule backup, health check
- **File** → browse /opt, /www, edit Nginx config

### 6.4 Backup database (auto cron)

aaPanel → **Cron** → Add task:
- **Type:** Shell script
- **Name:** `crm-db-backup`
- **Period:** Daily 03:00
- **Script:**
```bash
#!/bin/bash
BACKUP_DIR=/opt/backups/crm
mkdir -p $BACKUP_DIR
docker exec crm-postgres pg_dump -U crm crm_v4 | gzip > $BACKUP_DIR/crm_$(date +\%Y\%m\%d).sql.gz
# Giữ 30 ngày
find $BACKUP_DIR -name "crm_*.sql.gz" -mtime +30 -delete
```

### 6.5 Log rotation

PM2:
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

Nginx logs đã được aaPanel rotate sẵn (xem **Website → Settings → Log**).

### 6.6 Health monitoring

aaPanel **Cron** job mỗi 5 phút:
```bash
for url in https://crm.yourdomain.com/health; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$code" != "200" ]; then
    echo "$(date) $url returned $code" >> /var/log/healthcheck.log
    # Optional: send alert via curl to webhook
  fi
done
```

---

## Phần 7: Troubleshooting

### 502 Bad Gateway từ Nginx
- `pm2 status` — app có online không?
- `pm2 logs <app> --err` — xem error
- `curl http://127.0.0.1:<port>` từ VPS — app trả lời không?
- Nginx config sai `proxy_pass` port?

### Let's Encrypt cert fail
- Cloudflare proxy đang ON → tạm OFF (grey cloud) → apply cert → bật lại
- Domain DNS chưa propagate → `dig crm.yourdomain.com` check
- Port 80 bị chặn → `ufw status` + CF Firewall rules

### GitHub Actions SSH fail
- Secret `VPS_SSH_KEY` phải là PRIVATE key (có `-----BEGIN`), public key không chạy
- User trên VPS phải có public key tương ứng trong `~/.ssh/authorized_keys`
- Nếu SSH port khác 22, set secret `VPS_PORT`

### PM2 không auto-start sau reboot
```bash
pm2 startup systemd -u $USER --hp /home/$USER
# Copy command nó in ra và chạy với sudo
pm2 save
```

### Docker port conflict khi thêm project
```bash
ss -tlnp | grep <port>    # Xem process nào giữ
# Đổi port trong docker-compose.prod.yml + .env.production + ecosystem.config.cjs
```

### Next.js build fail "out of memory"
```bash
# .env.production hoặc ecosystem.config.cjs env:
NODE_OPTIONS="--max-old-space-size=2048"
```

---

## Tóm tắt quick reference

```bash
# Setup lần đầu (1 lần)
ssh root@VPS && bash install aapanel.sh
aaPanel UI → App Store → Nginx, PM2 Manager, Docker, Fail2ban
aaPanel → PM2 Manager → Node 20 → Set default
npm i -g pnpm pm2 && pm2 startup

# Deploy project (per project)
cd /opt && git clone ... && cd <project>
cp .env.production.example .env.production && nano .env.production
./scripts/deploy.sh

# aaPanel: Website → Add → Reverse Proxy → SSL LE
# Cloudflare: A record → Proxied + Full (Strict)
# GitHub: Secrets + .github/workflows/deploy.yml

# Daily ops
pm2 status / pm2 logs <app>
docker ps / docker logs <container>
git push → auto deploy
```

---

## Related docs

- `docs/vps-deployment-guide.md` — guide cũ (NPM-based, legacy reference)
- `docs/deployment-guide.md` — deployment nội bộ CRM
- `CLAUDE.md` — project overview + architecture rules
- `.github/workflows/deploy.yml` — CI/CD config
- `scripts/deploy.sh` — deploy script logic
- `docker-compose.prod.yml` — infrastructure definition
- `ecosystem.config.cjs` — PM2 processes
