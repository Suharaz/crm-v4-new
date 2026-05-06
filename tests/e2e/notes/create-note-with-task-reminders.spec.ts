import { test, expect } from '@playwright/test';
import { loginAsUser } from '../../helpers/test-auth-login-helper';

// Helper: convert Date → datetime-local input value (YYYY-MM-DDTHH:mm)
function toInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Open the NoteDialog from lead-actions trigger on the first visible lead row. */
async function openNoteDialog(page: import('@playwright/test').Page) {
  await page.goto('/leads');
  await page.waitForLoadState('networkidle');

  // Click the first lead row to navigate to its detail page
  const detailLink = page
    .locator('a[href^="/leads/"]')
    .first();
  await detailLink.waitFor({ state: 'visible', timeout: 15_000 });
  await detailLink.click();
  await page.waitForLoadState('networkidle');

  // Click the "Ghi chú" button in LeadActions
  const noteBtn = page
    .getByRole('button', { name: /Ghi chú/ })
    .first();
  await noteBtn.waitFor({ state: 'visible', timeout: 10_000 });
  await noteBtn.click();

  // Wait for NoteDialog to appear
  await page.locator('[data-testid="note-dialog"]').waitFor({ state: 'visible', timeout: 5_000 });
}

test.describe('NoteDialog - ghi chú với nhắc nhở', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
  });

  test('Tạo note + task với 3 reminders mặc định (deadline 3 ngày)', async ({ page }) => {
    await openNoteDialog(page);

    const dialog = page.locator('[data-testid="note-dialog"]');

    // Fill note content
    await dialog.locator('textarea').fill('Nhớ gọi lại khách A về đơn hàng');

    // Check "Tạo công việc từ ghi chú này"
    await dialog.locator('[data-testid="create-task-checkbox"]').check();

    // Set task title (auto-filled but ensure it has content)
    const titleInput = dialog.locator('input[maxlength="200"]').first();
    if (await titleInput.isVisible()) {
      await titleInput.fill('Gọi lại khách A');
    }

    // Set deadline 3 days from now → expect 3 default reminders
    const dueDate = new Date(Date.now() + 3 * 86_400_000);
    await dialog.locator('[data-testid="task-due-date"]').fill(toInputValue(dueDate));

    // Verify 3 default reminder rows appear
    const reminderRows = dialog.locator('[data-testid="reminder-row"]');
    await expect(reminderRows).toHaveCount(3, { timeout: 3_000 });

    // Check labels (first = 1 ngày trước, last = 30 phút trước)
    await expect(reminderRows.nth(0).locator('input[type="text"]')).toHaveValue('1 ngày trước');
    await expect(reminderRows.nth(1).locator('input[type="text"]')).toHaveValue('1 giờ trước');
    await expect(reminderRows.nth(2).locator('input[type="text"]')).toHaveValue('30 phút trước');

    // Submit
    await page.locator('[data-testid="note-dialog-submit"]').click();

    // Expect success toast
    await expect(
      page.getByText(/Đã thêm ghi chú và tạo công việc/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Deadline 1h sau → chỉ 1 reminder (30 phút trước)', async ({ page }) => {
    await openNoteDialog(page);

    const dialog = page.locator('[data-testid="note-dialog"]');

    await dialog.locator('textarea').fill('Test deadline gần');
    await dialog.locator('[data-testid="create-task-checkbox"]').check();

    const titleInput = dialog.locator('input[maxlength="200"]').first();
    if (await titleInput.isVisible()) {
      await titleInput.fill('Nhắc nhanh');
    }

    // Deadline 1 hour from now - only "30 phút trước" passes the > now filter
    const nearDue = new Date(Date.now() + 3_600_000);
    await dialog.locator('[data-testid="task-due-date"]').fill(toInputValue(nearDue));

    const reminderRows = dialog.locator('[data-testid="reminder-row"]');
    await expect(reminderRows).toHaveCount(1, { timeout: 3_000 });
    await expect(reminderRows.first().locator('input[type="text"]')).toHaveValue('30 phút trước');
  });

  test('Max 5 reminders - nút thêm bị disabled khi đạt giới hạn', async ({ page }) => {
    await openNoteDialog(page);

    const dialog = page.locator('[data-testid="note-dialog"]');

    await dialog.locator('textarea').fill('Test max reminders');
    await dialog.locator('[data-testid="create-task-checkbox"]').check();

    const titleInput = dialog.locator('input[maxlength="200"]').first();
    if (await titleInput.isVisible()) {
      await titleInput.fill('Công việc test max');
    }

    // Set deadline 3 days out → 3 default reminders
    const dueDate = new Date(Date.now() + 3 * 86_400_000);
    await dialog.locator('[data-testid="task-due-date"]').fill(toInputValue(dueDate));

    const addBtn = dialog.locator('[data-testid="add-reminder"]');
    const reminderRows = dialog.locator('[data-testid="reminder-row"]');

    // Already have 3, add 2 more to reach max 5
    await expect(reminderRows).toHaveCount(3, { timeout: 3_000 });

    for (let i = 0; i < 2; i++) {
      await expect(addBtn).not.toBeDisabled();
      await addBtn.click();
    }

    await expect(reminderRows).toHaveCount(5);
    await expect(addBtn).toBeDisabled();
  });

  test.skip('Click notification TASK_REMIND → navigate to lead (requires cron timing)', async () => {
    // Skipped: verifying notification click navigation requires either:
    // 1. A seeded past-due TaskReminder + cron execution, or
    // 2. A test helper to directly INSERT notification rows.
    // Neither is available in this E2E suite. Cover with backend unit test instead.
  });
});
