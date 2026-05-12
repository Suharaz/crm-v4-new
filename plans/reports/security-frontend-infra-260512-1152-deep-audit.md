# Security Deep Audit - Frontend (Next.js) + Infrastructure (Docker/nginx/CI)

**Date:** 2026-05-12
**Scope:** `apps/web/`, `docker-compose*.yml`, `nginx/`, `scripts/*.sh`, `.github/workflows/`, `.env.*.example`, `ecosystem.config.cjs`
**Backend (NestJS) auth hardening + scans:** đã cover trong report trước (`security-scan-260512-1110-crm-v4-full.md`). Audit này chỉ chạm backend khi cần verify cookie/CORS trust boundary.

Tổng: 13 findings (1 Critical, 4 High, 5 Medium, 2 Low, 1 Info).

---

## FIND-001 - Next.js 15.5.14 has unpatched middleware-bypass advisories (May 2026)

- **Severity:** Critical | CVSS 9.1 (GHSA-267c-6grr-h53f / GHSA-26hh-7cqf-hhc6 / GHSA-492v-c6pp-mqqv)
- **File:** `apps/web/package.json:27` (`"next": "^15.3.0"` → resolved `15.5.14` per `pnpm-lock.yaml:3697`)
- **Description:** Ngày 2026-05-06/07 Vercel publish 10 advisories cho App Router. Trong đó 3 HIGH "Middleware / Proxy bypass" cùng family với CVE-2025-29927 (đã fix 15.2.3). Patched line 15.5.16+. Project pin 15.5.14 → vulnerable.
- **Impact:** Bypass middleware auth check tại `apps/web/src/middleware.ts:26-48`. Attacker craft segment-prefetch hoặc dynamic-route-param request có thể truy cập `/dashboard/*` mà không cần `access_token` cookie hợp lệ. Vì middleware là Edge layer routing-only (`isTokenExpired` chỉ check structure, không verify signature), bypass tại layer này không lộ data trực tiếp - NestJS vẫn 401 nếu thiếu Authorization Bearer. Tuy nhiên server components trong `(dashboard)` group có thể leak data: `apps/web/src/lib/auth.ts:36` `getCurrentUser()` chạy SSR và có thể trả về user data nếu cookie hiện diện (kể cả expired chưa được catch ở edge).
- **Remediation:** `pnpm up next@15.5.16 -w` (hoặc cao hơn), build lại, deploy. Verify bằng `pnpm list next` sau update. Sau update, double-check middleware matcher (`config.matcher` line 51) còn cover hết route protected.
- **References:** CWE-285 (Improper Authorization), OWASP A01:2021 - Broken Access Control. GHSA: `26hh-7cqf-hhc6`, `267c-6grr-h53f`, `492v-c6pp-mqqv`.

---

## FIND-002 - `SameSite=Lax` cho refresh_token cookie - CSRF risk trên top-level navigation

- **Severity:** High | CVSS 7.4 (CWE-352)
- **File:** `apps/web/src/app/api/auth/[...action]/route.ts:40-42` (login), `:71-73` (refresh), `apps/web/src/app/api/proxy/[...path]/route.ts:82-84`
- **Description:** Cookies `access_token` và `refresh_token` set `SameSite=Lax`. Lax cho phép cookie gửi kèm trong top-level GET navigation (`<a>`, `window.location`). Hệ thống có nhiều route GET state-changing thông qua proxy/template download (`/api/proxy/bank-transactions/import/template`, `/api/proxy/payments/export`). Attacker site có thể tạo `<a href="https://crm.taki.vn/api/proxy/...">` trigger CSRF với cookie kèm.
- **Real exposure low**: NestJS API endpoints không có GET nào mutate state (verified - PATCH/POST/DELETE chỉ chạy qua fetch+JSON từ same-origin), nhưng đây là defense-in-depth.
- **Impact:** Nếu trong tương lai thêm GET endpoint side-effecting (vd. `/api/proxy/something/delete?id=...`), attacker external site có thể CSRF. Cookie + same-origin proxy + no CSRF token = chỉ còn SameSite làm phòng tuyến.
- **Remediation:** Đổi `sameSite: 'Strict'` cho `refresh_token` (chỉ dùng trong same-site context). Cho `access_token` có thể giữ Lax vì cần work với login redirect, nhưng nên enforce explicit "stateChanging methods only via fetch" rule. Hoặc thêm `Origin`/`Referer` check cho `/api/proxy/*` POST/PATCH/DELETE routes.
- **References:** CWE-352, OWASP ASVS V3.2.

