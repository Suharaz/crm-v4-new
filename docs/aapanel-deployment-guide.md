# aaPanel Deployment Guide — Multi-Project VPS

> Guide setup VPS với aaPanel 7.x để deploy nhiều dự án Node.js (NestJS + Next.js).
> Thiết kế reusable: thêm project mới chỉ cần lặp lại **Phần 5**.
> Facts đã verify từ aapanel.com docs + forum.aapanel.com + GitHub aaPanel (xem `plans/reports/research-260410-1114-aapanel-facts.md`).

## Cảnh báo quan trọng trước khi đọc

1. **aaPanel có HAI hệ Node.js management overlap nhau:** "Node Project" (dưới menu Website) và "PM2 Manager" (plugin). **Chỉ chọn MỘT**. Guide này dùng **PM2 Manager** + manual CLI cho consistency với `ecosystem.config.cjs`.
2. **aaPanel UI regenerate vhost nginx mỗi lần save site settings** → custom nginx blocks edit trực tiếp file sẽ bị wipe. Dùng **"Customized Configuration Files"** để persistent (xem Phần 3.3).
3. **Firewall:** aaPanel Security tab drive `ufw` trên Ubuntu. **KHÔNG** chạy `ufw` CLI song song → desync. Quản 1 chỗ duy nhất.
4. **CVE-2022-28117** ảnh hưởng aaPanel ≤ 6.6.6 (authenticated RCE qua Cron). Guide này yêu cầu aaPanel **7.x trở lên**.

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
- **Reverse proxy:** aaPanel 7 **"Proxy Project"** site type (top-level) — không tạo wwwroot, pure reverse proxy, SSL 1-click
- **Custom nginx blocks:** dùng **"Customized Configuration Files"** (persistent, không bị wipe khi regenerate vhost)
- **SSL:** Let's Encrypt **DNS-01 qua Cloudflare API token** — end-to-end encryption, không cần grey-cloud toggle
- **Runtime:** PM2 Manager plugin + Node.js Version Manager plugin (apps) + Docker Manager plugin (PG/Redis infra)
- **Auto-deploy:** GitHub Actions → SSH → `scripts/deploy.sh` (logs đầy đủ, control tốt)

---

## Phần 1: Setup VPS lần đầu

### 1.1 Yêu cầu VPS

- Ubuntu 22.04 LTS (khuyến nghị) hoặc Debian 12
- Tối thiểu 2 vCPU / 4GB RAM / 40GB SSD (cho 2-3 projects)
- Public IPv4
- Port mở: 22 (SSH), 80, 443, **8888** (aaPanel default panel port)

### 1.2 Cài aaPanel 7.x

```bash
# SSH với root
ssh root@YOUR_VPS_IP

# Cài aaPanel 7.x (English)
URL=https://www.aapanel.com/script/install_7.0_en.sh && \
  if [ -f /usr/bin/curl ];then curl -ksSO "$URL";else wget --no-check-certificate -O install_7.0_en.sh "$URL";fi; \
  bash install_7.0_en.sh aapanel
```

Sau khi cài xong, script in ra:
```
aaPanel Internet address: https://YOUR_VPS_IP:8888/<random-entrance>
username: <random>
password: <random>
```

**Lưu lại ngay** — hoặc dùng các `bt` commands sau:

| Command | Tác dụng |
|---------|----------|
| `bt default` | Hiển thị panel URL + username + password hiện tại |
| `bt 14` | Hiển thị/đổi Security Entrance (secret path) |
| `bt 5` | Reset password |
| `bt 8` | Đổi panel port (mặc định 8888) |
| `bt 22` | Bật/tắt BasicAuth |

### 1.3 Cấu hình firewall — CHỈ qua aaPanel Security tab

⚠️ **KHÔNG** chạy `ufw` CLI song song với aaPanel Security tab. aaPanel wrap `ufw` (Ubuntu) hoặc `firewalld` (RHEL) — rules thêm qua CLI có thể không hiện lên UI và ngược lại → desync.

Login aaPanel → **Security** → ensure các port mở:
- 22 (SSH) — hoặc port SSH custom
- 80, 443 (web)
- 8888 (panel) — sẽ đổi ở Phần 1.8

Nếu lỡ enable ufw từ CLI trước khi cài aaPanel:
```bash
# Reset + để aaPanel tự manage
ufw disable
ufw --force reset
# Sau đó login aaPanel Security tab để add rules
```

