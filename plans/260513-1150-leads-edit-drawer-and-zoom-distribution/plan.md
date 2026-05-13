# Plan: Leads Edit Drawer & Pool Zoom Distribution

**Created:** 2026-05-13 11:50 (Asia/Saigon)
**Branch:** master
**Scope:** UI/UX leads list + pool zoom distribution
**Estimated:** ~6-8h

## Status

COMPLETED on 2026-05-13

## Context

User report 2 vấn đề:
1. Nút cây bút trên `/leads` mở popup quick view, không phải form sửa đầy đủ. Cần đổi thành Sheet/Drawer trượt phải chứa LeadForm, USER không sửa được tên/sdt/nguồn nhưng vẫn được thêm SĐT phụ.
2. Trang `/leads/pool/zoom` chỉ có manual bulk assign + template apply. Thiếu cột Phân cho, nút AI Distribute, workflow chia toàn bộ table. Nút Thu hồi cần highlight rõ.

## Hiện trạng (Scout findings)

| File | Vai trò | Tình trạng |
|------|--------|-----------|
| `lead-edit-button.tsx` | Nút cây bút | Mở `EntityQuickPreviewDialog` (popup quick) |
| `lead-form.tsx` | Form edit lead | Có canEditPhone gate cho USER, KHÔNG có UI SĐT phụ |
| `customer-phones-section.tsx` | UI SĐT phụ | Chỉ dùng trong trang customer detail |
| `lead-pool-table-with-bulk-assign.tsx` | Bulk operations | Đã có recall, bulk assign, apply template |
| `pool/zoom/page.tsx` | Kho Zoom | `poolMode='department'` (ẩn cột Phân cho, ẩn AI distribute) |
| `pool/new/page.tsx` | Kho Mới | `poolMode='new'` (hiện đủ tính năng) |
| `distribution.controller.ts` | AI distribute API | `POST /distribution/distribute/:deptId` đã sẵn sàng |
| `customer-phones.service.ts` | CRUD phone phụ | Đã có endpoints GET/POST/PATCH/DELETE |

## Phases

| Phase | Subject | Files | Effort | Depends |
|-------|---------|-------|--------|---------|
| [01](./phase-01-edit-lead-drawer.md) | Edit Drawer + readonly fields cho USER | 3 files (web) | 2h | none |
| [02](./phase-02-secondary-phone-in-lead-form.md) | Section SĐT phụ trong LeadForm + auto-create customer | 4 files (web+api) | 3h | 01 |
| [03](./phase-03-pool-zoom-distribution.md) | Pool Zoom: cột Phân cho + AI distribute + mass recall UI | 3 files (web) | 2h | none |

## Order

- Phase 01 -> 02 (Phase 02 cần Drawer hiển thị trước khi nhồi UI SĐT phụ vào)
- Phase 03 chạy song song với 01-02 (không đụng file)

## Success Criteria (tổng)

- [x] Click cây bút trên `/leads` mở Sheet trượt từ phải (không reload)
- [x] USER vào Sheet thấy phone/name/source readonly, MANAGER+ edit được
- [x] Mọi role thêm/xóa được SĐT phụ trong Sheet (auto-create customer nếu cần)
- [x] `/leads/pool/zoom` hiện cột Phân cho + Tương tác giống `pool/new`
- [x] Có nút AI Distribute trên toolbar zoom (chỉ MANAGER+)
- [x] Có nút "Chia toàn bộ" để one-click distribute toàn bộ leads trong zoom
- [x] Nút Thu hồi nổi bật trong bulk actions toolbar
- [x] Tất cả test cũ pass, không regression

## Constraints

- KHÔNG em dash (`-` only)
- KHÔNG sửa schema Prisma (tận dụng `CustomerPhone` hiện có)
- KHÔNG sửa logic permission `buildAccessFilter`
- Vietnamese UI text only

## Risks

- Auto-create customer khi thêm SĐT phụ (Phase 02) có thể conflict với flow CONVERT lead -> customer. Cần kiểm tra `lead.customerId` trước khi tạo mới.
- Sheet component shadcn chưa có trong codebase. Phase 01 sẽ tự tạo file `ui/sheet.tsx` dựa trên Radix Dialog primitive đã có (`^1.1.15`). Pattern chuẩn của shadcn/ui Sheet.
