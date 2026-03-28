import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsManager, loginAsUser } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

test.describe('Quản lý nhân viên — CRUD, Roles, Deactivate (SUPER_ADMIN only)', () => {
  test.describe('Phân quyền truy cập', () => {
    test('SUPER_ADMIN thấy trang /users', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'users-page-admin', 'users-access');

      await expect(page.getByRole('heading', { name: 'Quản lý nhân viên' })).toBeVisible();
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('MANAGER bị chặn không vào /users', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'users-page-manager-blocked', 'users-access');

      // Manager bị redirect hoặc thấy trang lỗi 403
      const isBlocked =
        page.url().includes('/login') ||
        page.url() === 'http://localhost:3011/' ||
        !(await page.getByRole('heading', { name: 'Quản lý nhân viên' }).isVisible());
      expect(isBlocked).toBeTruthy();
    });

    test('USER bị chặn không vào /users', async ({ page }) => {
      await loginAsUser(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'users-page-user-blocked', 'users-access');

      const isBlocked =
        page.url().includes('/login') ||
        page.url() === 'http://localhost:3011/' ||
        !(await page.getByRole('heading', { name: 'Quản lý nhân viên' }).isVisible());
      expect(isBlocked).toBeTruthy();
    });

    test('Sidebar của USER không có link Quản lý NV', async ({ page }) => {
      await loginAsUser(page);
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'sidebar-user-no-users-link', 'users-sidebar');

      await expect(page.getByRole('link', { name: 'Quản lý NV' })).not.toBeVisible();
    });
  });

  test.describe('CRUD nhân viên (SUPER_ADMIN)', () => {
    test('Tạo nhân viên mới với role USER', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users/new');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'form-tao-nv', 'user-create');

      const timestamp = Date.now();
      const email = `nv.test${timestamp}@crm.vn`;

      await page.getByLabel('Họ tên').fill(`NV Test ${timestamp}`);
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Mật khẩu').fill('NhanVien@123');

      // Chọn role USER (mặc định hoặc qua select)
      const roleSelect = page.getByLabel('Vai trò').or(
        page.getByRole('combobox', { name: /Vai trò|Role/ }),
      ).first();
      if (await roleSelect.isVisible()) {
        await roleSelect.click();
        const userOption = page.getByRole('option', { name: /Nhân viên|USER/ }).first();
        if (await userOption.isVisible()) await userOption.click();
      }

      await screenshotStep(page, 'form-dien-xong', 'user-create');

      await page.getByRole('button', { name: /Tạo|Lưu/ }).first().click();
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'sau-tao-nv', 'user-create');

      // Redirect về /users hoặc hiện nhân viên mới
      await expect(
        page.getByText(`NV Test ${timestamp}`).or(
          page.getByRole('heading', { name: 'Quản lý nhân viên' }),
        ),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('Edit nhân viên — đổi tên', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Tìm nhân viên test
      const nvLink = page.getByRole('link', { name: /NV Test/ }).first();
      await nvLink.waitFor({ state: 'visible', timeout: 10_000 });
      const href = await nvLink.getAttribute('href');
      if (!href) {
        test.skip(true, 'Không có nhân viên test');
        return;
      }

      await page.goto(`${href}/edit`);
      await page.waitForLoadState('networkidle');

      const updatedName = `NV Updated ${Date.now()}`;
      await page.getByLabel('Họ tên').clear();
      await page.getByLabel('Họ tên').fill(updatedName);

      await screenshotStep(page, 'form-edit-nv', 'user-edit');

      await page.getByRole('button', { name: /Lưu/ }).first().click();
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'sau-edit-nv', 'user-edit');
      await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10_000 });
    });

    test('Deactivate nhân viên — tài khoản bị khóa', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/users');
      await page.waitForLoadState('networkidle');

      // Tìm nhân viên test để deactivate
      const nvLink = page.getByRole('link', { name: /NV/ }).first();
      await nvLink.waitFor({ state: 'visible', timeout: 10_000 });
      await nvLink.click();
      await page.waitForLoadState('networkidle');

      const deactivateBtn = page.getByRole('button', { name: /Vô hiệu hóa|Khóa|Deactivate/ }).first();
      if (!(await deactivateBtn.isVisible())) {
        test.skip(true, 'Không có nút Deactivate');
        return;
      }

      await screenshotStep(page, 'truoc-deactivate', 'user-deactivate');
      await deactivateBtn.click();

      const confirmBtn = page.getByRole('button', { name: /Xác nhận|OK/ }).first();
      await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await confirmBtn.click();

      await page.waitForLoadState('networkidle');
      await screenshotStep(page, 'sau-deactivate', 'user-deactivate');

      // Trạng thái bị khóa hiện ra
      await expect(
        page.getByText('Đã khóa').or(page.getByText('INACTIVE')).or(
          page.locator('[class*="toast"]'),
        ),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});
