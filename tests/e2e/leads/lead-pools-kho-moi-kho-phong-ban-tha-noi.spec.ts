import { test, expect } from '@playwright/test';
import { loginAsManager, loginAsUser, loginAsAdmin } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

test.describe('Lead Pools — Kho Mới, Kho Phòng Ban, Kho Thả Nổi', () => {
  test.describe('Kho Mới (POOL, dept=null)', () => {
    test('MANAGER thấy leads trong Kho Mới', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/leads/pool');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'kho-moi-manager', 'pool-visibility');

      // Trang tải được, không bị 403 hay redirect
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByText('Không có lead nào').or(
        page.locator('table tbody tr').first(),
      )).toBeVisible({ timeout: 10_000 });
    });

    test('SUPER_ADMIN thấy leads trong Kho Mới', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/leads/pool');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'kho-moi-admin', 'pool-visibility');
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('USER thường không thấy nút Kho Mới trên sidebar', async ({ page }) => {
      await loginAsUser(page);
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'sidebar-user', 'pool-visibility');

      // USER không có link đến kho mới trong navigation
      const poolLink = page.getByRole('link', { name: 'Kho Mới' });
      // Nếu link không tồn tại hoặc không visible thì pass
      const isVisible = await poolLink.isVisible();
      // USER có thể thấy Leads chung nhưng không thấy pool riêng của manager
      expect(isVisible).toBeFalsy();
    });
  });

  test.describe('Kho Thả Nổi (FLOATING)', () => {
    test('USER thấy trang Kho Thả Nổi', async ({ page }) => {
      await loginAsUser(page);
      await page.goto('/floating');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'tha-noi-user', 'floating-visibility');

      // Không bị redirect, trang hiện bình thường
      await expect(page).not.toHaveURL(/\/login/);
      await expect(
        page.getByText('Kho thả nổi').or(page.getByText('Floating')).or(
          page.getByText('Không có lead nào'),
        ),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('MANAGER thấy trang Kho Thả Nổi', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/floating');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'tha-noi-manager', 'floating-visibility');
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('SUPER_ADMIN thấy trang Kho Thả Nổi', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/floating');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'tha-noi-admin', 'floating-visibility');
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  test.describe('Kho Phòng Ban (POOL, dept=X)', () => {
    test('USER thấy leads kho của phòng ban mình trên trang /leads', async ({ page }) => {
      await loginAsUser(page);
      await page.goto('/leads');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'leads-user', 'dept-pool-visibility');

      // User thấy trang leads của mình
      await expect(page).not.toHaveURL(/\/login/);
      await expect(
        page.getByRole('heading', { name: 'Leads' }),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('MANAGER thấy leads pool của phòng ban mình', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/leads');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'leads-manager', 'dept-pool-visibility');

      await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();

      // Manager có thể lọc theo phòng ban
      // Nút "Kho Mới" visible với manager
      const khoMoiButton = page.getByRole('link', { name: 'Kho Mới' }).or(
        page.getByRole('button', { name: 'Kho Mới' }),
      );
      await expect(khoMoiButton).toBeVisible({ timeout: 5_000 });
    });
  });
});
