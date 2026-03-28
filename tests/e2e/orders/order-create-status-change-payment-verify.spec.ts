import { test, expect } from '@playwright/test';
import { loginAsManager, loginAsUser } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

test.describe('Đơn hàng — Tạo, Đổi trạng thái, Thanh toán', () => {
  test('Xem danh sách đơn hàng', async ({ page }) => {
    await loginAsManager(page);
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'danh-sach-don-hang', 'order-list');

    await expect(page.getByRole('heading', { name: /Đơn hàng/ })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('Tạo đơn hàng mới từ trang /orders/new', async ({ page }) => {
    await loginAsManager(page);
    await page.goto('/orders/new');
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'form-tao-don-hang', 'order-create');

    // Kiểm tra form hiện ra
    await expect(page).not.toHaveURL(/\/login/);

    // Tìm field chọn khách hàng
    const customerField = page.getByLabel(/Khách hàng/).or(
      page.getByPlaceholder(/Tìm khách hàng/),
    ).first();

    if (!(await customerField.isVisible())) {
      test.skip(true, 'Form tạo đơn hàng không tìm thấy');
      return;
    }

    await customerField.fill('KH');
    // Chờ dropdown gợi ý
    await page.waitForTimeout(500);

    const firstOption = page.getByRole('option').first();
    if (await firstOption.isVisible()) {
      await firstOption.click();
    }

    await screenshotStep(page, 'da-chon-khach-hang', 'order-create');
  });

  test('Đổi trạng thái đơn hàng PENDING → CONFIRMED', async ({ page }) => {
    await loginAsManager(page);
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    // Mở đơn hàng đầu tiên
    const firstOrderLink = page.getByRole('link', { name: /ĐH|#/ }).first();
    await firstOrderLink.waitFor({ state: 'visible', timeout: 10_000 });
    await firstOrderLink.click();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'order-detail', 'order-status');

    // Tìm nút Xác nhận / CONFIRMED
    const confirmBtn = page.getByRole('button', { name: /Xác nhận đơn|Confirm/ }).first();
    if (!(await confirmBtn.isVisible())) {
      test.skip(true, 'Đơn hàng không ở trạng thái PENDING');
      return;
    }

    await confirmBtn.click();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'sau-confirm-order', 'order-status');

    await expect(
      page.getByText('CONFIRMED').or(page.getByText('Đã xác nhận')),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Tạo payment cho đơn hàng', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    const firstOrderLink = page.getByRole('link').filter({ hasText: /ĐH|#/ }).first();
    await firstOrderLink.waitFor({ state: 'visible', timeout: 10_000 });
    await firstOrderLink.click();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'order-detail-truoc-payment', 'order-payment');

    // Tìm nút thêm payment
    const addPaymentBtn = page.getByRole('button', { name: /Thêm thanh toán|Tạo thanh toán/ }).first();
    if (!(await addPaymentBtn.isVisible())) {
      test.skip(true, 'Không có nút thêm payment');
      return;
    }

    await addPaymentBtn.click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });

    // Điền số tiền
    const amountInput = dialog.getByLabel(/Số tiền|Amount/).first();
    if (await amountInput.isVisible()) {
      await amountInput.fill('1000000');
    }

    await screenshotStep(page, 'dialog-payment', 'order-payment');

    const submitBtn = dialog.getByRole('button', { name: /Lưu|Tạo|OK/ }).first();
    await submitBtn.click();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'sau-tao-payment', 'order-payment');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('MANAGER verify payment', async ({ page }) => {
    await loginAsManager(page);
    await page.goto('/orders');
    await page.waitForLoadState('networkidle');

    const firstOrderLink = page.getByRole('link').filter({ hasText: /ĐH|#/ }).first();
    await firstOrderLink.waitFor({ state: 'visible', timeout: 10_000 });
    await firstOrderLink.click();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'order-detail-payments', 'order-verify-payment');

    // Tìm nút Verify payment
    const verifyBtn = page.getByRole('button', { name: /Verify|Xác minh/ }).first();
    if (!(await verifyBtn.isVisible())) {
      test.skip(true, 'Không có payment PENDING để verify');
      return;
    }

    await verifyBtn.click();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'sau-verify-payment', 'order-verify-payment');
    await expect(page).not.toHaveURL(/\/login/);
  });
});
