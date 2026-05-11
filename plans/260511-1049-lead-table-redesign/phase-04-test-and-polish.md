# Phase 04: Test + polish

**Status:** Draft | **Priority:** P1 | **Est:** 1h

## Mục tiêu
Verify 5 trang hoạt động đúng + responsive + edge cases.

## Test matrix

| Trang | Test |
|---|---|
| /leads (My Lead - table mode) | hiện cột mới, click ⓘ work, click 3 icons SĐT work, format VND đúng |
| /leads (kanban mode) | không đụng tới (khác component) |
| /leads/dept | same as My Lead (cùng lead-table.tsx) + nút claim vẫn work |
| /leads/pool/new | bulk select OK, phân cho dropdown OK, cột mới hiện |
| /leads/pool/zoom | cột mới hiện |
| /floating | cột mới hiện |

## Edge cases
- Lead không có order → `latestOrder=null` → cột money/số/sản phẩm hiển thị `-`
- Lead có order nhưng chưa có payment → `depositPaid=0`
- SĐT prefix lạ (international) → carrier badge ẩn
- Lead có labelId null → cột nhãn ẩn badge
- Mobile responsive: cột md+/lg+ ẩn đúng

## Todo
- [ ] Login với 1 USER → test /leads, /leads/dept, /floating
- [ ] Login với 1 MANAGER → test /leads/pool/new, /leads/pool/zoom, /floating
- [ ] Test bulk assign trên pool/new
- [ ] Test 3 icon SĐT (clock + mic + copy)
- [ ] Test info ⓘ popup
- [ ] Test mobile width (<768px)
- [ ] Test tablet (768-1024px)
- [ ] Test desktop (>1024px)
- [ ] Run typecheck full: `pnpm -r typecheck`

## Success Criteria
- Tất cả test case pass
- Không TypeScript error
- Responsive đúng breakpoint
- No console error/warning