---

## FIND-003 - Edge middleware không verify JWT signature - chỉ check structure + exp

- **Severity:** High | CVSS 7.5 (CWE-287)
- **File:** `apps/web/src/middleware.ts:9-20, 26-48`
- **Description:** `isTokenExpired()` decode base64 payload bằng `atob` rồi check `exp` và `sub`. KHÔNG verify HMAC signature. Comment line 6-8 thừa nhận: "Edge middleware cannot access JWT_SECRET for full verification."
- **Impact:** Attacker có thể tạo JWT giả với `alg:none` hoặc bất kỳ signature nào, chỉ cần valid base64 + `exp` future + `sub` không rỗng - middleware sẽ **không redirect về /login**. Họ navigate đến `/dashboard`, nhưng:
  - Server Components (`apps/web/src/lib/auth.ts:36 getCurrentUser`) sẽ gọi NestJS `/auth/me` với forged token → NestJS verify signature → trả 401 → catch trả `null` → page render với `user = null`. UI hiển thị nhưng API call sẽ fail.
  - Đây không phải auth bypass thật, nhưng cho phép page rendering với fake "session". Trong combination với FIND-001, risk tăng.
- **Remediation:**
  - Edge runtime KHÔNG dùng được `crypto.verify` với Node secret. Best option: chuyển middleware sang **Node runtime** (Next.js 15+ supports `runtime: 'nodejs'` cho middleware) hoặc gọi NestJS `/auth/verify-token` edge fetch (tăng latency).
  - Acceptable workaround: giữ structure-only check ở middleware, đảm bảo MỌI server component đều check `getCurrentUser()` return non-null trước khi render data. Add tài liệu chính thức rằng middleware = routing only, không trust nó cho auth.
- **References:** CWE-287, CWE-345.

---

## FIND-004 - Auth proxy không validate `refreshToken` length/format trước khi forward

- **Severity:** Medium | CVSS 5.3 (CWE-20)
- **File:** `apps/web/src/app/api/auth/[...action]/route.ts:47-57, 77-84`
- **Description:** Endpoint `/api/auth/refresh` lấy `refreshToken` từ cookie và forward thẳng đến NestJS `/auth/refresh`. Tương tự `/api/auth/logout`. Không validate format/length. Cookie có thể chứa giá trị dài bất thường (DoS body size đến API) hoặc null bytes.
- **Impact:** Thấp - NestJS endpoint dùng class-validator. Nhưng best practice là proxy sanitize trước khi forward.
- **Remediation:** Reject sớm nếu `refreshToken.length > 1024` hoặc chứa whitespace/control chars. Trả 400 ngay tại proxy.
- **References:** CWE-20.

---

## FIND-005 - Open redirect mitigations OK cho login form, nhưng `api-client.ts` chấp nhận pathname không sanitize

- **Severity:** Medium | CVSS 4.3 (CWE-601)
- **File:** `apps/web/src/lib/api-client.ts:28-32`, đối chiếu `apps/web/src/app/(auth)/login/login-form.tsx:11-18`
- **Description:** Khi `api-client` nhận 401, redirect: `window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname)`. `window.location.pathname` luôn bắt đầu bằng `/` và là same-origin → an toàn. Login form có `sanitizeRedirect()` reject protocol-relative/absolute URL. **No open redirect.**
- **Tuy nhiên** middleware tại `apps/web/src/middleware.ts:42-44` build `loginUrl.searchParams.set('redirect', pathname)` - pathname từ `request.nextUrl` cũng same-origin. Không có issue. Note: nếu attacker bằng cách nào nhét `redirect=//evil.com` vào URL (vd. share link), middleware không tạo, nhưng `LoginFormInner:22` xử lý qua `sanitizeRedirect` → safe.
- **Impact:** Hiện không có open redirect khai thác được.
- **Remediation:** Giữ pattern hiện tại. Thêm unit test cho `sanitizeRedirect` (`//evil.com`, `javascript:`, `https://`, `\\evil.com`, `/\\evil.com`).
- **References:** CWE-601, OWASP A01.

---

## FIND-006 - CSP header chưa được set ở Next.js, helmet ở API tắt CSP

