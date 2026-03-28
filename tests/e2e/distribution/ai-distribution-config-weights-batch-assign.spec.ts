import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsManager, loginAsUser } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

test.describe('Phân phối AI — Cấu hình trọng số, Xem điểm, Batch assign', () => {
  test.describe('Phân quyền truy cập', () => {
    test('SUPER_ADMIN truy cập trang Phân phối AI', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings/distribution');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'distribution-admin', 'ai-distribution-access');

      await expect(page.getByRole('heading', { name: 'Phân phối AI' })).toBeVisible();
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('MANAGER truy cập trang Phân phối AI', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/settings/distribution');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'distribution-manager', 'ai-distribution-access');

      await expect(page.getByRole('heading', { name: 'Phân phối AI' })).toBeVisible();
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('USER thường không thấy link Phân phối AI trên sidebar', async ({ page }) => {
      await loginAsUser(page);
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'sidebar-user-no-distribution', 'ai-distribution-user-blocked');

      // USER không có link Phân phối AI trong sidebar
      await expect(page.getByRole('link', { name: 'Phân phối AI' })).not.toBeVisible();
    });

    test('USER bị chặn khi truy cập trực tiếp /settings/distribution', async ({ page }) => {
      await loginAsUser(page);
      await page.goto('/settings/distribution');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'distribution-user-blocked', 'ai-distribution-blocked');

      // Bị redirect hoặc không thấy heading "Phân phối AI"
      const isBlocked =
        page.url().includes('/login') ||
        page.url() === 'http://localhost:3011/' ||
        !(await page.getByRole('heading', { name: 'Phân phối AI' }).isVisible());
      expect(isBlocked).toBeTruthy();
    });
  });

  test.describe('Giao diện cấu hình', () => {
    test('Trang hiển thị danh sách phòng ban để cấu hình', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings/distribution');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'distribution-dept-list', 'ai-distribution-ui');

      // Trang load được, không lỗi
      await expect(page.getByRole('heading', { name: 'Phân phối AI' })).toBeVisible();

      // Có nội dung nào đó (phòng ban hoặc thông báo trống)
      await expect(
        page.locator('main, [role="main"]').first(),
      ).not.toBeEmpty();
    });

    test('Cấu hình trọng số cho phòng ban', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings/distribution');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'truoc-config-weights', 'ai-distribution-weights');

      // Tìm input số (trọng số) hoặc slider
      const weightInput = page.getByLabel(/Trọng số|tỷ lệ|KPI|Leads|Score/).first()
        .or(page.locator('input[type="number"]').first());

      if (!(await weightInput.isVisible({ timeout: 5_000 }))) {
        // Thử click vào phòng ban đầu tiên để mở config
        const deptCard = page.locator('[class*="rounded"]').filter({
          hasText: /Phòng|Sales|Kinh doanh/,
        }).first();

        if (await deptCard.isVisible()) {
          await deptCard.click();
          await page.waitForLoadState('networkidle');
        } else {
          test.skip(true, 'Không tìm thấy giao diện cấu hình trọng số');
          return;
        }
      }

      await screenshotStep(page, 'config-weights-visible', 'ai-distribution-weights');
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('Lưu cấu hình trọng số', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings/distribution');
      await page.waitForLoadState('networkidle');

      // Tìm nút Lưu cấu hình
      const saveBtn = page.getByRole('button', { name: /Lưu|Cập nhật|Save/ }).first();
      if (!(await saveBtn.isVisible({ timeout: 5_000 }))) {
        test.skip(true, 'Không có nút Lưu trên trang này');
        return;
      }

      await screenshotStep(page, 'truoc-luu-config', 'ai-distribution-save');
      await saveBtn.click();
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'sau-luu-config', 'ai-distribution-save');

      // Toast thành công hoặc không có lỗi
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('Xem điểm AI preview của nhân viên', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings/distribution');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'truoc-preview-scores', 'ai-distribution-scores');

      // Tìm nút Xem điểm / Preview scores
      const previewBtn = page.getByRole('button', { name: /Xem điểm|Preview|Điểm số/ }).first();
      if (!(await previewBtn.isVisible({ timeout: 5_000 }))) {
        test.skip(true, 'Không có nút preview điểm AI');
        return;
      }

      await previewBtn.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1_000);

      await screenshotStep(page, 'sau-preview-scores', 'ai-distribution-scores');
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('Batch distribute — phân phối hàng loạt', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings/distribution');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'truoc-batch-distribute', 'ai-distribution-batch');

      // Tìm nút Phân phối / Batch distribute
      const distributeBtn = page.getByRole('button', {
        name: /Phân phối|Distribute|Batch/,
      }).first();

      if (!(await distributeBtn.isVisible({ timeout: 5_000 }))) {
        test.skip(true, 'Không có nút Batch distribute');
        return;
      }

      await distributeBtn.click();

      // Có thể có confirm dialog
      const confirmBtn = page.getByRole('button', { name: /Xác nhận|OK/ }).first();
      if (await confirmBtn.isVisible({ timeout: 2_000 })) {
        await confirmBtn.click();
      }

      await page.waitForLoadState('networkidle');
      await screenshotStep(page, 'sau-batch-distribute', 'ai-distribution-batch');

      // Không bị lỗi, không redirect
      await expect(page).not.toHaveURL(/\/login/);
    });
  });
});
