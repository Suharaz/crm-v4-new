# Phase 02: Shared utils + cell components + dialogs

**Status:** Draft | **Priority:** P0 (parallel với Phase 01) | **Est:** 3h

## Mục tiêu
Tạo các building block tái dùng cho table mới: carrier detect, phone cell, info button, 2 dialogs.

## Components & Utils mới

### 1. `packages/utils/src/phone-carrier.ts`
```ts
export type Carrier = 'VIETTEL' | 'MOBI' | 'VINA' | 'VIETNAMOBILE' | 'GMOBILE' | 'ITELECOM' | null;
export function detectCarrier(phone: string): Carrier;
```
Prefix map (sau khi normalize về `0xxx`):
- VIETTEL: 086, 096, 097, 098, 032-039
- MOBI: 070, 076-079, 089, 090, 093
- VINA: 081-085, 088, 091, 094
- VIETNAMOBILE: 056, 058, 092
- GMOBILE: 059, 099
- ITELECOM: 087
Fallback: null

### 2. `apps/web/src/components/leads/phone-cell.tsx`
Hiển thị:
- SĐT format `formatPhoneDisplay()`
- Badge nhà mạng (carrier name + màu)
- 3 nút icon: clock (mở ActivityTimelineDialog), mic (mở CallHistoryDialog), copy (clipboard.writeText)

Props: `{ phone: string; leadId: string; onOpenTimeline?: () => void; onOpenCalls?: () => void; }`

### 3. `apps/web/src/components/leads/lead-name-with-info.tsx`
Hiển thị:
- Tên lead (clickable → navigate /leads/[id])
- Icon ⓘ nhỏ kế bên → click mở `EntityQuickPreviewDialog`

Props: `{ lead: LeadRecord }`

### 4. `apps/web/src/components/shared/call-history-dialog.tsx`
Dialog list call_logs theo phone:
- GET /api/v1/call-logs?phone=X&limit=20
- Hiển thị table: time, type (incoming/outgoing/missed), duration, summary
- Empty state nếu chưa có

### 5. `apps/web/src/components/shared/lead-activity-timeline-dialog.tsx`
Dialog timeline activities theo leadId:
- Tái dùng `ActivityTimelineWithFilterTabs` (đã có)
- Wrap trong Dialog component

## Related Code Files (read-only context)
- `packages/utils/src/phone-normalizer.ts` - util pattern
- `apps/web/src/components/shared/entity-quick-preview-dialog.tsx` - tái dùng
- `apps/web/src/components/shared/activity-timeline-with-filter-tabs.tsx` - tái dùng
- `apps/web/src/lib/api/call-logs.ts` (nếu có) - API client

## Implementation Steps
1. Tạo `phone-carrier.ts` trong utils + export trong index
2. Build `pnpm --filter @crm/utils build` để TS picked up
3. Tạo `phone-cell.tsx` - copy button dùng `navigator.clipboard.writeText` + toast
4. Tạo `lead-name-with-info.tsx` - reuse EntityQuickPreviewDialog
5. Tạo `call-history-dialog.tsx` - GET API + render table
6. Tạo `lead-activity-timeline-dialog.tsx` - wrap ActivityTimelineWithFilterTabs
7. Verify typecheck

## Todo
- [ ] Tạo `packages/utils/src/phone-carrier.ts` + test prefix detect
- [ ] Export trong `packages/utils/src/index.ts`
- [ ] Build @crm/utils
- [ ] Tạo `phone-cell.tsx`
- [ ] Tạo `lead-name-with-info.tsx`
- [ ] Tạo `call-history-dialog.tsx`
- [ ] Tạo `lead-activity-timeline-dialog.tsx`
- [ ] Typecheck web app

## Success Criteria
- Carrier detect đúng cho 6 nhà mạng + return null cho non-VN
- Copy button hiện toast "Đã copy"
- Click clock → mở dialog timeline (xem được activity của lead)
- Click mic → mở dialog call logs (xem được call history theo SĐT)
- Click ⓘ → mở quick preview popup

## Risk
- `navigator.clipboard` chỉ work trên HTTPS / localhost → có fallback exec command
- Dialog stacking khi click từ table - đảm bảo z-index OK