- **Severity:** Medium | CVSS 5.4 (CWE-693)
- **File:** `apps/web/next.config.ts:6-28` (chỉ set X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy), `apps/api/src/main.ts:34` (`contentSecurityPolicy: false`)
- **Description:** Helmet API tắt CSP với comment "managed by frontend". Nhưng `next.config.ts` headers không có Content-Security-Policy. Hệ thống hoàn toàn không có CSP.
- **Impact:** Nếu XSS slip qua (hiện không có dangerouslySetInnerHTML, nhưng react-markdown render Markdown từ AI/user input có rủi ro reflected XSS nếu attacker control content), không có CSP làm phòng tuyến chặn `script-src 'self'`, `style-src 'self'`, `img-src 'self' data:`.
- **Remediation:** Add CSP vào `next.config.ts` headers:
  ```ts
  { key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }
  ```
  Tailwind cần `style-src 'unsafe-inline'`. Cần test report-only mode trước khi enforce.
- **References:** OWASP A05:2021, CWE-693.

---

## FIND-007 - Docker containers chạy as default `postgres`/`redis` user nhưng không có resource limits

- **Severity:** Medium | CVSS 5.3 (CWE-770)
- **File:** `docker-compose.yml:2-49`, `docker-compose.prod.yml:3-34`
- **Description:** Cả postgres và redis container chạy với `restart: unless-stopped` nhưng không set `mem_limit`, `cpus`, `pids_limit`, `read_only`, `cap_drop`. Trong dev compose `redis-server --maxmemory 128mb` được set, **trong prod compose KHÔNG có maxmemory** (line 27 `redis-server --appendonly yes --requirepass ...` - missing `--maxmemory`).
- **Impact:**
  - Redis prod có thể consume unlimited memory → OOM kill host.
  - Compromised container có thể fork bomb (no `pids_limit`).
- **Remediation:** Thêm vào `docker-compose.prod.yml`:
  ```yaml
  postgres:
    mem_limit: 2g
    cpus: 2
    cap_drop: [ALL]
    cap_add: [CHOWN, DAC_OVERRIDE, FOWNER, SETGID, SETUID]
  redis:
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru --requirepass ${REDIS_PASSWORD}
    mem_limit: 512m
    cpus: 1
    read_only: true
    tmpfs: /tmp
  ```
- **References:** CWE-770, CIS Docker Benchmark 5.10/5.11.

---

## FIND-008 - nginx config thiếu rate limit, security headers, gzip safety

- **Severity:** Medium | CVSS 5.3 (CWE-693)
- **File:** `nginx/proxy-host.conf:1-35`
- **Description:** nginx proxy config:
  1. Chỉ set `client_max_body_size 10M` (OK cho upload).
  2. Không có `limit_req_zone` cho `/api/auth/login`, `/api/v1/auth/login`. Brute-force chỉ rely vào NestJS Throttler (in-app, không protect khỏi distributed attack hay app crash).
  3. Không có security headers tầng nginx (Strict-Transport-Security, X-Frame-Options) - rely vào Next.js headers, nhưng `/api/` và `/files/` không qua Next.
  4. Thiếu `proxy_read_timeout`, `proxy_connect_timeout` - default 60s có thể đủ, nhưng nên explicit.
  5. Không gắn `proxy_hide_header X-Powered-By` (Express thường lộ).
- **Impact:** Login brute-force khi NestJS down. `/api/v1/*` responses không có HSTS/X-Frame-Options.
- **Remediation:**
  ```nginx
  # Rate limit zones (top-level http{} block)
  limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
  limit_req_zone $binary_remote_addr zone=api:10m rate=60r/m;

  location /api/v1/auth/login {
      limit_req zone=login burst=3 nodelay;
      proxy_pass http://127.0.0.1:3010;
      # ... existing proxy_set_header
  }

  location /api/ {
      limit_req zone=api burst=30 nodelay;
      proxy_pass http://127.0.0.1:3010;
      proxy_hide_header X-Powered-By;
      add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
      add_header X-Content-Type-Options "nosniff" always;
      add_header X-Frame-Options "DENY" always;
      proxy_read_timeout 30s;
      proxy_connect_timeout 5s;
  }
  ```
- **References:** OWASP ASVS V14.4, CWE-307.

---

## FIND-009 - `CsvExportButton` dùng `NEXT_PUBLIC_API_URL` trực tiếp - mất Authorization header

