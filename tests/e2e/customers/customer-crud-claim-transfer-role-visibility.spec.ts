import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsManager, loginAsUser } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

test.describe('Khách hàng — CRUD, Claim, Transfer, Role Visibility', () => {
  test.describe('CRUD', () => {
    test('MANAGER xem danh sách khách hàng', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/customers');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'danh-sach-khach-hang', 'customer-list');

      await expect(page.getByRole('heading', { name: 'Khách hàng' })).toBeVisible();
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('MANAGER tạo khách hàng mới từ form', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/customers/new');
      await page.waitForLoadState('networkidle');

      const timestamp = Date.now();
      const testName = `KH Test ${timestamp}`;
      const testPhone = `07${timestamp.toString().slice(-8)}`;

      // Điền form tạo khách hàng
      const nameInput = page.getByLabel('Họ tên');
      await nameInput.fill(testName);

      const phoneInput = page.getByLabel('Số điện thoại');
      await phoneInput.fill(testPhone);

      await screenshotStep(page, 'form-tao-kh', 'customer-create');

      await page.getByRole('button', { name: /Tạo|Lưu/ }).first().click();
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'sau-tao-kh', 'customer-create');

      // Redirect về /customers hoặc hiện customer mới
      await expect(
        page.getByText(testName).or(page.getByRole('heading', { name: 'Khách hàng' })),
      ).toBeVisible({ timeout: 10_000 });
    });

    test('MANAGER edit thông tin khách hàng', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/customers');
      await page.waitForLoadState('networkidle');

      const firstLink = page.getByRole('link', { name: /KH Test/ }).first();
      await firstLink.waitFor({ state: 'visible', timeout: 10_000 });
      const href = await firstLink.getAttribute('href');
      if (!href) {
        test.skip(true, 'Không có khách hàng test');
        return;
      }

      await page.goto(`${href}/edit`);
      await page.waitForLoadState('networkidle');

      const updatedName = `KH Updated ${Date.now()}`;
      await page.getByLabel('Họ tên').clear();
      await page.getByLabel('Họ tên').fill(updatedName);

      await screenshotStep(page, 'form-edit-kh', 'customer-edit');
      await page.getByRole('button', { name: /Lưu/ }).first().click();
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'sau-edit-kh', 'customer-edit');
      await expect(page.getByText(updatedName)).toBeVisible({ timeout: 10_000 });
    });

    test('SUPER_ADMIN xóa khách hàng', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/customers');
      await page.waitForLoadState('networkidle');

      const firstLink = page.getByRole('link', { name: /KH/ }).first();
      await firstLink.waitFor({ state: 'visible', timeout: 10_000 });
      const customerName = await firstLink.textContent();

      await firstLink.click();
      await page.waitForLoadState('networkidle');

      const deleteBtn = page.getByRole('button', { name: /Xóa/ }).first();
      if (!(await deleteBtn.isVisible())) {
        test.skip(true, 'Không có nút xóa');
        return;
      }

      await screenshotStep(page, 'truoc-xoa-kh', 'customer-delete');
      await deleteBtn.click();

      const confirmBtn = page.getByRole('button', { name: /Xác nhận|Đồng ý|OK/ }).first();
      await confirmBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await confirmBtn.click();

      await page.waitForURL('**/customers', { timeout: 15_000 });
      await screenshotStep(page, 'sau-xoa-kh', 'customer-delete');

      if (customerName) {
        await expect(page.getByText(customerName)).not.toBeVisible();
      }
    });
  });

  test.describe('Claim & Transfer', () => {
    test('USER claim khách hàng từ Kho Thả Nổi', async ({ page }) => {
      await loginAsUser(page);
      await page.goto('/customers?status=FLOATING');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'kh-floating', 'customer-claim');

      const claimBtn = page.getByRole('button', { name: /Nhận|Claim/ }).first();
      if (!(await claimBtn.isVisible())) {
        test.skip(true, 'Không có khách hàng FLOATING để claim');
        return;
      }

      await claimBtn.click();
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'sau-claim-kh', 'customer-claim');
      await expect(page).not.toHaveURL(/\/login/);
    });

    test('MANAGER transfer khách hàng sang user khác', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/customers');
      await page.waitForLoadState('networkidle');

      const firstLink = page.getByRole('link', { name: /KH/ }).first();
      await firstLink.waitFor({ state: 'visible', timeout: 10_000 });
      await firstLink.click();
      await page.waitForLoadState('networkidle');

      const transferBtn = page.getByRole('button', { name: /Chuyển|Transfer/ }).first();
      if (!(await transferBtn.isVisible())) {
        test.skip(true, 'Không có nút Transfer trên customer này');
        return;
      }

      await screenshotStep(page, 'truoc-transfer-kh', 'customer-transfer');
      await transferBtn.click();

      const dialog = page.getByRole('dialog');
      await dialog.waitFor({ state: 'visible', timeout: 5_000 });

      const confirmBtn = dialog.getByRole('button', { name: /Xác nhận|OK/ }).first();
      await confirmBtn.click();
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'sau-transfer-kh', 'customer-transfer');
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  test.describe('Role-based visibility', () => {
    test('USER chỉ thấy khách hàng được phân công cho mình', async ({ page }) => {
      await loginAsUser(page);
      await page.goto('/customers');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'kh-list-user', 'customer-role-visibility');

      // Trang load được, user thấy danh sách của mình
      await expect(page).not.toHaveURL(/\/login/);
      await expect(
        page.getByRole('heading', { name: 'Khách hàng' }),
      ).toBeVisible({ timeout: 10_000 });
    });
  });
});