### 1.4 Cài software qua aaPanel App Store

Vào **App Store** (Software Store) → cài theo **thứ tự sau** (quan trọng):

1. **Nginx** (latest stable) — reverse proxy cho tất cả sites
2. **Node.js Version Manager** — plugin nvm-based, install TRƯỚC PM2 Manager
3. **PM2 Manager** — depends on Node.js Version Manager ở bước 2
4. **Docker Manager** — quản lý PostgreSQL + Redis containers
5. **Fail2ban** — chống brute force SSH (nếu chưa có)

⚠️ **Tránh:**
- **KHÔNG** cài MySQL/PostgreSQL qua aaPanel App Store → dùng Docker cho DB (version lock, isolation per-project, khỏi conflict giữa projects cần PG versions khác nhau)
- **KHÔNG** cài phpMyAdmin — mặc định chạy port 888 không SSL, leak credentials. Nếu cần query DB dùng `docker exec -it <container> psql` hoặc SSH tunnel.
- **KHÔNG** dùng "Node Project" dưới menu Website song song với PM2 Manager — hai hệ thống overlap nhau, gây lẫn lộn.

### 1.5 Cài Node.js 20 qua Node.js Version Manager plugin

Vào **App Store → Node.js Version Manager → Settings** (hoặc **Website → Node Project → Node Version Manager** tuỳ aaPanel version):
- Click **Install** cho Node.js **20.x** (LTS)
- Set as **default**

Sau đó SSH vào VPS (plugin tự thêm node vào PATH):
```bash
# Verify
node -v   # v20.x.x
npm -v

# Cài pnpm + pm2 global
npm install -g pnpm@latest pm2

# PM2 auto-start on reboot
pm2 startup systemd -u root --hp /root
# Copy command nó in ra và chạy nguyên văn (có sudo)
```

> **Lưu ý:** Nếu dùng user `deploy` (non-root), chạy `pm2 startup` dưới user đó và adjust `-u deploy --hp /home/deploy`.

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

### 1.8 Hardening aaPanel (BẮT BUỘC trước khi dùng production)

aaPanel default install **không** an toàn — panel mở port 8888 world-wide, SSH thường 22, không 2FA. Làm các bước sau ngay sau khi login lần đầu:

| # | Hành động | Command/Location |
|---|-----------|------------------|
| 1 | Đổi panel port khỏi 8888 | `bt 8` → nhập port mới (ví dụ 18988) |
| 2 | Set Security Entrance (secret path) | `bt 14` → panel URL trở thành `https://IP:PORT/<secret>` |
| 3 | Đổi admin username + strong password | Panel Settings → User Info |
| 4 | Enable 2FA (Google Authenticator) | Panel Settings → Security → 2FA |
| 5 | IP whitelist cho panel | Security → Authorization IP → add IP nhà/VPN |
| 6 | Enable BasicAuth layer | `bt 22` — HTTP auth trước login form |
| 7 | Enable brute-force protection | Panel Settings → Security |
| 8 | Issue SSL cho panel (self-signed hoặc LE) | Panel Settings → Panel SSL |
| 9 | Disable Developer Mode | Panel Settings → Developer Mode OFF |
| 10 | Update aaPanel latest | Panel Settings → Update |

Sau khi đổi panel port, update firewall Security tab mở port mới + đóng 8888.

> **Gợi ý thực tế:** panel không cần public 24/7. Một số team bind panel về 127.0.0.1 + SSH tunnel khi cần access (`ssh -L 18988:127.0.0.1:18988 deploy@VPS`). Không có gì không expose thì không bị attack.

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

### 3.1 Tạo site bằng "Proxy Project" (aaPanel 7.x)

aaPanel 7 có **top-level "Proxy Project"** site type dành riêng cho reverse proxy — cleaner hơn Website thường vì không tạo wwwroot, không có PHP, không có DB.

aaPanel UI → **Website (sidebar) → Proxy Project (tab)** → **Add Proxy**:
- **Proxy name:** `crm-web` (identifier nội bộ)
- **Domain:** `crm.yourdomain.com`
- **Target URL:** `http://127.0.0.1:3011` (port Next.js)
- **Sending domain name:** `$host` (giữ nguyên host header)
- **Enable cache:** ❌ (Next.js tự quản cache)
- **Submit**