- **Severity:** Medium | CVSS 4.3 (functional bug + minor info disclosure trên error)
- **File:** `apps/web/src/components/shared/csv-export-button.tsx:6, 19`
- **Description:** `window.open(${API_BASE}${exportPath})` với `API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3010/api/v1'`. Production same-origin (`https://crm.taki.vn/api/v1`) → request tới nginx → NestJS port 3010. NestJS dùng Authorization Bearer header (xác minh: `apps/api/src/main.ts:32-35` không config cookie parser, `app.module.ts` không có cookie-parser middleware). `window.open` không thể attach header → 401.
- **Impact:**
  - User click "Xuất CSV" → trang trắng/lỗi 401. Functional break.
  - NestJS GlobalHttpExceptionFilter trả 401 với message → có thể leak path/method nếu chưa generic.
  - Pages affected: `/dashboard/orders`, `/dashboard/leads`, `/dashboard/customers` (mỗi page có CsvExportButton).
- **Remediation:** Thay `NEXT_PUBLIC_API_URL` bằng `/api/proxy` (same pattern với `payment-reconciliation-client.tsx:438`):
  ```ts
  const API_BASE = '/api/proxy';
  // ...
  onClick={() => window.location.href = `${API_BASE}${exportPath}`}
  ```
  Proxy reads cookie và forward Bearer header → CSV download work.
- **References:** Functional bug + CWE-209 (Info Disclosure via error response).

---

## FIND-010 - PostgreSQL/Redis port mở 0.0.0.0 ngầm nếu user sửa `DB_PORT`/`REDIS_PORT` lên `:5433` thiếu prefix

- **Severity:** Low | CVSS 3.7 (CWE-668)
- **File:** `docker-compose.prod.yml:7, 25`
- **Description:** Port binding hardcoded `"127.0.0.1:${DB_PORT:-5433}:5432"` - OK nếu user không sửa template. Nhưng `setup.sh:54-58` cho user nhập custom `DB_PORT`/`REDIS_PORT` - nếu user nhập `0.0.0.0:5433` hoặc số khác sẽ override. Hiện tại template force `127.0.0.1:`, an toàn.
- **Impact:** Nếu admin VPS sửa compose file thủ công và bỏ `127.0.0.1:`, PostgreSQL/Redis sẽ expose ra public với password mặc định (`CHANGE_ME_strong_password` nếu chưa chạy setup). Setup.sh auto-generate password an toàn.
- **Remediation:** Add hard-coded check trong `deploy.sh` để verify password không phải default trước khi `docker compose up`. Hoặc thêm comment cảnh báo trong compose:
  ```yaml
  ports:
    # CRITICAL: Always bind to 127.0.0.1 - DO NOT remove the 127.0.0.1: prefix
    - "127.0.0.1:${DB_PORT:-5433}:5432"
  ```
- **References:** CWE-668.

---

## FIND-011 - `.env.production` được tạo với perms mặc định, có thể world-readable

- **Severity:** Low | CVSS 3.3 (CWE-732)
- **File:** `scripts/deploy.sh:40` (cp), `:74` (source), `:77` (cp to .env); `scripts/setup.sh:98-134` (cat > $ENV_FILE)
- **Description:** Cả 2 script đều tạo `.env.production` không set `chmod 600`. Permission inherit từ umask (thường `0022` → file `0644` world-readable). File chứa `JWT_SECRET`, `JWT_REFRESH_SECRET`, `DB_PASSWORD`, `REDIS_PASSWORD`, `SEPAY_API_KEY`, `OPENAI_API_KEY`. Bất kỳ local user nào trên VPS đều đọc được.
- **Impact:** Multi-tenant VPS (aapanel thường shared) → tenant khác đọc secrets. CI/CD agent user đọc được.
- **Remediation:** Thêm sau create file:
  ```bash
  chmod 600 "$ENV_FILE"
  chmod 600 "$APP_DIR/.env"  # copy used by Prisma
  ```
  Cộng `chown $(whoami):$(whoami)` để chắc owner đúng.
- **References:** CWE-732, OWASP ASVS V6.3.

---

## FIND-012 - GitHub Actions deploy chạy `git reset --hard origin/master` - destroys local commits, không backup

