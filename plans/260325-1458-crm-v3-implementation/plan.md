---
title: "CRM V3 Full Implementation Plan"
description: "Internal CRM system: NestJS 11 + Next.js 16 + PostgreSQL 16 + Prisma 6 monorepo"
status: pending
priority: P1
effort: 172h
branch: main
tags: [crm, nestjs, nextjs, prisma, turborepo, fullstack]
created: 2026-03-25
---

# CRM V3 Implementation Plan

## Context

- Brainstorm: `plans/reports/brainstorm-260325-1224-internal-crm-system-design.md`
- Research synthesis: `plans/reports/review-260325-1353-research-reports-synthesis.md`
- Stack: NestJS 11 | Next.js 16 | PostgreSQL 16 | Prisma 6 | Turborepo | pnpm | shadcn/ui | Tailwind 4
- Architecture: Next.js = pure frontend, NestJS = sole API, BIGINT PKs, soft delete, cursor pagination

## Phases

| # | Phase | Effort | Status | File |
|---|-------|--------|--------|------|
| 01 | Monorepo Setup & Dev Environment | 8h | completed | [phase-01](phase-01-monorepo-setup-and-dev-environment.md) |
| 02 | Database Schema & Prisma Setup | 12h | completed | [phase-02](phase-02-database-schema-and-prisma-setup.md) |
| 03 | Authentication & User Management | 14h | completed | [phase-03](phase-03-authentication-and-user-management.md) |
| 04 | Core CRM: Leads & Customers | 16h | completed | [phase-04](phase-04-core-crm-leads-and-customers.md) |
| 05 | Products, Orders & Payments + Bank Webhook | 16h | completed | [phase-05](phase-05-products-orders-and-payments.md) |
| 06 | Activity Timeline & Call Integration | 12h | completed | [phase-06](phase-06-activity-timeline-and-call-integration.md) |
| 07 | Data Import & Third-Party API | 10h | pending | [phase-07](phase-07-data-import-and-third-party-api.md) |
| 08 | Frontend Layout & Auth UI | 10h | pending | [phase-08](phase-08-frontend-layout-and-auth-ui.md) |
| 09 | Frontend Leads & Customers Pages | 14h | pending | [phase-09](phase-09-frontend-leads-customers-pages.md) |
| 10 | Frontend Orders, Payments & Settings | 10h | pending | [phase-10](phase-10-frontend-orders-payments-settings.md) |
| 11 | Frontend Analytics Dashboard | 10h | pending | [phase-11](phase-11-frontend-analytics-dashboard.md) |
| 12 | AI Lead Distribution | 8h | pending | [phase-12](phase-12-ai-lead-distribution.md) |
| 13 | Tasks, Transfer & Advanced Features | 16h | pending | [phase-13](phase-13-department-transfer-and-advanced-features.md) |
| 14 | Testing & Deployment | 12h | pending | [phase-14](phase-14-testing-and-deployment.md) |

## Key Dependencies

- Phase 01 blocks all others (monorepo skeleton)
- Phase 02 blocks 03-07 (schema required for API)
- Phase 03 blocks 04-07 (auth guards needed)
- Phase 08 blocks 09-11 (frontend shell needed)
- Phases 04-07 (backend) can run in parallel once 03 done
- Phases 09-11 (frontend) can run in parallel once 08 done
- Phase 12-13 depend on 04 (leads/customers exist)
- Phase 14 runs last

## Resolved Decisions

