# Phase 03 - Test, Docs, Ship

**Priority:** P2 (depends on 01, 02)
**Status:** ✅ Done (2026-04-22) - Note: manual UI tests deferred to user; fixtures available in `tests/fixtures/bank-csv/`
**Effort:** 1h

## Context

Verify end-to-end, update docs, commit + push theo rule "1 feature = 1 commit".

**Test data approach (KISS):** Tự sinh test file từ template ta xuất (`GET /bank-transactions/import/template`). Parser **ignore unknown columns** → file user upload có thừa cột thì bỏ qua, miễn 7 cột chuẩn match header. Không cần xin file thật từ user trước.

## Requirements

- Test E2E với 1 file CSV mock (5-10 row, mix valid/invalid/duplicate)
- Update `docs/api-reference.md` - thêm 2 endpoint mới
- Update `docs/project-changelog.md` - entry 2026-04-22
- Update `docs/project-roadmap.md` - phase 24 entry
- Update `docs/business-flows.md` (nếu có) - thay flow webhook bằng CSV import
- Commit `feat: bank transaction CSV import - 7-col template, dedup, auto-match`
- Push lên remote

## Test Cases (Manual)

| # | Input | Expected |
|---|---|---|
| 1 | CSV 3 row valid, không trùng | imported=3, skipped=0, matched=N (tùy có payment PENDING khớp) |
| 2 | CSV 5 row, 1 trùng externalId | imported=4, skipped_duplicate=1 |
| 3 | CSV 1 row thiếu transactionTime | imported=1, BankTransaction.transactionTime ≈ now() |
| 4 | CSV 1 row bank không match `BankAccount.name` | imported=0, errors[0] = "Tên TK không tồn tại" |
| 5 | CSV 1 row amount = 0 | imported=0, errors[0] = "Số tiền phải > 0" |
| 6 | CSV thiếu externalId | imported=1, externalId auto-hash, dedup khi upload lại |
| 7 | Upload file `.xlsx` thay vì CSV | 400 "Chỉ chấp nhận file CSV" |
| 8 | Upload >10MB | 413 Payload Too Large |
| 8b | File "messy" 30 cột (chỉ 7 cột chuẩn match) | imported OK, các cột thừa silently ignore |
| 9 | Webhook cũ vẫn gửi đầy đủ field | regression OK, insert + match như cũ |
| 10 | Webhook gửi thiếu `transactionTime` | insert OK với now() (tính năng mới) |

## Implementation Steps

1. Download template CSV (qua endpoint mới) → có format chuẩn
2. Tạo 10 file CSV variant trong `tests/fixtures/` từ template (mỗi file 1 test case)
3. Tạo thêm 1 file "messy" có nhiều cột thừa (giả lập file bank xuất 30 cột) để verify ignore-unknown
4. Manual test full 10 cases qua UI (dev server)
3. Sửa nếu phát hiện bug
4. Update 4 doc files
5. Commit: `feat: bank transaction CSV import - 7-col template, dedup, auto-match`
6. Push

## Todo List

- [ ] Download template CSV
- [ ] Tạo 10 file variant + 1 file "messy" nhiều cột thừa
- [ ] Run dev `pnpm dev`
- [ ] Test manual 10 cases
- [ ] Fix bugs (nếu có)
- [ ] Update `docs/api-reference.md`
- [ ] Update `docs/project-changelog.md`
- [ ] Update `docs/project-roadmap.md`
- [ ] Update `docs/business-flows.md`
- [ ] Update `docs/codebase-summary.md` (nếu cần)
- [ ] Lint: `pnpm lint`
- [ ] Commit + push

## Success Criteria

- [ ] 10/10 test case pass
- [ ] Lint pass
- [ ] Docs synced
- [ ] Commit + push success
- [ ] Memory update: ghi project memory về quyết định "transactionTime fallback now() ở service layer, không nullable schema"

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Phát hiện bug edge case ở phase 03 | Quay lại sửa phase 01/02, không ship vội |
| Docs lệch code thực tế | Đọc code lần cuối trước khi viết docs (không copy từ plan, copy từ code) |

## Memory Update

Sau khi ship xong, update memory:
- `feedback_simplification.md` - User chỉnh "đừng overthink schema migration nếu service layer fallback đủ" (rule áp dụng cho future)
- `project_state.md` - ghi nhận tính năng mới phase 24

## Done Definition

Plan completed khi:
- [ ] All 10 test pass
- [ ] Commit hash recorded trong changelog
- [ ] PR/branch pushed (master direct theo workflow current)
