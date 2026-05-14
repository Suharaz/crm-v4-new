# Plan: Leads notes column + source search

**Created:** 2026-05-14 08:55
**Owner:** Master orchestrator
**Status:** Completed

## Goal

Cải thiện UX cho luồng leads:
1. Cột Note (5 note gần nhất) thay cột Nhãn trên bảng /leads
2. Nhãn hiển thị pill nhỏ dưới SĐT
3. Thêm trường note trong popup tạo lead
4. Tìm kiếm + scroll fetch nguồn trong popup, cache 24h client-side

## Scope

- Áp dụng cho tất cả role thấy bảng /leads (USER, MANAGER, SUPER_ADMIN)
- Popup tạo lead chỉ MANAGER+ truy cập (confirmed `leads.controller.ts:106-107`)
- Note dùng bảng `activities` polymorphic sẵn có (KHÔNG tạo bảng mới)

## Phases

| # | Phase | File | Status | Est | Dep |
|---|-------|------|--------|-----|-----|
| 1 | Backend: API trả 5 note + tạo note trong transaction | [phase-01](phase-01-backend-notes-and-create-with-note.md) | Completed | 2-3h | - |
| 2 | Frontend: cột Note + nhãn dưới SĐT | [phase-02](phase-02-frontend-notes-column-and-label-below-phone.md) | Completed | 1.5-2h | 1 |
| 3 | Frontend: thêm field note vào popup tạo lead | [phase-03](phase-03-frontend-create-lead-popup-note-field.md) | Completed | 0.5-1h | 1 |
| 4 | Frontend: source combobox search + cache 24h + clear on logout | [phase-04](phase-04-frontend-source-combobox-with-cache.md) | Completed | 2-3h | - |

**Tổng:** ~6-9h. Phase 2/3/4 chạy song song được sau Phase 1.

## Key Decisions (user-confirmed)

- Note display: note mới nhất + badge count, Popover xem full 5
- Popover note **chỉ content**, không tên/timestamp
- Nhãn dưới SĐT: pill nhỏ giữ màu
- Source search: client-side filter, cache 24h localStorage, **clear khi logout**
- Create lead với note: backend transaction
- Author note = `req.user.id` (người tạo lead)
- dateFrom/dateTo giữ nguyên semantics `createdAt` - không đụng

## Architecture Notes

- **Activity polymorphic** (`entity_type='LEAD'`, `entity_id=lead.id`, `type='NOTE'`): query 5 mới nhất per lead bằng raw SQL `ROW_NUMBER() OVER (PARTITION BY entity_id ORDER BY created_at DESC)` để tránh N+1
- **buildAccessFilter** scope leads đã đúng theo role -> notes auto-scoped theo lead.id
- **Cache source 24h**: `localStorage` key `lead-sources-cache` lưu `{ data, ts }`, hết hạn fetch lại
- **Logout**: clear `localStorage.removeItem('lead-sources-cache')` trong `auth-provider.tsx:42`

## Skills to Activate

- Phase 1: `nestjs-expert`, `postgres-pro`, `databases`, `sequential-thinking`
- Phase 2: `react-expert`, `ui-styling`, `frontend-development`
- Phase 3: `react-expert`, `frontend-development`
- Phase 4: `react-expert`, `ui-styling`, `frontend-development`, `sequential-thinking`
- All phases: `code-reviewer` (post), `test` (post), `git` (commit per phase)

## Success Criteria (overall)

- [ ] Bảng /leads hiển thị cột Note (mới nhất + count), nhãn pill nhỏ dưới SĐT
- [ ] Popup tạo lead có trường note (optional, max 2000 ký tự)
- [ ] Tạo lead có note -> 1 record `leads` + 1 record `activities` (atomic)
- [ ] Popup chọn nguồn có search + scroll lazy 10/lần, dùng cache 24h
- [ ] Logout clear `lead-sources-cache`
- [ ] Không em dash / en dash trong code mới
- [ ] Tests pass (unit + relevant e2e)
- [ ] `code-reviewer` agent approve

## Out of Scope

- Đổi single-label thành multi-label cho lead (giữ schema cũ)
- Tạo bảng `lead_notes` riêng (dùng activities)
- Đổi semantics `dateFrom`/`dateTo` 
- Edit/delete note trên bảng list (chỉ hiển thị)
- Pagination thật cho `/lead-sources` backend (giữ trả all)

## Unresolved Questions

Không. Tất cả quyết định đã confirm với user.

## Completion Note

Completed on 2026-05-14. code-reviewer score 8.5/10, no critical issues. All 4 phases built/typechecked/linted clean. Dev-server testing pending user verification.