1. **Phone format:** VN 10-11 digits. Normalize: strip +84 → 0, remove spaces/dashes/dots
2. **File storage:** Local filesystem (`uploads/`). NO MinIO/S3
3. **Lead dedup:** By phone + source combo for leads, phone-only for customers
4. **Audit trail:** Action-level (not field-level). Activity model with type enum
5. **Export formats:** CSV only (V1). Excel/PDF deferred
6. **Timezone:** All timestamps UTC. Frontend displays Asia/Ho_Chi_Minh
7. **Data migration:** Fresh start — no migration from CRM v1/v2
8. **Payment flow:** Hybrid verification — auto-match webhook + batch cron 2h + manager manual. Hỗ trợ partial payments (CK lần 1/2/3/4/full)
9. **Call logs:** Generic webhook pattern, bên thứ 3 push call data, auto-match by phone
10. **3 Kho lead:** Kho Mới (dept=null, POOL, manager+ thấy), Kho Phòng Ban (dept=X, NV dept thấy+claim), Kho Thả Nổi (FLOATING, ALL users thấy+claim)
11. **Dedup:** Chỉ CSV import dedup (SĐT+nguồn+sản phẩm). Manual + API → không dedup
12. **IN_PROGRESS:** Auto-trigger khi sale tạo note/gọi điện/tạo order đầu tiên
13. **LOST lead:** Chuyển về kho thả nổi (FLOATING), không reopen về POOL
14. **Assignment templates:** Round-robin hoặc AI_WEIGHTED theo team/dept
15. **Auto-recall:** Lead/customer ở dept pool quá X ngày → FLOATING + gắn nhãn mặc định
16. **Assignment template:** Chọn danh sách người cụ thể. Round-robin vòng lặp (không bắt buộc chia hết)
17. **CustomerStatus:** ACTIVE / INACTIVE / FLOATING. INACTIVE ẩn khỏi kho, vẫn search SĐT + API được
18. **Transfer permission:** User đang giữ + manager dept + super_admin đều được chuyển
19. **User deactivate:** leads/customers về kho phòng ban (giữ dept), auto-recall nếu quá hạn
20. **Template apply validation:** chỉ POOL/FLOATING. Skip leads khác status, trả danh sách skipped
21. **Order cancel/refund:** KHÔNG revert lead CONVERTED. Refund là flow riêng trên order
22. **FLOATING analytics:** tính riêng metric, không tính funnel. "Recycled" nếu claim lại
23. **Tasks/Todo:** Quick add bar (smart time parsing) + reminder cron 5p (gửi 1 lần qua remindedAt) + escalation 3 levels (15p trước → quá hạn 1h → quá hạn 24h notify manager)

## Unresolved Questions

1. Exact 3rd party call API spec unknown — phase 06 uses generic webhook pattern

## Known Gaps Fixed (2026-03-27)

See full analysis: `plans/reports/plan-analysis-260327-1343-gap-review.md`

Applied fixes:
1. ✅ Added Team CRUD to Phase 03
2. ✅ Added Manager-Department assignment CRUD to Phase 03
3. ✅ Added `department_id` to leads in Phase 02
4. ✅ Added API Key management to Phase 10 Settings
5. ✅ Removed MinIO references from Phase 14
6. ✅ Added Documents endpoints to Phase 06
7. ✅ Added ProductCategory CRUD to Phase 05
8. ✅ Added account lockout fields to Phase 02 schema
9. ✅ Added CI/CD pipeline to Phase 14
10. ✅ Added CSV sanitization note to Phase 11
11. ✅ Added notification cleanup cron to Phase 13
12. ✅ Rewrote Payment flow: hybrid verification (auto-match webhook + batch cron + manual)
13. ✅ Added BankTransaction model to Phase 02
14. ✅ Added partial payments support (CK lần 1/2/3/4/full)
15. ✅ Updated Phase 05 effort 12h → 16h (added bank webhook + matching)
16. ✅ Added FLOATING status, removed TRANSFERRED from LeadStatus enum
17. ✅ Redesigned 3 pool system (Kho Mới, Kho Phòng Ban, Kho Thả Nổi)
18. ✅ Fixed dedup: only CSV import, not manual/API
19. ✅ Added IN_PROGRESS auto-trigger on first activity
20. ✅ LOST → FLOATING (not reopen to POOL)
21. ✅ Added AssignmentTemplate + RecallConfig models to Phase 02
22. ✅ Added assignment templates + auto-recall to Phase 12
23. ✅ Updated transfer options (DEPARTMENT/FLOATING/UNASSIGN) in Phase 04 + 13
24. ✅ Template: chọn người cụ thể (AssignmentTemplateMember), round-robin vòng lặp
25. ✅ Added CustomerStatus enum (ACTIVE/INACTIVE/FLOATING) to Phase 02
26. ✅ Added customer transfer + reactivate endpoints to Phase 04
27. ✅ Transfer permission: assigned user + manager dept + super_admin
28. ✅ User deactivate → leads/customers về kho phòng ban (Phase 03)
29. ✅ Template apply: skip non-POOL/FLOATING leads (Phase 12)
30. ✅ Order cancel/refund không revert CONVERTED (Phase 05)
31. ✅ FLOATING leads: riêng metric, không tính funnel (Phase 11)
32. ✅ Frontend: 3 pool pages, floating page, sidebar nav, customer INACTIVE/transfer (Phase 08-10)
33. ✅ Added Task model to Phase 02 (with reminder + escalation fields)
34. ✅ Added Tasks module to Phase 13 (CRUD + quick create + smart time parsing + reminder cron + escalation)
35. ✅ Phase 13 effort 12h → 16h, total 164h → 172h
