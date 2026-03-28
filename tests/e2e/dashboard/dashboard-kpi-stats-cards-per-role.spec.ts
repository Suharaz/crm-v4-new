import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsManager, loginAsUser } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

test.describe('Dashboard — KPI Stats Cards theo Role', () => {
  test('SUPER_ADMIN thấy đầy đủ KPI cards', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'dashboard-admin', 'dashboard-kpi');

    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();

    // Các KPI card phải hiển thị
    await expect(page.getByText('Leads mới')).toBeVisible();
    await expect(page.getByText('Đang xử lý')).toBeVisible();
    await expect(page.getByText('Đã chuyển đổi')).toBeVisible();
    await expect(page.getByText('Doanh thu tháng')).toBeVisible();
  });

  test('KPI cards hiển thị số thực (không phải "--")', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'dashboard-kpi-so-thuc', 'dashboard-kpi-values');

    // Ít nhất một card phải có giá trị số (không phải "--")
    // Tìm số bất kỳ trong KPI cards
    const kpiValues = page.locator('.text-2xl, [class*="text-2xl"]');
    const count = await kpiValues.count();
    expect(count).toBeGreaterThan(0);

    // Ít nhất một giá trị không phải "--"
    let hasRealValue = false;
    for (let i = 0; i < count; i++) {
      const text = await kpiValues.nth(i).textContent();
      if (text && text.trim() !== '--') {
        hasRealValue = true;
        break;
      }
    }
    expect(hasRealValue).toBeTruthy();
  });

  test('MANAGER thấy dashboard với KPI cards', async ({ page }) => {
    await loginAsManager(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'dashboard-manager', 'dashboard-kpi-manager');

    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
    await expect(page.getByText('Leads mới')).toBeVisible();
  });

  test('USER (sale) thấy dashboard với KPI cards của mình', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'dashboard-user', 'dashboard-kpi-user');

    await expect(page.getByRole('heading', { name: 'Trang chủ' })).toBeVisible();
    // User thấy ít nhất một KPI card
    await expect(page.locator('.text-2xl, [class*="font-bold"]').first()).toBeVisible();
  });

  test('Dashboard load không có lỗi JavaScript', async ({ page }) => {
    const jsErrors: string[] = [];
    page.on('pageerror', (error) => jsErrors.push(error.message));

    await loginAsAdmin(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'dashboard-no-js-error', 'dashboard-stability');

    // Không có lỗi JS nghiêm trọng
    const criticalErrors = jsErrors.filter(
      (e) => !e.includes('Warning') && !e.includes('hydration'),
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('KPI Tổng đơn hàng và Thanh toán chờ hiển thị đúng', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'dashboard-orders-payments-kpi', 'dashboard-kpi-orders');

    await expect(page.getByText('Tổng đơn hàng').or(page.getByText('Đơn hàng'))).toBeVisible();
    await expect(
      page.getByText('Thanh toán chờ').or(page.getByText('Chờ xác minh')),
    ).toBeVisible();
  });
});
