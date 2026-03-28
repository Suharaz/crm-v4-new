import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsManager } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

test.describe('Lead — CRUD và chuyển trạng thái', () => {
  test('MANAGER tạo lead mới → hiện trong danh sách', async ({ page }) => {
    await loginAsManager(page);
    await page.goto('/leads/new');
    await page.waitForLoadState('networkidle');

    const timestamp = Date.now();
    const testName = `Test Lead ${timestamp}`;
    const testPhone = `09${timestamp.toString().slice(-8)}`;

    await page.getByLabel('Số điện thoại').fill(testPhone);
    await page.getByLabel('Họ tên').fill(testName);

    await screenshotStep(page, 'form-da-dien', 'lead-create');
    await page.getByRole('button', { name: 'Tạo lead' }).click();

    // Sau khi tạo thành công → redirect về /leads
    await page.waitForURL('**/leads', { timeout: 15_000 });
    await screenshotStep(page, 'danh-sach-leads', 'lead-create');

    // Lead mới phải xuất hiện trong bảng
    await expect(page.getByRole('link', { name: testName })).toBeVisible();
  });

  test('Edit lead → dữ liệu được cập nhật', async ({ page }) => {
    await loginAsManager(page);

    // Tạo lead trước qua API rồi mở trang edit
    await page.goto('/leads');
    await page.waitForLoadState('networkidle');

    // Lấy link lead đầu tiên trong bảng
    const firstLeadLink = page.getByRole('link', { name: /Test Lead/ }).first();
    await firstLeadLink.waitFor({ state: 'visible', timeout: 10_000 });

    const href = await firstLeadLink.getAttribute('href');
    if (!href) {
      test.skip(true, 'Không có lead test trong danh sách');
      return;
    }

    await page.goto(`${href}/edit`);
    await page.waitForLoadState('networkidle');

    const updatedName = `Updated Lead ${Date.now()}`;
    await page.getByLabel('Họ tên').clear();
    await page.getByLabel('Họ tên').fill(updatedName);

    await screenshotStep(page, 'form-edit', 'lead-edit');
    await page.getByRole('button', { name: 'Lưu' }).click();

    await page.waitForLoadState('networkidle');
    await screenshotStep(page, 'sau-edit', 'lead-edit');

    // Tên mới xuất hiện trên trang
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10_000 });
  });

  test('SUPER_ADMIN xóa lead → biến mất khỏi danh sách', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/leads');
    await page.waitForLoadState('networkidle');

    // Lấy tên lead đầu tiên để kiểm tra sau khi xóa
    const firstLeadLink = page.getByRole('link', { name: /Test Lead/ }).first();
    await firstLeadLink.waitFor({ state: 'visible', timeout: 10_000 });
    const leadName = await firstLeadLink.textContent();

    // Mở trang detail của lead
    await firstLeadLink.click();
    await page.waitForLoadState('networkidle');

    // Tìm nút xóa
    const deleteButton = page.getByRole('button', { name: /Xóa/ }).first();
    await deleteButton.waitFor({ state: 'visible', timeout: 5_000 });
    await screenshotStep(page, 'truoc-xoa', 'lead-delete');
    await deleteButton.click();

    // Xác nhận dialog
    const confirmButton = page.getByRole('button', { name: /Xác nhận|Đồng ý|OK/ }).first();
    await confirmButton.waitFor({ state: 'visible', timeout: 5_000 });
    await confirmButton.click();

    // Redirect về danh sách
    await page.waitForURL('**/leads', { timeout: 15_000 });
    await screenshotStep(page, 'sau-xoa', 'lead-delete');

    // Lead không còn trong danh sách
    if (leadName) {
      await expect(page.getByRole('link', { name: leadName })).not.toBeVisible();
    }
  });

  test('Convert lead → trạng thái CONVERTED hiện trong detail', async ({ page }) => {
    await loginAsManager(page);
    await page.goto('/leads');
    await page.waitForLoadState('networkidle');

    // Mở lead đang ở trạng thái ASSIGNED hoặc IN_PROGRESS
    const leadLink = page.getByRole('link', { name: /Lead/ }).first();
    await leadLink.waitFor({ state: 'visible', timeout: 10_000 });
    await leadLink.click();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'lead-detail', 'lead-convert');

    // Tìm nút Convert
    const convertButton = page.getByRole('button', { name: /Convert|Chuyển đổi/ }).first();
    if (!(await convertButton.isVisible())) {
      test.skip(true, 'Lead không ở trạng thái có thể convert');
      return;
    }

    await convertButton.click();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'sau-convert', 'lead-convert');

    // Badge CONVERTED hoặc text chuyển đổi phải hiện
    await expect(
      page.getByText('CONVERTED').or(page.getByText('Đã chuyển đổi')),
    ).toBeVisible({ timeout: 10_000 });
  });
});