- **Severity:** Low | CVSS 3.1 (CWE-665 - improper init)
- **File:** `.github/workflows/deploy.yml:18-27`
- **Description:** Workflow `git fetch origin master && git reset --hard origin/master` trên VPS. Bất kỳ local edit nào (vd. hotfix manual `.env.production`, custom config) đều bị wipe. Token rotation hoặc temporary debug change biến mất.
- **Impact:** Operational - không phải security exploit nhưng dễ gây loss-of-fix. Combined với `.env.production` autogen logic của `deploy.sh:32-71`, nếu file tồn tại không bị xoá → OK. Nhưng nếu admin commit `.env.production` (nhầm) → bị reset.
- **Remediation:**
  - Thêm `git stash` trước `reset --hard`:
    ```bash
    git stash push -m "auto-stash pre-deploy $(date +%s)" || true
    git fetch origin master && git reset --hard origin/master
    ```
  - Permission của workflow secrets dùng GitHub OIDC thay vì SSH key dài hạn. SSH key trong secret = static credential.
- **References:** CWE-665.

---

## FIND-013 - Info disclosure: Next.js standalone Dockerfile không set non-root USER

- **Severity:** Info | CVSS 2.3 (CWE-250)
- **File:** `apps/web/Dockerfile:23-32`
- **Description:** Final stage không có `USER` directive. Container chạy as root. Next.js standalone trên port 3011 không cần root.
- **Impact:** Nếu Next.js process bị RCE (vd. dependency vuln), attacker có root trong container. Không thể escape Docker dễ dàng nhưng tăng blast radius.
- **Remediation:** Thêm trước `CMD`:
  ```dockerfile
  RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
  USER nextjs
  ```
  Note: nếu deploy bằng PM2 thay vì Docker (như `ecosystem.config.cjs` suggests), Dockerfile này có thể unused.
- **References:** CIS Docker Benchmark 4.1, CWE-250.

---

## Status

**DONE**

### Summary

| Severity | Count |
|---|---|
| Critical | 1 |
| High | 3 |
| Medium | 5 |
| Low | 3 |
| Info | 1 |
| **Total** | **13** |

**Top 3 fix ngay:**
1. `pnpm up next@^15.5.16 -w` - patch middleware bypass family (FIND-001).
2. Sửa `CsvExportButton` chuyển sang `/api/proxy/exports/*` - functional break + minor info leak (FIND-009).
3. Thêm `chmod 600 .env.production` vào `deploy.sh` + `setup.sh` (FIND-011).

**Fix tuần này:**
4. Đổi `SameSite=Lax` → `Strict` cho `refresh_token` (FIND-002).
5. Add `Content-Security-Policy` vào `next.config.ts` (FIND-006).
6. Add nginx `limit_req_zone` cho `/api/v1/auth/login` (FIND-008).
7. Add `--maxmemory` + resource limits trong `docker-compose.prod.yml` (FIND-007).

**Strengths đã có:**
- 0 instance `dangerouslySetInnerHTML`, `innerHTML=`, `eval`, `Function(`, `document.write` trong `apps/web/src/*`.
- Token storage đúng pattern: httpOnly cookie, không có `localStorage.setItem('token', ...)`. localStorage chỉ dùng cho UI preferences (view mode, page size, filter snapshot).
- Login redirect được sanitize đúng (`sanitizeRedirect` reject `//`, protocol, absolute).
- API proxy `/api/proxy/*` clear stale cookies on refresh failure.
- CORS NestJS fail-fast nếu `FRONTEND_URL` missing in production (`apps/api/src/main.ts:40-42`).
- HSTS preload set qua helmet (`maxAge: 31536000, includeSubDomains: true, preload: true`).
- Permissions-Policy disable camera/mic/geo.
- `.env.production` autogen với `openssl rand -hex 32` cho JWT secrets - cryptographically strong.
- Docker `POSTGRES_PASSWORD:?Set DB_PASSWORD` syntax force fail-fast nếu env thiếu.

---

### Unresolved Questions

1. Middleware chạy edge runtime - có acceptable migrate sang Node runtime để verify JWT signature không? Trade-off: latency tăng ~50ms, nhưng auth chính xác.
2. CSP `script-src` - project có dùng third-party script nào không (Google Analytics, Sentry)? Cần whitelist vào CSP nếu có.
3. Có plan deploy thật bằng Docker (Dockerfile) hay PM2 + bare-metal Node (ecosystem.config.cjs)? Nếu chỉ PM2 thì FIND-013 không cần fix.
4. `.github/workflows/deploy.yml` dùng SSH key static - có plan migrate sang GitHub OIDC + AWS/Azure IAM role không?
5. nginx proxy dùng "Nginx Proxy Manager" UI - có cách inject `limit_req_zone` block vào `http{}` từ NPM không, hay phải edit `/etc/nginx/nginx.conf` thủ công?
