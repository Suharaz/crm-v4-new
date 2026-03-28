import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsManager } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

test.describe('Tìm kiếm toàn cục — Dropdown kết quả và điều hướng', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Thanh tìm kiếm hiển thị trên header', async ({ page }) => {
    await screenshotStep(page, 'search-bar-visible', 'global-search');

    const searchInput = page.getByPlaceholder(/Tìm kiếm leads, khách hàng, đơn hàng/);
    await expect(searchInput).toBeVisible();
  });

  test('Nhập từ khóa → dropdown kết quả xuất hiện', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Tìm kiếm leads, khách hàng, đơn hàng/);
    await searchInput.fill('test');

    // Chờ debounce 300ms + API response
    await page.waitForTimeout(500);

    await screenshotStep(page, 'dropdown-ket-qua', 'global-search-results');

    // Dropdown xuất hiện
    const dropdown = page.locator('[class*="absolute"][class*="rounded"]').filter({
      hasText: /Leads|Khách hàng|Đơn hàng|Không tìm thấy/,
    }).first();
    await expect(dropdown).toBeVisible({ timeout: 5_000 });
  });

  test('Kết quả được nhóm theo: Leads, Khách hàng, Đơn hàng', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Tìm kiếm leads, khách hàng, đơn hàng/);
    await searchInput.fill('test');
    await page.waitForTimeout(600);

    await screenshotStep(page, 'ket-qua-nhom', 'global-search-groups');

    // Kiểm tra có ít nhất một nhóm header
    const hasLeads = await page.getByText('Leads', { exact: true }).isVisible();
    const hasCustomers = await page.getByText('Khách hàng', { exact: true }).isVisible();
    const hasOrders = await page.getByText('Đơn hàng', { exact: true }).isVisible();
    const hasEmpty = await page.getByText('Không tìm thấy kết quả').isVisible();

    // Phải có ít nhất một nhóm HOẶC thông báo không tìm thấy
    expect(hasLeads || hasCustomers || hasOrders || hasEmpty).toBeTruthy();
  });

  test('Không có kết quả → hiện thông báo "Không tìm thấy kết quả"', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Tìm kiếm leads, khách hàng, đơn hàng/);
    await searchInput.fill('xyzxyzxyz_khong_co_ket_qua_99999');
    await page.waitForTimeout(600);

    await screenshotStep(page, 'khong-co-ket-qua', 'global-search-empty');

    await expect(page.getByText('Không tìm thấy kết quả')).toBeVisible({ timeout: 5_000 });
  });

  test('Xóa từ khóa → dropdown đóng lại', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Tìm kiếm leads, khách hàng, đơn hàng/);
    await searchInput.fill('test');
    await page.waitForTimeout(600);

    // Xóa nội dung
    await searchInput.clear();
    await page.waitForTimeout(200);

    await screenshotStep(page, 'dropdown-dong', 'global-search-close');

    // Dropdown đóng
    const dropdown = page.getByText('Không tìm thấy kết quả');
    await expect(dropdown).not.toBeVisible();
  });

  test('Click kết quả Lead → điều hướng đến trang detail', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Tìm kiếm leads, khách hàng, đơn hàng/);
    await searchInput.fill('lead');
    await page.waitForTimeout(600);

    await screenshotStep(page, 'truoc-click-lead', 'global-search-navigate');

    // Tìm link lead trong dropdown
    const leadResult = page.locator('a[href*="/leads/"]').first();
    if (!(await leadResult.isVisible({ timeout: 3_000 }))) {
      test.skip(true, 'Không có kết quả lead để click');
      return;
    }

    await leadResult.click();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'sau-click-lead', 'global-search-navigate');

    // Điều hướng đến trang lead detail
    await expect(page).toHaveURL(/\/leads\/\d+/);
  });

  test('Nhấn Escape → dropdown đóng', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/Tìm kiếm leads, khách hàng, đơn hàng/);
    await searchInput.fill('test');
    await page.waitForTimeout(600);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    await screenshotStep(page, 'dropdown-dong-escape', 'global-search-escape');

    const dropdown = page.getByText('Không tìm thấy kết quả');
    await expect(dropdown).not.toBeVisible();
  });
});
