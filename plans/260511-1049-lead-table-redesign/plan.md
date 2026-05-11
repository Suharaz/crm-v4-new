# Lead Table Redesign

**Created:** 2026-05-11 10:49 | **Branch:** master | **Status:** Draft - awaiting approval

## Mục tiêu
Redesign lead table UI cho cả 5 trang (My Lead, Dept, Pool New, Pool Zoom, Floating) theo screenshot user gửi.

## Cột mới (thứ tự trái → phải)
1. Checkbox
2. STT
3. Tên khách hàng + icon ⓘ (quick preview popup)
4. SĐT + 3 icons (clock = timeline, mic = call logs, copy) + carrier badge
5. Sản phẩm
6. Số (số lượng = 1)
7. Thành tiền (totalAmount của order mới nhất)
8. Tiền đặt cọc (sum verified payments của order mới nhất)
9. Nguồn khách
10. Nhãn KH
11. Thao tác

## Cột bỏ (cho USER thường)
- "Ngày tạo", "Ghi chú", "Trạng thái", "Tương tác lần cuối"

## Role-based columns (MANAGER+ thấy thêm)
- "Phân cho" + "Tương tác" - chỉ hiển thị khi `user.role IN (MANAGER, SUPER_ADMIN)`, áp ở pool tables (pool/new, pool/zoom, floating)

## UX requirements
- **Sticky columns:** Checkbox + STT + Tên KH + SĐT đóng băng bên trái khi scroll ngang
- **Horizontal scroll:** Các cột còn lại scroll ngang khi tổng width vượt viewport (không ẩn cột theo breakpoint nữa - giữ đầy đủ thông tin)

## Phases

| Phase | File | Mô tả | Est |
|---|---|---|---|
| 01 | phase-01-backend-list-with-latest-order.md | API trả thêm `latestOrder { totalAmount, depositPaid }` cho mỗi lead | 2h |
| 02 | phase-02-shared-utils-and-cell-components.md | Util `detectCarrier()` + 3 cell components + 2 dialog | 3h |
| 03 | phase-03-update-lead-tables.md | Cập nhật `lead-table.tsx` + `lead-pool-table-with-bulk-assign.tsx` | 2.5h |
| 04 | phase-04-test-and-polish.md | Test 5 trang + responsive + edge cases | 1h |

**Total estimated:** ~8.5h

## Dependencies
- Phase 01 blocks Phase 03 (cần response shape mới)
- Phase 02 song song với Phase 01
- Phase 03 sau cả 01 + 02
- Phase 04 cuối

## Non-goals (v1)
- KHÔNG làm icon ❤ (heart) + 📋 (clipboard)
- KHÔNG làm tính năng đặt lịch hẹn mới (clock chỉ đọc timeline)
- KHÔNG đổi schema DB

## Open questions
- (none - đã chốt qua 4 câu hỏi)
