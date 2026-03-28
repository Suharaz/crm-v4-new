import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsManager, loginAsUser } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

test.describe('Sản phẩm — CRUD qua Dialog, Format giá VND', () => {
  test('Xem danh sách sản phẩm (tất cả role)', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'danh-sach-san-pham', 'product-list');
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('SUPER_ADMIN/MANAGER mở dialog tạo sản phẩm', async ({ page }) => {
    await loginAsManager(page);
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    // Nút Thêm sản phẩm
    const addBtn = page.getByRole('button', { name: /Thêm sản phẩm|Tạo sản phẩm/ }).first();
    await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await screenshotStep(page, 'truoc-mo-dialog', 'product-create');

    await addBtn.click();

    // Dialog mở
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });
    await screenshotStep(page, 'dialog-tao-sp', 'product-create');

    await expect(dialog).toBeVisible();
  });

  test('Tạo sản phẩm mới qua dialog', async ({ page }) => {
    await loginAsManager(page);
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    const addBtn = page.getByRole('button', { name: /Thêm sản phẩm|Tạo sản phẩm/ }).first();
    await addBtn.click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });

    const timestamp = Date.now();
    const productName = `SP Test ${timestamp}`;

    await dialog.getByLabel('Tên sản phẩm').fill(productName);
    await dialog.getByLabel('Giá').fill('2500000');

    await screenshotStep(page, 'form-san-pham', 'product-create-dialog');

    const saveBtn = dialog.getByRole('button', { name: /Lưu|Tạo/ }).first();
    await saveBtn.click();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'sau-tao-sp', 'product-create-dialog');

    // Sản phẩm mới xuất hiện trong danh sách
    await expect(page.getByText(productName)).toBeVisible({ timeout: 10_000 });
  });

  test('Giá sản phẩm hiển thị đúng định dạng VND', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'gia-san-pham', 'product-price-format');

    // Giá phải có ký hiệu ₫ hoặc định dạng VN (dấu chấm ngăn cách)
    const priceText = page.locator('text=/\\d{1,3}(\\.\\d{3})+.*₫|₫.*\\d/').first();
    await expect(priceText).toBeVisible({ timeout: 10_000 });
  });

  test('Edit sản phẩm qua dialog', async ({ page }) => {
    await loginAsManager(page);
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    // Tìm nút edit sản phẩm test
    const editBtn = page.getByRole('button', { name: /Sửa|Edit/ }).first();
    await editBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await editBtn.click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });

    const updatedName = `SP Updated ${Date.now()}`;
    await dialog.getByLabel('Tên sản phẩm').clear();
    await dialog.getByLabel('Tên sản phẩm').fill(updatedName);

    await screenshotStep(page, 'dialog-edit-sp', 'product-edit');

    const saveBtn = dialog.getByRole('button', { name: /Lưu/ }).first();
    await saveBtn.click();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'sau-edit-sp', 'product-edit');
    await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10_000 });
  });

  test('SUPER_ADMIN xóa sản phẩm', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    // Lấy tên sản phẩm sẽ xóa
    const firstProductName = await page.getByText(/SP Test|SP Updated/).first().textContent();

    const deleteBtn = page.getByRole('button', { name: /Xóa/ }).first();
    await deleteBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await screenshotStep(page, 'truoc-xoa-sp', 'product-delete');

    await deleteBtn.click();

    // Confirm dialog
    const confirmBtn = page.getByRole('button', { name: /Xác nhận|OK/ }).first();
    await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await confirmBtn.click();

    await page.waitForLoadState('networkidle');
    await screenshotStep(page, 'sau-xoa-sp', 'product-delete');

    if (firstProductName) {
      await expect(page.getByText(firstProductName)).not.toBeVisible();
    }
  });

  test('USER thường không thấy nút Thêm sản phẩm', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/products');
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'san-pham-user-view', 'product-role-access');

    const addBtn = page.getByRole('button', { name: /Thêm sản phẩm/ });
    await expect(addBtn).not.toBeVisible();
  });
});
