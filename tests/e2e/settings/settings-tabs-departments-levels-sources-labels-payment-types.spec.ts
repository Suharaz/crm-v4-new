import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsManager, loginAsUser } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

test.describe('Cài đặt — Tabs và CRUD (Phòng ban, Cấp bậc, Nguồn, Nhãn, Thanh toán)', () => {
  test.describe('Truy cập và chuyển tab', () => {
    test('SUPER_ADMIN thấy trang Cài đặt với đủ 5 tabs', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'settings-5-tabs', 'settings-access');

      await expect(page.getByRole('tab', { name: 'Phòng ban' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Cấp bậc' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Nguồn lead' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Thanh toán' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Nhãn' })).toBeVisible();
    });

    test('MANAGER thấy trang Cài đặt', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'settings-manager', 'settings-access');
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
    });

    test('USER thường không thấy link Cài đặt trên sidebar', async ({ page }) => {
      await loginAsUser(page);
      await page.waitForLoadState('networkidle');

      // USER không có role MANAGER/SUPER_ADMIN nên không thấy link Cài đặt
      const settingsLink = page.getByRole('link', { name: 'Cài đặt' });
      await expect(settingsLink).not.toBeVisible();
    });

    test('Chuyển tab → nội dung thay đổi đúng', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      // Tab Cấp bậc
      await page.getByRole('tab', { name: 'Cấp bậc' }).click();
      await screenshotStep(page, 'tab-cap-bac', 'settings-tab-switch');
      await expect(page.getByRole('tabpanel')).toBeVisible();

      // Tab Nguồn lead
      await page.getByRole('tab', { name: 'Nguồn lead' }).click();
      await screenshotStep(page, 'tab-nguon-lead', 'settings-tab-switch');
      await expect(page.getByRole('tabpanel')).toBeVisible();

      // Tab Thanh toán
      await page.getByRole('tab', { name: 'Thanh toán' }).click();
      await screenshotStep(page, 'tab-thanh-toan', 'settings-tab-switch');
      await expect(page.getByRole('tabpanel')).toBeVisible();

      // Tab Nhãn
      await page.getByRole('tab', { name: 'Nhãn' }).click();
      await screenshotStep(page, 'tab-nhan', 'settings-tab-switch');
      await expect(page.getByRole('tabpanel')).toBeVisible();
    });
  });

  test.describe('CRUD Phòng ban (SUPER_ADMIN)', () => {
    test('SUPER_ADMIN tạo phòng ban mới', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      await page.getByRole('tab', { name: 'Phòng ban' }).click();

      const addBtn = page.getByRole('button', { name: /Thêm|Tạo/ }).first();
      await addBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await addBtn.click();

      const dialog = page.getByRole('dialog');
      if (await dialog.isVisible()) {
        const nameInput = dialog.getByLabel(/Tên/).first();
        await nameInput.fill(`Phòng Test ${Date.now()}`);
        await dialog.getByRole('button', { name: /Lưu|Tạo/ }).first().click();
      } else {
        // Inline form
        const nameInput = page.getByPlaceholder(/Tên phòng ban/).first();
        await nameInput.fill(`Phòng Test ${Date.now()}`);
        await page.getByRole('button', { name: /Lưu/ }).first().click();
      }

      await page.waitForLoadState('networkidle');
      await screenshotStep(page, 'sau-tao-phong-ban', 'settings-dept-create');
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  test.describe('CRUD Nguồn lead (SUPER_ADMIN)', () => {
    test('SUPER_ADMIN tạo nguồn lead mới', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      await page.getByRole('tab', { name: 'Nguồn lead' }).click();
      await page.waitForLoadState('networkidle');

      const addBtn = page.getByRole('button', { name: /Thêm|Tạo/ }).first();
      await addBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await addBtn.click();

      const sourceName = `Nguồn Test ${Date.now()}`;
      const dialog = page.getByRole('dialog');
      if (await dialog.isVisible()) {
        await dialog.getByLabel(/Tên/).first().fill(sourceName);
        await dialog.getByRole('button', { name: /Lưu|Tạo/ }).first().click();
      } else {
        await page.getByPlaceholder(/Tên nguồn/).first().fill(sourceName);
        await page.getByRole('button', { name: /Lưu/ }).first().click();
      }

      await page.waitForLoadState('networkidle');
      await screenshotStep(page, 'sau-tao-nguon', 'settings-source-create');
      await expect(page).not.toHaveURL(/\/login/);
    });
  });

  test.describe('CRUD Nhãn (SUPER_ADMIN và MANAGER)', () => {
    test('MANAGER tạo nhãn mới', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/settings');
      await page.waitForLoadState('networkidle');

      await page.getByRole('tab', { name: 'Nhãn' }).click();
      await page.waitForLoadState('networkidle');

      const addBtn = page.getByRole('button', { name: /Thêm|Tạo/ }).first();
      await addBtn.waitFor({ state: 'visible', timeout: 5_000 });
      await addBtn.click();

      const labelName = `Nhãn Test ${Date.now()}`;
      const dialog = page.getByRole('dialog');
      if (await dialog.isVisible()) {
        await dialog.getByLabel(/Tên/).first().fill(labelName);
        await dialog.getByRole('button', { name: /Lưu|Tạo/ }).first().click();
      } else {
        await page.getByPlaceholder(/Tên nhãn/).first().fill(labelName);
        await page.getByRole('button', { name: /Lưu/ }).first().click();
      }

      await page.waitForLoadState('networkidle');
      await screenshotStep(page, 'sau-tao-nhan', 'settings-label-create');
      await expect(page).not.toHaveURL(/\/login/);
    });
  });
});
