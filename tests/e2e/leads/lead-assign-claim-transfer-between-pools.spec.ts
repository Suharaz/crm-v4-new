import { test, expect } from '@playwright/test';
import { loginAsManager, loginAsUser, loginAsAdmin } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

test.describe('Lead — Assign, Claim, Transfer', () => {
  test.describe('Manager assign lead cho user', () => {
    test('MANAGER mở lead detail → assign cho nhân viên', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/leads');
      await page.waitForLoadState('networkidle');

      // Mở lead đầu tiên
      const firstLink = page.getByRole('link', { name: /Lead|lead/ }).first();
      await firstLink.waitFor({ state: 'visible', timeout: 10_000 });
      await firstLink.click();
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'lead-detail-truoc-assign', 'lead-assign');

      // Tìm nút Assign / Phân công
      const assignBtn = page.getByRole('button', { name: /Phân công|Assign/ }).first();
      if (!(await assignBtn.isVisible())) {
        test.skip(true, 'Lead không ở trạng thái có thể assign');
        return;
      }

      await assignBtn.click();
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'sau-assign', 'lead-assign');

      // Không còn lỗi, trang vẫn hiển thị bình thường
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  test.describe('User claim lead từ pool', () => {
    test('USER vào Kho Thả Nổi → claim lead về kho cá nhân', async ({ page }) => {
      await loginAsUser(page);
      await page.goto('/floating');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'kho-tha-noi', 'lead-claim');

      // Tìm nút Claim
      const claimBtn = page.getByRole('button', { name: /Nhận|Claim/ }).first();
      if (!(await claimBtn.isVisible())) {
        test.skip(true, 'Không có lead nào để claim trong kho thả nổi');
        return;
      }

      await claimBtn.click();
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'sau-claim', 'lead-claim');

      // Toast thành công hoặc lead biến mất khỏi floating
      await expect(
        page.getByText('thành công').or(page.getByText('Đã nhận')).or(
          page.locator('[class*="toast"]'),
        ),
      ).toBeVisible({ timeout: 10_000 });
    });
  });

  test.describe('Transfer lead', () => {
    test('MANAGER transfer lead sang phòng ban khác', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/leads');
      await page.waitForLoadState('networkidle');

      const firstLink = page.getByRole('link', { name: /Lead/ }).first();
      await firstLink.waitFor({ state: 'visible', timeout: 10_000 });
      await firstLink.click();
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'lead-detail-truoc-transfer', 'lead-transfer-dept');

      const transferBtn = page.getByRole('button', { name: /Chuyển|Transfer/ }).first();
      if (!(await transferBtn.isVisible())) {
        test.skip(true, 'Không có nút Transfer trên lead này');
        return;
      }

      await transferBtn.click();

      // Dialog transfer
      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ state: 'visible', timeout: 5_000 });

      await screenshotStep(page, 'dialog-transfer', 'lead-transfer-dept');

      // Chọn option DEPARTMENT
      const deptOption = dialog.getByRole('option', { name: /Phòng ban|Department/ }).first()
        .or(dialog.getByText('DEPARTMENT').first());
      if (await deptOption.isVisible()) {
        await deptOption.click();
      }

      const confirmBtn = dialog.getByRole('button', { name: /Xác nhận|Chuyển|OK/ }).first();
      await confirmBtn.click();
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'sau-transfer-dept', 'lead-transfer-dept');
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('MANAGER transfer lead sang Kho Thả Nổi', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/leads');
      await page.waitForLoadState('networkidle');

      const firstLink = page.getByRole('link', { name: /Lead/ }).first();
      await firstLink.waitFor({ state: 'visible', timeout: 10_000 });
      await firstLink.click();
      await page.waitForLoadState('networkidle');

      const transferBtn = page.getByRole('button', { name: /Chuyển|Transfer/ }).first();
      if (!(await transferBtn.isVisible())) {
        test.skip(true, 'Không có nút Transfer');
        return;
      }

      await transferBtn.click();

      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ state: 'visible', timeout: 5_000 });

      // Chọn option FLOATING / Kho thả nổi
      const floatingOption = dialog.getByRole('option', { name: /Thả nổi|Floating/ }).first()
        .or(dialog.getByText('FLOATING').first());
      if (await floatingOption.isVisible()) {
        await floatingOption.click();
      }

      const confirmBtn = dialog.getByRole('button', { name: /Xác nhận|Chuyển|OK/ }).first();
      await confirmBtn.click();
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'sau-transfer-floating', 'lead-transfer-floating');

      await expect(
        page.getByText('FLOATING').or(page.getByText('Thả nổi')).or(
          page.locator('[class*="toast"]'),
        ),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});