> **Nếu aaPanel version của bạn không có "Proxy Project":** fallback dùng **Website → Add site** với PHP version = "Pure static", sau đó vào site Settings → **Reverse Proxy** tab → Add với target `http://127.0.0.1:3011`. Cả hai cách cùng tạo file `/www/server/panel/vhost/nginx/<domain>.conf`.

### 3.2 Thêm location cho API + files — QUAN TRỌNG: dùng Customized Configuration

⚠️ **Gotcha lớn:** aaPanel sẽ **regenerate** file vhost `<domain>.conf` mỗi khi bạn save site settings qua UI. Bất kỳ edit trực tiếp nào vào file đó sẽ bị **wipe**. Phải dùng **"Customized Configuration Files"** — một include file riêng mà aaPanel không overwrite.

Site (trong Proxy Project list) → click tên site → mở Settings modal → tab **Config File** → scroll xuống thấy **"Customized Configuration Files"** (tiếng TQ: 用户自定义配置) → paste block dưới:

```nginx
# ===== Custom config cho CRM — survives aaPanel regeneration =====

client_max_body_size 10M;

# API routes → NestJS (port 3010)
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

# File uploads — serve từ NestJS
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

**Save** → aaPanel tự `nginx -t && reload`. Nếu syntax lỗi, save sẽ revert và báo error.

### 3.3 Verify vhost structure

```bash
# File vhost chính (aaPanel regenerate)
cat /www/server/panel/vhost/nginx/crm.yourdomain.com.conf

# Include file customized (safe để edit)
ls /www/server/panel/vhost/nginx/
# → thường có thêm file *.custom hoặc include inline trong vhost chính
```

### 3.4 SSL với Let's Encrypt — 2 strategies

**Chiến lược A: DNS-01 qua Cloudflare API (KHUYẾN NGHỊ)**

Ưu điểm: không cần tạm tắt Cloudflare proxy, support wildcard, auto-renew clean.

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token**
   - Template: **Edit zone DNS**
   - Zone Resources: Include → Specific zone → `yourdomain.com`
   - Copy token
2. aaPanel site → **SSL** tab → **Let's Encrypt** sub-tab → chọn **"DNS API"** method
3. Provider: **Cloudflare** → paste API token
4. Check domain + **Apply** → aaPanel dùng DNS-01 challenge → cert cấp sau ~1-2 phút
5. Tick **Force HTTPS** (HTTP → 301 → HTTPS)

**Chiến lược B: HTTP-01 (fallback nếu không có CF API access)**

1. Cloudflare DNS: **tạm OFF proxy** (grey cloud)
2. aaPanel SSL → Let's Encrypt → HTTP method → Apply
3. Sau khi cert cấp xong → bật lại **Proxied** (orange cloud)
4. Tick **Force HTTPS**
5. Auto-renew sẽ fail định kỳ → phải grey-cloud toggle lại mỗi 60-90 ngày. **Khuyến nghị chuyển sang Strategy A**.

> **Cloudflare Origin Cert (option C):** free 15-year cert từ Cloudflare, paste vào aaPanel SSL → "Other Certificate". Không rate-limit. Chỉ valid khi request đi qua Cloudflare — direct IP access sẽ fail SSL. OK cho prod CRM.

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

## Phần 7: Troubleshooting & Gotchas

### Gotchas chung của aaPanel (đọc trước khi gặp)

| Lỗi | Nguyên nhân | Cách tránh |
|-----|-------------|------------|
| Custom nginx blocks bị mất | Edit raw file `<domain>.conf`, aaPanel regenerate khi save settings | **Luôn** dùng **"Customized Configuration Files"** |
| Reverse proxy biến mất sau "Repair" | Site Settings → Repair button wipe proxy config (forum bug) | Đừng click Repair trừ khi biết rõ. Backup vhost trước |
| Firewall rules desync | Chạy `ufw` CLI sau khi aaPanel đã add rules | Quản firewall **1 chỗ duy nhất** — chỉ Security tab |
| PM2 Manager ↔ Node Project confusion | Hai hệ Node.js management song song | Chỉ dùng MỘT. Guide này dùng PM2 Manager |
| LE HTTP-01 fail khi CF proxied | Cloudflare TLS termination | Dùng DNS-01 với CF API token (Phần 3.4 Strategy A) |
| phpMyAdmin port 888 leak | Mặc định no SSL | **Không cài** hoặc disable ngay. Dùng SSH tunnel |
| `bt` commands not found | PATH chưa load | `source /etc/profile` hoặc logout/login lại |

### 502 Bad Gateway từ Nginx
- `pm2 status` — app có online không?
- `pm2 logs <app> --err --lines 50` — xem error
- `curl http://127.0.0.1:<port>` từ VPS — app trả lời không?
- Nginx config `proxy_pass` sai port? → check `/www/server/panel/vhost/nginx/<domain>.conf`
- aaPanel đã reload nginx chưa? → `nginx -s reload` hoặc Site → Settings save lại

