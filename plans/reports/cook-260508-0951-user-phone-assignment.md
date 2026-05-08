# Cook Report - User Phone Assignment

**Date:** 2026-05-08 09:51
**Plan:** plans/260508-0938-user-phone-assignment/
**Mode:** AUTO

## Status

DONE - all 4 phases.

## Phase Summary

| Phase | Result |
|---|---|
| 01 Schema | UserPhone + UserPhoneHistory + partial unique idx_user_phones_phone_active. Pushed via `db:push` (migrate dev shadow DB lỗi pre-existing không liên quan). |
| 02 Backend | Module `user-phones` với 7 endpoints super_admin only + internal `findUserByPhone`. Build pass. |
| 03 Call match | Inject UserPhonesService, prepend user_phones lookup. Backward compat preserved. Build pass. |
| 04 Frontend | `/user-phones` page + 4 dialog (create, transfer, history, bulk) + sidebar item "Phân SĐT" SUPER_ADMIN only. Web build pass (15.9 kB route). |

## Files

### Created (15)
- packages/types/src/user-phone.types.ts
- apps/api/src/modules/user-phones/{module,controller,service,repository}.ts
- apps/api/src/modules/user-phones/dto/{create,transfer,bulk-create,list}-user-phone.dto.ts
- apps/web/src/lib/api/user-phones.ts
- apps/web/src/app/(dashboard)/user-phones/page.tsx
- apps/web/src/components/user-phones/{user-phones-client,user-phone-table,user-phone-row-actions,user-phone-create-dialog,user-phone-transfer-dialog,user-phone-history-dialog,user-phone-bulk-dialog}.tsx

### Modified (6)
- packages/database/prisma/schema.prisma (User relations + 2 model)
- packages/database/prisma/raw-indexes.sql (partial unique index)
- packages/types/src/index.ts (re-export user-phone types)
- apps/api/src/app.module.ts (register UserPhonesModule)
- apps/api/src/modules/call-logs/{call-logs.module.ts,call-logs.service.ts} (inject + refactor match flow)
- apps/web/src/types/entities.ts (new record types)
- apps/web/src/components/layout/app-sidebar.tsx (menu item)
- docs/project-changelog.md (changelog entry)
- plans/260508-0938-user-phone-assignment/{plan,phase-*}.md (status update)

## Verification

- `pnpm db:generate` pass
- `pnpm db:push` pass (schema synced)
- DB smoke test: insert + duplicate constraint reject + soft-delete + re-insert allowed (idx_user_phones_phone_active hoạt động đúng)
- API build pass (`tsc -p tsconfig.json`)
- Web build pass (Next.js 15.9 kB cho route /user-phones)
- API lint: 4 errors pre-existing trong code khác (no-useless-assignment), warnings của module mới chỉ là `any` type cho `@CurrentUser` - cùng pattern với api-keys/customers controller hiện có

## Key Decisions

- Path frontend dùng `/user-phones` (không `/admin/` prefix) bám convention hiện có (`/users`, `/settings/distribution`). Backend giữ `/admin/user-phones`.
- Transaction Prisma cho transfer + delete để insert history + update phone atomic.
- Bulk import client-side parse trước, server validate per-row, return `{created, skipped, failed}` breakdown.
- Match flow: user_phones là PRIORITY 1 cho `matched_user_id`, entity (lead/customer) là priority 2 (fallback).

## Out of Scope (Plan ghi rõ)

- User detail tab "SĐT phụ trách" - skip vì page `/users/[id]` chưa có view detail (chỉ có `/edit`).
- Unit tests `call-logs.service.spec.ts` - project chưa setup vitest/jest cho api package, chỉ build-time TypeScript validation.

## Unresolved Questions

1. Có cần migration data từ `lead.assignedUserId`/`customer.assignedUserId` sang `user_phones` không? Plan default = bắt đầu trống, super admin nhập tay.
2. Có cần hiển thị badge "Số này thuộc Sale X" trong customer detail page không? Plan ghi out-of-scope, để dành sau.
