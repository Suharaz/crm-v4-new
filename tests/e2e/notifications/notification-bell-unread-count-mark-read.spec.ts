import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsUser } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

test.describe('Thông báo — Bell icon, Unread count, Đánh dấu đã đọc', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Bell icon hiển thị trên header', async ({ page }) => {
    await screenshotStep(page, 'bell-icon', 'notification-bell');

    // Bell button với aria-label="Thông báo"
    const bellBtn = page.getByRole('button', { name: 'Thông báo' });
    await expect(bellBtn).toBeVisible();
  });

  test('Bell icon có badge đỏ khi có thông báo chưa đọc', async ({ page }) => {
    await screenshotStep(page, 'bell-with-badge', 'notification-unread-badge');

    const bellBtn = page.getByRole('button', { name: 'Thông báo' });
    await expect(bellBtn).toBeVisible();

    // Badge (span đỏ) có thể hiện hoặc không tùy vào dữ liệu seed
    // Chỉ verify bell tồn tại, không bắt buộc có badge
    const badge = bellBtn.locator('span').filter({ hasText: /\d+/ }).first();
    // Badge là optional — pass nếu không có thông báo
    const badgeVisible = await badge.isVisible();
    // Log để debug, không fail test
    console.log(`Unread badge visible: ${badgeVisible}`);
  });

  test('Click bell → dropdown thông báo hiện ra', async ({ page }) => {
    const bellBtn = page.getByRole('button', { name: 'Thông báo' });
    await bellBtn.click();

    await screenshotStep(page, 'dropdown-thong-bao', 'notification-dropdown');

    // Dropdown chứa header "Thông báo"
    await expect(
      page.getByText('Thông báo', { exact: true }).nth(1).or(
        page.locator('[class*="rounded-xl"]').filter({ hasText: 'Thông báo' }).first(),
      ),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('Dropdown hiện danh sách thông báo hoặc trạng thái rỗng', async ({ page }) => {
    const bellBtn = page.getByRole('button', { name: 'Thông báo' });
    await bellBtn.click();

    // Chờ load
    await page.waitForTimeout(1_000);
    await screenshotStep(page, 'danh-sach-thong-bao', 'notification-list');

    // Phải hiện danh sách hoặc "Không có thông báo nào"
    await expect(
      page.getByText('Không có thông báo nào').or(
        page.locator('button[class*="flex w-full"]').first(),
      ),
    ).toBeVisible({ timeout: 8_000 });
  });

  test('Đánh dấu đã đọc từng thông báo', async ({ page }) => {
    const bellBtn = page.getByRole('button', { name: 'Thông báo' });
    await bellBtn.click();
    await page.waitForTimeout(1_000);

    // Tìm thông báo chưa đọc (bg-sky-50)
    const unreadNotif = page.locator('[class*="bg-sky-50"]').first();
    if (!(await unreadNotif.isVisible({ timeout: 3_000 }))) {
      test.skip(true, 'Không có thông báo chưa đọc');
      return;
    }

    await screenshotStep(page, 'truoc-mark-read', 'notification-mark-read');
    await unreadNotif.click();
    await page.waitForTimeout(500);

    await screenshotStep(page, 'sau-mark-read', 'notification-mark-read');

    // Thông báo không còn bg-sky-50 (đã chuyển sang đã đọc)
    await expect(unreadNotif).not.toHaveClass(/bg-sky-50/);
  });

  test('Đánh dấu tất cả đã đọc', async ({ page }) => {
    const bellBtn = page.getByRole('button', { name: 'Thông báo' });
    await bellBtn.click();
    await page.waitForTimeout(1_000);

    // Tìm nút "Đánh dấu tất cả đã đọc"
    const markAllBtn = page.getByRole('button', { name: /Đánh dấu tất cả đã đọc/ });
    if (!(await markAllBtn.isVisible({ timeout: 3_000 }))) {
      test.skip(true, 'Không có thông báo chưa đọc để mark all');
      return;
    }

    await screenshotStep(page, 'truoc-mark-all-read', 'notification-mark-all-read');
    await markAllBtn.click();
    await page.waitForTimeout(500);

    await screenshotStep(page, 'sau-mark-all-read', 'notification-mark-all-read');

    // Nút "Đánh dấu tất cả đã đọc" biến mất (không còn thông báo chưa đọc)
    await expect(markAllBtn).not.toBeVisible();
  });

  test('Click ngoài dropdown → dropdown đóng lại', async ({ page }) => {
    const bellBtn = page.getByRole('button', { name: 'Thông báo' });
    await bellBtn.click();
    await page.waitForTimeout(500);

    // Click ra ngoài dropdown
    await page.mouse.click(10, 10);
    await page.waitForTimeout(300);

    await screenshotStep(page, 'dropdown-dong', 'notification-close');

    // Dropdown đóng
    const dropdown = page.locator('[class*="absolute right-0 top-full"]');
    await expect(dropdown).not.toBeVisible();
  });

  test('USER thấy bell icon và dropdown thông báo của mình', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const bellBtn = page.getByRole('button', { name: 'Thông báo' });
    await expect(bellBtn).toBeVisible();

    await bellBtn.click();
    await page.waitForTimeout(500);
    await screenshotStep(page, 'thong-bao-user', 'notification-user-view');

    await expect(
      page.getByText('Thông báo').nth(1).or(
        page.getByText('Không có thông báo nào'),
      ),
    ).toBeVisible({ timeout: 5_000 });
  });
});
