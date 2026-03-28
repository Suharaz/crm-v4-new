import { test, expect } from '@playwright/test';
import { loginAs, loginAsAdmin, loginAsManager, loginAsUser, logout } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

test.describe('Xác thực — Login / Logout / Session guard', () => {
  test('SUPER_ADMIN đăng nhập thành công → redirect về dashboard', async ({ page }) => {
    await page.goto('/login');
    await screenshotStep(page, 'trang-login', 'admin-login');

    await page.getByLabel('Email').fill('admin@crm.vn');
    await page.getByLabel('Mật khẩu').fill('Admin@123');
    await screenshotStep(page, 'da-dien-form', 'admin-login');

    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });

    await screenshotStep(page, 'sau-dang-nhap', 'admin-login');
    await expect(page.getByText('Trang chủ').or(page.getByText('CRM V4'))).toBeVisible();
  });

  test('MANAGER đăng nhập thành công → redirect về dashboard', async ({ page }) => {
    await loginAsManager(page);
    await screenshotStep(page, 'manager-dashboard', 'manager-login');

    // Sidebar hiện ra — đây là dấu hiệu đăng nhập thành công
    await expect(page.getByRole('link', { name: 'Leads' })).toBeVisible();
  });

  test('USER (sale) đăng nhập thành công → redirect về dashboard', async ({ page }) => {
    await loginAsUser(page);
    await screenshotStep(page, 'user-dashboard', 'user-login');

    await expect(page.getByRole('link', { name: 'Leads' })).toBeVisible();
  });

  test('Sai mật khẩu → hiện thông báo lỗi', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('admin@crm.vn');
    await page.getByLabel('Mật khẩu').fill('SaiMatKhau123!');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    // Chờ thông báo lỗi hiện ra
    await expect(
      page.locator('text=Sai email hoặc mật khẩu').or(
        page.locator('text=Thông tin đăng nhập không đúng').or(
          page.locator('text=Lỗi').first(),
        ),
      ),
    ).toBeVisible({ timeout: 10_000 });

    await screenshotStep(page, 'loi-sai-mat-khau', 'login-error');

    // Vẫn còn ở trang login
    await expect(page).toHaveURL(/\/login/);
  });

  test('Email không tồn tại → hiện thông báo lỗi chung', async ({ page }) => {
    await page.goto('/login');

    await page.getByLabel('Email').fill('khongtontai@crm.vn');
    await page.getByLabel('Mật khẩu').fill('BatKyMatKhau@123');
    await page.getByRole('button', { name: 'Đăng nhập' }).click();

    // Không hiện thông tin cụ thể để tránh user enumeration
    await expect(
      page.locator('[class*="red"]').or(page.locator('[class*="error"]')),
    ).toBeVisible({ timeout: 10_000 });

    await screenshotStep(page, 'loi-email-khong-ton-tai', 'login-error');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Đăng xuất → redirect về /login', async ({ page }) => {
    await loginAsAdmin(page);
    await screenshotStep(page, 'truoc-dang-xuat', 'logout');

    // Click nút logout (title="Đăng xuất") trên header
    await page.getByRole('button', { name: 'Đăng xuất' }).click();
    await page.waitForURL('**/login', { timeout: 10_000 });

    await screenshotStep(page, 'sau-dang-xuat', 'logout');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Truy cập /leads khi chưa đăng nhập → redirect về /login', async ({ page }) => {
    // Xóa cookies để đảm bảo chưa đăng nhập
    await page.context().clearCookies();

    await page.goto('/leads');
    await page.waitForURL('**/login**', { timeout: 10_000 });

    await screenshotStep(page, 'redirect-chua-dang-nhap', 'session-guard');
    await expect(page).toHaveURL(/\/login/);
  });

  test('Truy cập / khi chưa đăng nhập → redirect về /login', async ({ page }) => {
    await page.context().clearCookies();

    await page.goto('/');
    await page.waitForURL('**/login**', { timeout: 10_000 });

    await expect(page).toHaveURL(/\/login/);
  });

  test('Session còn hạn — refresh trang vẫn giữ đăng nhập', async ({ page }) => {
    await loginAsAdmin(page);

    // Reload trang
    await page.reload();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'sau-reload', 'session-persist');

    // Không bị redirect về login
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.getByRole('link', { name: 'Trang chủ' })).toBeVisible();
  });
});
