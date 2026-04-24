# Phase 05 — Integration + E2E Test + Notification Bell Update

**Priority:** P1 | **Status:** ✅ Completed | **Effort:** 2h | **Depends on:** P2 + P4

## Overview
Thay 3 chỗ inline note dialog bằng `<NoteDialog />`. Update NotificationBell hỗ trợ icon TASK_REMIND + click navigate. Viết E2E test full flow.

## Files thay đổi

### 1. `apps/web/src/components/leads/lead-actions.tsx`
- Xoá state `noteOpen`, `noteContent`, `createTaskFromNote`, `setCreateTaskFromNote`
- Xoá Dialog inline (dòng 219-266)
- Thêm `<NoteDialog />` với `entityType="lead"`, `entityId={lead.id}`
- Giữ trigger button mở dialog

### 2. `apps/web/src/components/leads/lead-inline-expand-detail.tsx`
- Tương tự: xoá inline note bar, dùng `<NoteDialog />` (hoặc giữ bar inline nếu UX khác, tuỳ quyết định cuối)
- Nếu inline bar vẫn cần (ghi chú nhanh không có task) → giữ song song: bar cho note-only, button "Thêm với task" mở NoteDialog

### 3. `apps/web/src/components/shared/entity-quick-preview-dialog.tsx`
- Inline note section (dòng 328-340) — tương tự quyết định trên
- Hoặc thay hoàn toàn bằng NoteDialog nested

### 4. `apps/web/src/components/layout/notification-bell.tsx`
```ts
// Thêm icon cho TASK_REMIND
import { Clock } from 'lucide-react';

function NotificationIcon({ type }: { type: string }) {
  // ... existing checks
  if (type.includes('TASK_REMIND') || type.includes('task_remind')) {
    return <Clock className={`${cls} text-orange-500`} />;
  }
  // ... rest
}

// Click navigation
const router = useRouter();

function handleNotificationClick(n: Notification) {
  if (!n.isRead) markAsRead(n.id);

  if (n.referenceType && n.referenceId) {
    const url = getNotificationUrl(n.referenceType, n.referenceId);
    if (url) router.push(url);
  }
  setOpen(false);
}
```

### 5. File mới: `apps/web/src/lib/notification-navigation.ts`
```ts
export function getNotificationUrl(refType: string, refId: string): string | null {
  switch (refType.toUpperCase()) {
    case 'LEAD': return `/leads/${refId}`;
    case 'CUSTOMER': return `/customers/${refId}`;
    case 'ORDER': return `/orders/${refId}`;
    case 'TASK': return `/tasks?focus=${refId}`;
    default: return null;
  }
}
```

## E2E Test

**File mới:** `tests/e2e/notes/create-note-with-task-reminders.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test.describe('Note dialog with task reminders', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'sale@test.com', 'pass');
  });

  test('tạo note + task với 3 reminders mặc định', async ({ page }) => {
    await page.goto('/leads');
    await page.click('text="Pool"');
    await page.click('[data-testid="lead-actions-trigger"]').first();
    await page.click('text="Thêm ghi chú"');

    await page.fill('textarea[placeholder*="ghi chú"]', 'Nhớ gọi lại khách A về đơn hàng');
    await page.check('text="Tạo công việc từ ghi chú này"');

    // Deadline 3 ngày sau
    const future = new Date(Date.now() + 3 * 86400_000);
    await page.fill('input[type="datetime-local"]', toInputValue(future));

    // Verify 3 default reminders hiển thị
    const reminderRows = page.locator('[data-testid="reminder-row"]');
    await expect(reminderRows).toHaveCount(3);
    await expect(reminderRows.nth(0)).toContainText('1 ngày trước');
    await expect(reminderRows.nth(1)).toContainText('1 giờ trước');
    await expect(reminderRows.nth(2)).toContainText('30 phút trước');

    await page.click('button:has-text("Thêm")');
    await expect(page.locator('text="Đã thêm ghi chú và tạo công việc"')).toBeVisible();
  });

  test('deadline 1h sau → chỉ 1 reminder 30p', async ({ page }) => {
    // ... mở dialog
    const near = new Date(Date.now() + 3600_000);
    await page.fill('input[type="datetime-local"]', toInputValue(near));

    const reminderRows = page.locator('[data-testid="reminder-row"]');
    await expect(reminderRows).toHaveCount(1);
    await expect(reminderRows.first()).toContainText('30 phút trước');
  });

  test('max 5 reminders', async ({ page }) => {
    // ... setup, có 3 default
    for (let i = 0; i < 3; i++) {
      const btn = page.locator('button:has-text("Thêm mốc")');
      if (await btn.isDisabled()) break;
      await btn.click();
    }
    await expect(page.locator('[data-testid="reminder-row"]')).toHaveCount(5);
    await expect(page.locator('button:has-text("Thêm mốc")')).toBeDisabled();
  });

  test('click notification → navigate to lead', async ({ page }) => {
    // Tạo task với remindAt past (để trigger notification ngay)
    // Hoặc mock: directly insert notification via test helper
    // Click bell → click notif → expect URL = /leads/{id}
  });
});
```

## Notification E2E (manual hoặc backend test)
- Unit test cron: tạo task với reminder past → chạy `processReminders` → verify Notification row được INSERT + `remindedAt` set
- Verify `referenceType=LEAD`, `referenceId=leadId`
- Verify không double-send (chạy cron 2 lần, chỉ 1 notification)

## Implementation Steps
1. Update NotificationBell: icon + navigation
2. Create `notification-navigation.ts`
3. Replace dialog ở lead-actions.tsx
4. Replace ở lead-inline-expand-detail.tsx (quyết định inline vs dialog)
5. Replace ở entity-quick-preview-dialog.tsx
6. Write E2E tests
7. Run full test suite
8. Manual QA: tạo note + task, đợi cron, verify bell hiện thông báo, click navigate

## Todo
- [x] Update notification-bell: icon TASK_REMIND
- [x] Update notification-bell: click navigate
- [x] Create `notification-navigation.ts`
- [x] Replace lead-actions.tsx
- [x] Replace lead-inline-expand-detail.tsx
- [x] Replace entity-quick-preview-dialog.tsx
- [x] E2E test: 3 default reminders
- [x] E2E test: 1h deadline → 1 reminder
- [x] E2E test: max 5
- [x] E2E test: click notification navigate
- [x] Manual QA full flow

## Success Criteria
- Tất cả 3 chỗ có nút ghi chú đều dùng `<NoteDialog />`
- Không còn state duplicate `noteOpen/noteText/createTaskFromNote` trong 3 file
- Notification bell icon Clock cam cho TASK_REMIND
- Click notification → navigate đúng URL theo entityType
- E2E tests pass
- Manual test: cron gửi đúng notification, bell cập nhật sau poll 30s

## Risks
- Replace dialog có thể break test hiện tại (`task-quick-add-complete-cancel-edit-delete.spec.ts`) — review + update test IDs
- Inline bar ở `entity-quick-preview-dialog.tsx` UX khác với dialog — cần decision: giữ song song hay unify

## Security
- Navigation URL build từ whitelist `getNotificationUrl` (không accept arbitrary refType → không có open redirect)
- `referenceId` truyền qua URL param — backend check ownership khi load page detail

## Follow-up
- Sau khi deploy, monitor xem có edge case nào không (task tạo rồi nhưng không nhận notif, hoặc double notif)
- Có thể thêm test cho escalation flow (hiện chưa thay đổi)
