# Security Scan Report - CRM v4

**Project:** VeloCRM (crm-v4)
**Scanned:** 2026-05-12 11:10 (Asia/Saigon)
**Branch:** master
**Scope:** apps/, packages/, root configs, .env*, .gitignore

## Tổng quan

| Hạng mục | Critical | High | Moderate | Low | Tổng |
|---|---:|---:|---:|---:|---:|
| Secrets / Credentials | 0 | 0 | 0 | 0 | 0 |
| Dependencies (pnpm audit) | 0 | 14 | 17 | 3 | 34 |
| Code patterns (SQLi/XSS/etc.) | 0 | 0 | 0 | 1 | 1 |
| Configuration / Auth | 0 | 0 | 0 | 0 | 0 |
| **Tổng** | **0** | **14** | **17** | **4** | **35** |

**Kết luận nhanh:** Codebase rất sạch về secrets và pattern vulnerabilities. Defensive coding rõ ràng (path traversal whitelist, magic-byte validation, bcrypt, HMAC + timingSafeEqual, refresh-token reuse detection, account lockout, user-enum prevention, helmet + HSTS, httpOnly cookies, redacted logs). Tất cả rủi ro tập trung ở **dependencies** - cần update Next.js 15.5.14 lên 15.5.16+ ngay, cùng vài transitive deps.

---

## 1. Secrets Scan - PASS

### Pattern matches
- `AKIA*`, `gh[pousr]_*`, `sk_live_*`, `AIza*`, `sk-ant-*`, `xox*` -> **0 matches**
- JWT-shape `eyJ...` -> **0 matches**
- DB URL với password thật `postgres://user:pass@` -> **0 matches** (chỉ `crm:crm@localhost` in dev `.env`, hợp lệ)
- `(password|secret|token)='...'` -> 1 hit là constant key name `AI_API_KEY: 'ai_api_key'` -> **false positive**
- `-----BEGIN PRIVATE KEY-----` -> 1 hit trong `docs/aapanel-deployment-guide.md:679` là documentation example -> **false positive**

### .env hygiene
- `.gitignore` block đầy đủ: `.env`, `.env.local`, `.env.*.local`, `.env.production` ✓
- `git log` xác nhận `.env` **chưa từng** được commit ✓
- `.env.example`, `.env.production.example` chỉ chứa placeholder `CHANGE_ME_*` ✓
- `.env.production.example` không có `THROTTLE_LIMIT` -> production fallback về `100`/`5` (an toàn) ✓

### Logging hygiene
- Pino redact `req.headers.authorization`, `req.body.password`, `req.body.refreshToken` (`apps/api/src/app.module.ts:87`) ✓
- `system-settings` PUT body value bị mask thành `[Redacted]` (`apps/api/src/app.module.ts:90`) ✓
- `SystemSettingsService` mask theo regex `_key|_secret|_password|_token$` khi `getAll()` (`apps/api/src/modules/system-settings/system-settings.service.ts:15`) ✓
- Không tìm thấy `console.log(...password|secret|token)` ✓

---

## 2. Dependencies Audit - HIGH PRIORITY

`pnpm audit` báo **34 vulnerabilities**. Chi tiết các CVE quan trọng:

### HIGH (14)

| Package | Path | Vấn đề | Patch |
|---|---|---|---|
| `next` | `apps/web > next@15.5.14` | DoS Server Components, SSRF, Middleware/Proxy bypass (App Router + Pages), DoS via connection | `>=15.5.16` |
| `next` | same | Middleware/Proxy bypass nhiều biến thể | `>=15.5.16` |
| `vite` | `vitest > vite` | `server.fs.deny` bypass, arbitrary file read via dev server | `>=8.0.12` |
| `hono` | `@modelcontextprotocol/sdk > hono@4.12.12` | JWT NumericDate validation issue | `>=4.12.18` |
| `picomatch` | `@nestjs/cli > @angular-devkit/core > picomatch` | ReDoS via extglob | review |
| `effect` | `packages/database > prisma > @prisma/config > effect` | AsyncLocalStorage context lost / contaminated | review |
| `fast-uri` | `@nestjs/cli > @angular-devkit/core > ajv > fast-uri` | Path traversal + host confusion | `>=3.1.2` |

