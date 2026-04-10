# Tài khoản Demo

> ⚠️ **DEV ONLY.** Password `changeme` CHỈ áp dụng khi chạy `pnpm db:seed` ở môi trường dev (NODE_ENV khác `production`).
> Trong production, seed script **bắt buộc** env `SEED_PASSWORD` (min 8 chars) — nếu thiếu sẽ throw error để tránh leak credentials. Xem `.env.production.example` và `packages/database/prisma/seed.ts`.

## Đăng nhập (dev)

URL: http://localhost:3011

| Role | Email | Password (dev) | Quyền chính |
|------|-------|----------------|-------------|
| **SUPER_ADMIN** | `admin@crm.local` | `changeme` | Toàn quyền — quản lý user, settings, xóa data |
| **MANAGER** | `manager.sales@crm.local` | `changeme` | Quản lý phòng Sales — tạo lead, assign, verify payment |
| **USER (Sale)** | `sale1@crm.local` | `changeme` | Nhân viên bán hàng — claim lead, tạo order, task cá nhân |

## Tài khoản khác (seed)

| Email | Role | Phòng ban |
|-------|------|-----------|
| `manager.support@crm.local` | MANAGER | Support |
| `sale2@crm.local` | USER | Sales |
| `support1@crm.local` | USER | Support |

**Password tất cả (dev):** `changeme`
**Password production:** giá trị của `SEED_PASSWORD` env var khi chạy seed — **đổi ngay sau lần login đầu**.

## Services

| Service | URL | Port |
|---------|-----|------|
| Web (Next.js) | http://localhost:3011 | 3011 |
| API (NestJS) | http://localhost:3010/api/v1 | 3010 |
| PostgreSQL | localhost | 5433 |
| Redis | localhost | 6380 |
| Prisma Studio | `pnpm db:studio` | 5555 |

## Khởi chạy nhanh

```bash
docker compose up -d          # PostgreSQL + Redis
pnpm db:seed                  # Seed data demo
pnpm dev                      # Start API + Web
```
