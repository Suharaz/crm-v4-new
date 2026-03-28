# Tài khoản Demo

## Đăng nhập

URL: http://localhost:3011

| Role | Email | Password | Quyền chính |
|------|-------|----------|-------------|
| **SUPER_ADMIN** | `admin@crm.local` | `changeme` | Toàn quyền — quản lý user, settings, xóa data |
| **MANAGER** | `manager.sales@crm.local` | `changeme` | Quản lý phòng Sales — tạo lead, assign, verify payment |
| **USER (Sale)** | `sale1@crm.local` | `changeme` | Nhân viên bán hàng — claim lead, tạo order, task cá nhân |

## Tài khoản khác (seed)

| Email | Role | Phòng ban |
|-------|------|-----------|
| `manager.support@crm.local` | MANAGER | Support |
| `sale2@crm.local` | USER | Sales |
| `support1@crm.local` | USER | Support |

**Password tất cả:** `changeme`

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