### MODERATE (17)
Chủ yếu là Next.js (XSS App Router, XSS beforeInteractive, DoS Image Optimization, cache poisoning RSC), `hono` (JSX attribute injection, bodyLimit bypass, CSS injection, Vary header bug, JSX tag injection), `vite` (path traversal in optimized deps), `ajv` (ReDoS), `picomatch` (method injection), `postcss` (XSS), `uuid` (buffer bounds v3/v5/v6), `ip-address` (XSS in Address6 HTML methods).

### LOW (3)
- `hono` JWT validation
- `next` cache poisoning via collisions
- `next` middleware redirect cache poisoning

### Khuyến nghị hành động
1. **Ngay (24h):** `pnpm up next@latest --filter @crm/web` lên `>=15.5.16` -> fix 14 high + nhiều moderate liên quan Next.js.
2. **Trong tuần:** Chạy `pnpm up --latest` cho dev deps (vitest, vite). MCP SDK & Prisma là transitive -> đợi upstream hoặc dùng `overrides` trong `package.json` nếu cần force version.
3. **Verify:** Sau update, chạy lại `pnpm audit`, regression test login/refresh/middleware/uploads.

---

## 3. Code Pattern Scan - PASS (1 LOW)

### SQL Injection - PASS
- Tất cả 3 file dùng `$queryRaw` (`dashboard.service.ts`, `audit-log.service.ts`, `mcp-agent/tools/analytics.tool.ts`) đều dùng **tagged template literal** (Prisma auto-parameterize, không nội suy chuỗi).
- **0 match** với `$queryRawUnsafe` / `$executeRawUnsafe`.

### XSS - PASS
- 0 match `innerHTML =`, `dangerouslySetInnerHTML`, `document.write`.

### Command Injection - PASS
- 0 match `exec`/`spawn` với template literal hoặc string concat từ user input.

### Path Traversal - PASS (Defense in depth)
- `apps/api/src/modules/file-upload/file-upload.service.ts:78-94` triển khai **3 lớp** chống traversal:
  1. Whitelist regex `^[\w-]+\/\d{4}-\d{2}\/[0-9a-f-]{36}\.\w+$`
  2. `path.resolve()` rồi check `startsWith(uploadDir + path.sep)`
  3. UUID filename + MIME allowlist + magic-byte validation qua `file-type`
- `apps/api/src/modules/import/import.service.ts:78-82` áp dụng cùng pattern cho download error file.

### eval / new Function - PASS
- 0 match trong toàn bộ `apps/` và `packages/`.

### Insecure Randomness - LOW
- `apps/api/src/modules/recall-config/recall-config.service.ts:429`
  ```ts
  const randomPassword = await bcrypt.hash(`system-${Date.now()}-${Math.random()}`, 12);
  ```
  Dùng cho **system user dummy password** (status=`INACTIVE`, không thể login). Không khai thác được nhưng nên thay bằng `crypto.randomBytes(32).toString('hex')` cho defense-in-depth.
  - **Fix gợi ý:** `randomBytes(32).toString('hex')` thay vì `Date.now()+Math.random()`.

### Disabled SSL / TLS - PASS
- 0 match `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED`, `verify=false`.

### Hardcoded Credentials - PASS
- 0 match credentials trong code (chỉ trong `.env.example` placeholders).

---

## 4. Auth & Config Hardening - PASS

Thực hiện kiểm tra sâu (vì là core security):

