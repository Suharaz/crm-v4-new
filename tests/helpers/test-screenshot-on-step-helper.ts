import { type Page } from '@playwright/test';
import * as path from 'path';

const SCREENSHOT_DIR = path.join(__dirname, '..', 'test-results', 'screenshots');

/**
 * Chụp screenshot tại một bước quan trọng trong test.
 * Tên file: {testName}-{stepName}-{timestamp}.png
 */
export async function screenshotStep(
  page: Page,
  stepName: string,
  testName = 'step',
): Promise<void> {
  const timestamp = Date.now();
  const safeName = `${testName}-${stepName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${safeName}-${timestamp}.png`),
    fullPage: false,
  });
}

/**
 * Chụp screenshot toàn trang (full page scroll).
 */
export async function screenshotFullPage(
  page: Page,
  stepName: string,
  testName = 'step',
): Promise<void> {
  const timestamp = Date.now();
  const safeName = `${testName}-${stepName}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');

  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, `${safeName}-${timestamp}.png`),
    fullPage: true,
  });
}