### Let's Encrypt cert fail
- **Method HTTP:** Cloudflare proxy ON → tạm OFF hoặc switch sang DNS-01
- DNS chưa propagate → `dig crm.yourdomain.com @1.1.1.1`
- Port 80 bị chặn → check aaPanel Security tab (không phải `ufw status`)
- Rate limit LE (5 cert/tuần/domain) → đợi hoặc dùng staging
- **Method DNS-01:** CF API token sai scope → token cần **Zone.DNS.Edit** cho đúng zone

### GitHub Actions SSH fail
- Secret `VPS_SSH_KEY` phải là PRIVATE key (bao gồm `-----BEGIN OPENSSH PRIVATE KEY-----` và `-----END...`), không phải public key
- User trên VPS phải có public key tương ứng trong `~/.ssh/authorized_keys`
- Nếu đổi SSH port khác 22 → set secret `VPS_PORT`
- aaPanel Fail2ban block IP GitHub Actions runner → add GitHub IP ranges vào whitelist, hoặc tăng maxretry

### PM2 không auto-start sau reboot
```bash
pm2 startup systemd -u root --hp /root
# Copy command nó in ra (có sudo) và chạy nguyên văn
pm2 save
# Verify
systemctl status pm2-root
```

### aaPanel Repair button xoá reverse proxy
Nếu lỡ click Repair và mất config:
1. Mở `/www/server/panel/vhost/nginx/<domain>.conf` — có thể còn backup `.bak`
2. Hoặc re-add qua **Proxy Project → Add** + paste lại Customized Config
3. **Bài học:** backup vhost folder định kỳ: `tar czf vhost-backup.tgz /www/server/panel/vhost/nginx/`

### Docker port conflict khi thêm project
```bash
ss -tlnp | grep <port>    # Xem process nào giữ
# Đổi port trong docker-compose.prod.yml + .env.production + ecosystem.config.cjs
```

### Next.js build fail "out of memory"
```javascript
// ecosystem.config.cjs env:
env: {
  NODE_ENV: 'production',
  NODE_OPTIONS: '--max-old-space-size=2048',
}
```

### Mất credentials panel
```bash
bt default     # In ra URL + username + password hiện tại
bt 5           # Reset password (nhập mới)
bt 14          # Xem/đổi Security Entrance
```

---

## Tóm tắt quick reference

```bash
# === Setup VPS lần đầu (1 lần) ===
ssh root@VPS
URL=https://www.aapanel.com/script/install_7.0_en.sh && \
  curl -ksSO "$URL" && bash install_7.0_en.sh aapanel
bt default   # lấy URL + credentials

# Hardening NGAY (bt 8, bt 14, 2FA, IP whitelist, panel SSL)

# App Store (thứ tự): Nginx → Node.js Version Manager → PM2 Manager → Docker Manager → Fail2ban
# App Store → Node.js Version Manager → install Node 20 → set default
npm i -g pnpm pm2 && pm2 startup systemd -u root --hp /root

# === Deploy project (per project) ===
cd /opt && git clone ... && cd <project>
cp .env.production.example .env.production && nano .env.production
chmod +x scripts/*.sh && ./scripts/deploy.sh

# aaPanel UI: Website → Proxy Project → Add (target http://127.0.0.1:WEB_PORT)
#   → Settings → Config File → Customized Configuration Files → paste /api/ + /files/ blocks
#   → SSL tab → Let's Encrypt → DNS API → Cloudflare → API token → Apply → Force HTTPS

# Cloudflare: DNS A record → Proxied ☁️ | SSL/TLS mode: Full (Strict)

# GitHub: Secrets (VPS_HOST, VPS_USER, VPS_SSH_KEY, VPS_PORT)
#   + .github/workflows/deploy.yml

# === Daily ops ===
pm2 status / pm2 logs <app>
docker ps / docker logs <container>
git push → GitHub Actions → auto deploy via SSH
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