| Hạng mục | Trạng thái | Vị trí |
|---|---|---|
| Password hashing | bcrypt (cost mặc định 10, project doc ghi 12) | `auth.service.ts:5,41` |
| JWT secret nguồn | `getOrThrow('JWT_SECRET')` -> fail-fast khi thiếu env | `auth.module.ts:15`, `jwt-passport.strategy.ts:22` |
| Refresh token storage | SHA-256 hash trước khi lưu DB | `auth.service.ts:65 hashToken()` |
| Refresh token rotation + reuse detection | Revoke ALL tokens khi phát hiện replay | `auth.service.ts:74-82` |
| Account lockout | 5 sai -> 15 phút lock | `auth.service.ts:8-9, 46-48` |
| User enumeration | Generic error message "Email hoặc mật khẩu không đúng" | `auth.service.ts:21,28,38,50` |
| Rate limiting global | 100 req/min | `app.module.ts:63` |
| Rate limiting auth | 5 login/min, 10 refresh/min | `auth.controller.ts:16,30` |
| CORS | Required `FRONTEND_URL` in prod (throw nếu thiếu) | `main.ts:38-46` |
| Helmet | HSTS 1y + includeSubDomains + preload | `main.ts:32-35` |
| Webhook signature | HMAC-SHA256 + `timingSafeEqual` | `auth/guards/webhook-signature.guard.ts:34` |
| Cookies | `httpOnly` + `Secure` (prod) + `SameSite=Lax` + Path=/ + maxAge | `apps/web/src/app/api/auth/[...action]/route.ts:37-42`, proxy refresh `route.ts:79-84` |
| Token in localStorage | Không sử dụng. `localStorage` chỉ chứa UI state (filter, pagination, cache lookups) | grep verified |
| Validation pipe | whitelist + forbidNonWhitelisted + transform | `app.module.ts:154-161` |
| Global guards | JWT + Roles + ApiKey + Throttler | `app.module.ts:142-148` |
| File upload | size 10MB + MIME allowlist + magic-byte + UUID + path whitelist | `file-upload.service.ts` |

---

## 5. Findings Có Hành Động

### HIGH-1: Next.js 15.5.14 -> 15.5.16+ (Critical)
- **Severity:** HIGH (nhiều CVE: SSRF, middleware bypass, XSS, DoS)
- **Fix:**
  ```bash
  pnpm --filter @crm/web up next@latest
  pnpm install
  pnpm --filter @crm/web build  # verify build
  pnpm audit                    # verify resolved
  ```

### HIGH-2: Transitive hono / vite / fast-uri (Medium urgency)
- **Severity:** HIGH (transitive only)
- **Fix:** Đợi `@modelcontextprotocol/sdk`, `vitest`, `@nestjs/cli` upstream update, hoặc thêm `overrides` trong root `package.json`:
  ```json
  "pnpm": {
    "overrides": {
      "hono@<4.12.18": ">=4.12.18",
      "vite@<8.0.12": ">=8.0.12",
      "fast-uri@<3.1.2": ">=3.1.2"
    }
  }
  ```

### LOW-1: Math.random() trong system user dummy password
- **File:** `apps/api/src/modules/recall-config/recall-config.service.ts:429`
- **Risk:** Không khai thác được (user `INACTIVE`, không login). Defense-in-depth.
- **Fix:**
  ```ts
  import { randomBytes } from 'crypto';
  const randomPassword = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  ```

---

## Khuyến nghị tiếp theo

1. Update Next.js lên 15.5.16+ (priority 1).
2. Thêm `pnpm overrides` cho transitive vulnerabilities (priority 2).
3. Thay `Math.random()` ở recall-config bằng `crypto.randomBytes` (priority 3, defense-in-depth).
4. Bật `pnpm audit --prod` trong CI để fail build khi có high/critical (đề xuất).
5. Cân nhắc thêm `secret scanning` hook (`gitleaks` hoặc GitHub native secret scanning) ở CI.

## Câu hỏi chưa giải quyết

- bcrypt cost: code không truyền cost (mặc định 10), nhưng `CLAUDE.md` ghi rõ "bcrypt cost 12". Có cần update `auth.service.ts` để pass `12` explicit? Cần xác nhận với owner.
- `THROTTLE_LIMIT=10000` trong local `.env` có còn cần thiết không? Nếu là test artifact thì có thể xóa để tránh nhầm lẫn.

---

**Status:** DONE
**Reports path:** `F:/Vibe Coding/crm-v4/plans/reports/security-scan-260512-1110-crm-v4-full.md`
