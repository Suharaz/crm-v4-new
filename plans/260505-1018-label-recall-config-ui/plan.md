# Label Recall Config UI

**Ngày:** 2026-05-05 | **Branch:** master | **Trạng thái:** in_progress

## Bối cảnh

Commit `7995f53 feat(recall): add label-based auto-recall for leads` đã ship backend (model `LabelRecallConfig`, endpoints CRUD `/recall-configs/labels`, cron 2h) nhưng **không có UI**. Khi tạo nhãn mới ở Settings, không có ô "số ngày recall". User báo: *"set thời gian re-call label chưa có ở giao diện, khi tạo nhãn mới không có mục đó"*.

## Mục tiêu

Tích hợp trường "Số ngày auto-recall" vào dialog tạo/sửa nhãn (Phương án A - đã chốt với user). Cho phép SUPER_ADMIN cấu hình trực tiếp khi quản lý nhãn.

## Quyết định kiến trúc

| # | Quyết định | Lý do |
|---|---|---|
| 1 | Trường recall **optional** (để trống = không recall) | KISS, không phải nhãn nào cũng cần |
| 2 | Tách component `label-settings.tsx` riêng (không dùng `SettingsCrudList` generic) | Generic không hỗ trợ 2 endpoint + side-effect |
| 3 | **Không cần migration cascade** - DELETE `/labels/:id` là **soft delete** (`isActive: false`) | Refinement sau khi đọc service. Backend không hard delete |
| 4 | Frontend gọi 2 endpoint song song, merge by `labelId` | KISS hơn modify backend `GET /labels` (tránh đụng cache `LOOKUP_LABELS`) |
| 5 | Cron `_recallLeadsByLabel` cần thêm filter `label.isActive = true` | Edge case: nếu không, label đã deactivate vẫn trigger recall |
| 6 | Quyền: chỉ **SUPER_ADMIN** mới sửa được trường recall (manager vẫn sửa được name/color/category) | Backend endpoint `/recall-configs/labels` đã `@Roles(SUPER_ADMIN)` |

## Phases

| Phase | File | Trạng thái |
|---|---|---|
| 01 | `phase-01-backend-cron-fix.md` | pending |
| 02 | `phase-02-frontend-label-settings.md` | pending |
| 03 | `phase-03-types-and-page-wiring.md` | pending |
| 04 | `phase-04-compile-test-commit.md` | pending |

## Files thay đổi

**Backend:**
- `apps/api/src/modules/recall-config/recall-config.service.ts` - sửa cron filter

**Frontend:**
- `apps/web/src/types/entities.ts` - extend `LabelEntity` với `category?, isActive?, recallConfig?`
- `apps/web/src/app/(dashboard)/settings/page.tsx` - fetch thêm `/recall-configs/labels`
- `apps/web/src/components/settings/settings-page-client.tsx` - pass `labelRecallConfigs` xuống
- `apps/web/src/components/settings/label-settings.tsx` - **rewrite** không dùng generic

**Không đổi:** schema Prisma, controllers backend, generic `SettingsCrudList`.

## Success Criteria

- [ ] Dialog "Thêm nhãn" có ô "Số ngày auto-recall" (optional, number, min=1)
- [ ] Dialog "Sửa nhãn" pre-fill recall days nếu có config
- [ ] List nhãn hiển thị badge "Recall sau X ngày" cho nhãn có config
- [ ] SUPER_ADMIN: edit được recall. Manager: ẩn/disable trường recall
- [ ] Tạo nhãn không nhập days → không tạo config (chỉ POST /labels)
- [ ] Tạo nhãn có days → POST /labels rồi POST /recall-configs/labels
- [ ] Sửa: chuyển từ "có → không" → DELETE config; "không → có" → POST; "đổi days" → PATCH
- [ ] Deactivate nhãn → cron không recall theo nhãn đó nữa
- [ ] Không lỗi compile (api + web)
- [ ] Commit + push

## Risk Assessment

- **Race condition:** POST label OK, POST config FAIL → label đã tạo, config không. Mitigation: try/catch + toast cụ thể "Đã tạo nhãn nhưng cấu hình recall thất bại, vui lòng sửa lại"
- **Cache invalidation:** `GET /labels` có cache. Sửa label sẽ invalidate. Nhưng cấu hình recall không cache → OK
- **State machine edit phức tạp:** Mitigation: tính diff `oldDays vs newDays` để chọn POST/PATCH/DELETE đúng

## Unresolved Questions

(không có)
