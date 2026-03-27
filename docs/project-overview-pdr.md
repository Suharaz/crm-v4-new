# Project Overview — Product Development Requirements

## Product Vision

Internal CRM system tối ưu hiệu suất đội sales, quản lý data khách hàng, pipeline lead, đánh giá performance. Hỗ trợ 50-200 users đa phòng ban.

## Business Context

- **Problem:** Đội sales thiếu công cụ quản lý lead/customer tập trung, theo dõi conversion, phân phối lead công bằng
- **Solution:** CRM nội bộ với lead pipeline, payment verification tự động, phân phối AI-based, multi-department transfer
- **Users:** Sales reps, Sales managers, Support team, Super admin
- **Scale:** 50-200 users, 10K+ leads/month, 3 departments+

## Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Backend | NestJS | 11.x |
| Frontend | Next.js (App Router) | 16.x |
| Database | PostgreSQL | 16+ |
| ORM | Prisma | 6.x |
| Monorepo | Turborepo | latest |
| Package Manager | pnpm | 9.x |
| UI Components | shadcn/ui | latest |
| Styling | Tailwind CSS | 4.x |
| Forms | React Hook Form + Zod | latest |
| Tables | TanStack Table | 8.x |
| Charts | Recharts | 2.x |
| Drag & Drop | @dnd-kit | latest |
| Auth | JWT (jose) + Passport | - |
| Background Jobs | BullMQ | latest |
| Logging | Pino | 8.x |
| Deploy | Docker + Docker Compose | - |

## Core Features

### 1. Lead Management
- 3 nguồn: CSV import, manual (manager+), API bên thứ 3
- 3 kho: Kho Mới (manager+ thấy), Kho Phòng Ban (NV dept thấy+claim), Kho Thả Nổi (ALL users thấy+claim)
- Status: POOL → ASSIGNED → IN_PROGRESS → CONVERTED/LOST → FLOATING
- IN_PROGRESS auto-trigger khi sale tạo note/gọi/order đầu tiên
- Assignment templates: round-robin hoặc AI-weighted cho nhóm người cụ thể

### 2. Customer Management
- 1 Customer → nhiều Leads (cùng SĐT, khác sản phẩm)
- Status: ACTIVE / INACTIVE / FLOATING
- Transfer: phòng ban khác / kho thả nổi / đánh dấu hoàn tất
- Search by SĐT (all users), list (super_admin only)

### 3. Payment Hybrid Verification
- Sale tạo payment (PENDING) → auto-match với bank webhook
- Webhook ngân hàng → auto-match với payment PENDING
- Batch cron 2h → fuzzy match cái miss
- Manager verify thủ công cái còn lại
- Partial payments: CK lần 1/2/3/4/full. Convert khi tổng >= order amount

### 4. Activity Timeline
- Ghi chú, cuộc gọi, thay đổi trạng thái, gán, nhãn, hệ thống
- File attachments (documents cho leads/customers)
- Call logs auto-match by SĐT từ tổng đài webhook

### 5. Tasks/Todo
- Quick add bar (smart time parsing), time presets, from-note checkbox
- Reminder: gửi 1 lần. Escalation: quá hạn 1h → user, 24h → manager

### 6. AI Lead Distribution
- Weighted scoring: workload 30% + level 30% + performance 40%
- Config per department, toggle on/off

### 7. Auto-Recall
- Lead/customer ở dept pool quá X ngày → FLOATING + gắn nhãn mặc định
- Super admin config ngày + nhãn

### 8. Analytics Dashboard
- KPI cards, conversion funnel, sales ranking, source chart, revenue chart
- FLOATING leads: riêng metric, không tính funnel
- CSV export with formula injection sanitization

### 9. Notifications
- In-app: lead assigned, transfer, claim, payment verified, task reminder
- Polling 30s, cleanup cron (read 90d, all 180d)

## User Roles

| Role | Permissions |
|------|------------|
| **SUPER_ADMIN** | Full access. Manage users, departments, settings, API keys, recall config |
| **MANAGER** | Manage leads/customers trong managed departments. Phân phối, verify payments, view analytics |
| **USER (Sale)** | CRUD leads/customers assigned. Tạo orders/payments. Claim từ dept pool + floating. Tạo tasks |

## Non-Functional Requirements

- Response time: API <500ms, Dashboard <3s
- CSV import: 10K+ rows background processing
- Uptime: 99.5%+
- Security: OWASP Top 10, IDOR prevention, rate limiting
- Responsive: Mobile + Tablet + Desktop
- Language: Vietnamese only

## Implementation Plan

Located at: `plans/260325-1458-crm-v3-implementation/plan.md`
- 14 phases, 172h estimated
- Design guidelines: `docs/design-guidelines.md`
