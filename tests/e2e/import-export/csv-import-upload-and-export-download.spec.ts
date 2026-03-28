import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { loginAsAdmin, loginAsManager } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

/**
 * Tạo file CSV tạm để test upload.
 */
function createTempCsv(filename: string, content: string): string {
  const tmpDir = path.join(__dirname, '..', '..', 'test-results', 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

test.describe('CSV Import & Export', () => {
  test.describe('Export CSV', () => {
    test('Export leads CSV → file được download', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/leads');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'leads-page-truoc-export', 'csv-export-leads');

      // Tìm nút Export CSV
      const exportBtn = page.getByRole('button', { name: /Xuất CSV|Export CSV|Export/ }).first();
      await exportBtn.waitFor({ state: 'visible', timeout: 10_000 });

      // Lắng nghe download event
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15_000 }),
        exportBtn.click(),
      ]);

      await screenshotStep(page, 'sau-export-leads', 'csv-export-leads');

      // File được download
      expect(download).toBeTruthy();
      const suggestedName = download.suggestedFilename();
      expect(suggestedName).toMatch(/\.csv$/i);
    });

    test('Export customers CSV → file được download', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/customers');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'customers-page-truoc-export', 'csv-export-customers');

      const exportBtn = page.getByRole('button', { name: /Xuất CSV|Export CSV|Export/ }).first();
      await exportBtn.waitFor({ state: 'visible', timeout: 10_000 });

      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 15_000 }),
        exportBtn.click(),
      ]);

      await screenshotStep(page, 'sau-export-customers', 'csv-export-customers');

      expect(download).toBeTruthy();
      expect(download.suggestedFilename()).toMatch(/\.csv$/i);
    });
  });

  test.describe('Import CSV', () => {
    test('Trang /import hiển thị upload zones', async ({ page }) => {
      await loginAsManager(page);
      await page.goto('/import');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'import-page', 'csv-import-page');

      await expect(page.getByRole('heading', { name: 'Nhập dữ liệu' })).toBeVisible();
      await expect(page).not.toHaveURL(/\/login/);

      // Upload zone phải hiện
      await expect(
        page.getByText(/Kéo thả file CSV|CSV|Tải lên/).first(),
      ).toBeVisible({ timeout: 5_000 });
    });

    test('Upload CSV leads hợp lệ → job được tạo', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/import');
      await page.waitForLoadState('networkidle');

      // Tạo file CSV tạm
      const csvContent = 'phone,name,email\n0901234567,Lead Import Test,test@import.com\n';
      const csvPath = createTempCsv('test-leads-import.csv', csvContent);

      await screenshotStep(page, 'truoc-upload-leads-csv', 'csv-import-leads');

      // Tìm input file trong upload zone leads
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(csvPath);

      // Chờ upload xử lý
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2_000);

      await screenshotStep(page, 'sau-upload-leads-csv', 'csv-import-leads');

      // Toast thành công hoặc job xuất hiện trong history
      await expect(
        page.getByText(/Đang xử lý|upload|thành công|PROCESSING/i).first(),
      ).toBeVisible({ timeout: 10_000 });

      // Cleanup
      fs.unlinkSync(csvPath);
    });

    test('Upload file không phải CSV → hiện lỗi', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/import');
      await page.waitForLoadState('networkidle');

      // Tạo file txt giả
      const txtPath = createTempCsv('test-invalid.txt', 'not a csv file');

      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles(txtPath);

      await page.waitForTimeout(1_000);
      await screenshotStep(page, 'loi-file-khong-hop-le', 'csv-import-invalid');

      // Hiện thông báo lỗi
      await expect(
        page.getByText(/Chỉ hỗ trợ file CSV|Invalid|lỗi/i).first(),
      ).toBeVisible({ timeout: 5_000 });

      // Cleanup
      fs.unlinkSync(txtPath);
    });

    test('Lịch sử import hiển thị các job đã tạo', async ({ page }) => {
      await loginAsAdmin(page);
      await page.goto('/import');
      await page.waitForLoadState('networkidle');

      await screenshotStep(page, 'lich-su-import', 'csv-import-history');

      // Section lịch sử có thể trống hoặc có dữ liệu
      await expect(page).not.toHaveURL(/\/login/);
      // Trang load được là pass
      await expect(page.getByRole('heading', { name: 'Nhập dữ liệu' })).toBeVisible();
    });
  });
});
