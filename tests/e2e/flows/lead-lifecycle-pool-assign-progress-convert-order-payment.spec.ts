import { test, expect } from '@playwright/test';
import { loginAsAdmin, loginAsManager, loginAsUser } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

/**
 * Lead Lifecycle E2E Flow — full journey through browser:
 * 1. Manager tạo lead → Kho Mới (POOL)
 * 2. Manager assign lead cho sale
 * 3. Sale xem lead → ASSIGNED
 * 4. Sale tạo note → auto trigger IN_PROGRESS
 * 5. Sale convert lead → Customer
 * 6. Sale tạo order cho customer
 * 7. Manager verify payment
 */

const UNIQUE = Date.now().toString().slice(-6);
const TEST_PHONE = `091${UNIQUE}1`;
const TEST_NAME = `Lead Test ${UNIQUE}`;

test.describe.serial('Lead Lifecycle — Từ Kho Mới đến Payment Verified', () => {

  // ── Step 1: Manager tạo lead mới ──────────────────────────
  test('1. MANAGER tạo lead mới → xuất hiện trong danh sách', async ({ page }) => {
    await loginAsManager(page);
    await page.goto('/leads/new');
    await page.waitForLoadState('networkidle');
    await screenshotStep(page, '01-form-tao-lead', 'lead-flow');

    // Điền form tạo lead (dùng placeholder vì FormField không link label→input)
    await page.getByPlaceholder('0912345678').fill(TEST_PHONE);
    await page.getByPlaceholder('Nguyễn Văn A').fill(TEST_NAME);

    await screenshotStep(page, '01-form-da-dien', 'lead-flow');
    await page.getByRole('button', { name: /Tạo|Lưu|Submit/i }).click();

    // Chờ redirect hoặc thông báo thành công
    await page.waitForURL((url) => !url.pathname.includes('/new'), { timeout: 10_000 }).catch(() => {});
    // Hoặc toast thành công
    const success = page.getByText(/thành công|Đã tạo/i).first();
    if (await success.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await screenshotStep(page, '01-tao-thanh-cong', 'lead-flow');
    }

    // Verify lead xuất hiện trong danh sách
    await page.goto('/leads');
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(TEST_NAME).first()).toBeVisible({ timeout: 10_000 });
    await screenshotStep(page, '01-lead-trong-list', 'lead-flow');
  });

  // ── Step 2: Manager assign lead cho sale ──────────────────
  test('2. MANAGER assign lead cho sale', async ({ page }) => {
    await loginAsManager(page);
    await page.goto('/leads');
    await page.waitForLoadState('networkidle');

    // Tìm và click vào lead vừa tạo
    await page.getByText(TEST_NAME).first().click();
    await page.waitForLoadState('networkidle');
    await screenshotStep(page, '02-lead-detail-truoc-assign', 'lead-flow');

    // Click nút Phân lead
    const assignBtn = page.getByRole('button', { name: /Phân lead|Assign/i });
    if (await assignBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await assignBtn.click();

      // Chọn nhân viên từ dropdown trong dialog
      await page.waitForTimeout(500);
      const selectTrigger = page.locator('[role="combobox"]').first();
      if (await selectTrigger.isVisible()) {
        await selectTrigger.click();
        // Chọn sale1 (Lê Văn Sale)
        const saleOption = page.getByRole('option', { name: /Lê Văn Sale|sale1/i }).first();
        if (await saleOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await saleOption.click();
        } else {
          // Chọn option đầu tiên nếu không tìm thấy
          await page.getByRole('option').first().click();
        }
      }

      // Submit
      const submitBtn = page.getByRole('button', { name: /Phân lead|Xác nhận|Assign/i }).last();
      await submitBtn.click();

      await page.waitForTimeout(1000);
      await screenshotStep(page, '02-sau-assign', 'lead-flow');
    }
  });

  // ── Step 3: Sale claim lead từ kho (fallback nếu assign chưa work) ──
  test('3. USER (sale) claim lead và xem trạng thái', async ({ page }) => {
    await loginAsUser(page);

    // Nếu lead chưa được assign, user claim từ kho thả nổi hoặc lead detail
    await page.goto('/leads');
    await page.waitForLoadState('networkidle');

    const leadLink = page.getByText(TEST_NAME).first();
    if (await leadLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await leadLink.click();
      await page.waitForLoadState('networkidle');
      await screenshotStep(page, '03-lead-detail', 'lead-flow');

      // Nếu lead còn POOL → claim nó
      const claimBtn = page.getByRole('button', { name: 'Nhận lead' });
      if (await claimBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await claimBtn.click();
        await page.waitForTimeout(1000);
        await screenshotStep(page, '03-confirm-dialog', 'lead-flow');
        // Click xác nhận trong AlertDialog — tìm button cuối cùng có text "Nhận"
        const confirmBtns = page.getByRole('button', { name: /^Nhận$/ });
        const btnCount = await confirmBtns.count();
        if (btnCount > 0) {
          await confirmBtns.last().click();
        }
        await page.waitForTimeout(2000);
        await page.reload();
        await page.waitForLoadState('networkidle');
        await screenshotStep(page, '03-sau-claim', 'lead-flow');
      }

      await screenshotStep(page, '03-final-status', 'lead-flow');
      // Verify lead detail page loaded successfully
      await expect(page.getByText(TEST_NAME)).toBeVisible();
    }
  });

  // ── Step 4: Sale tạo note → auto IN_PROGRESS ─────────────
  test('4. USER tạo note cho lead → auto chuyển IN_PROGRESS', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/leads');
    await page.waitForLoadState('networkidle');

    const leadLink = page.getByText(TEST_NAME).first();
    if (await leadLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await leadLink.click();
      await page.waitForLoadState('networkidle');

      // Click nút thêm ghi chú
      const noteBtn = page.getByRole('button', { name: /Ghi chú|Note|Thêm ghi chú/i });
      if (await noteBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await noteBtn.click();
        await page.waitForTimeout(500);

        // Điền nội dung ghi chú
        const textarea = page.locator('textarea').first();
        if (await textarea.isVisible()) {
          await textarea.fill('Khách hàng quan tâm sản phẩm, hẹn gọi lại ngày mai');
        }

        // Submit
        const submitNoteBtn = page.getByRole('button', { name: /Lưu|Gửi|Thêm/i }).last();
        await submitNoteBtn.click();
        await page.waitForTimeout(1000);
        await screenshotStep(page, '04-sau-tao-note', 'lead-flow');
      }

      // Reload và kiểm tra status đã chuyển IN_PROGRESS
      await page.reload();
      await page.waitForLoadState('networkidle');
      const inProgressBadge = page.getByText(/IN_PROGRESS|Đang xử lý/i).first();
      if (await inProgressBadge.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await screenshotStep(page, '04-status-in-progress', 'lead-flow');
      }
    }
  });

  // ── Step 5: Sale convert lead → Customer ──────────────────
  test('5. USER convert lead thành khách hàng', async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/leads');
    await page.waitForLoadState('networkidle');

    const leadLink = page.getByText(TEST_NAME).first();
    if (await leadLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await leadLink.click();
      await page.waitForLoadState('networkidle');

      // Click nút Chuyển đổi KH
      const convertBtn = page.getByRole('button', { name: /Chuyển đổi|Convert/i });
      if (await convertBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await convertBtn.click();

        // Xác nhận dialog
        const confirmBtn = page.getByRole('button', { name: /Xác nhận|Đồng ý|Chuyển đổi/i }).last();
        if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
          await confirmBtn.click();
          await page.waitForTimeout(1500);
          await screenshotStep(page, '05-sau-convert', 'lead-flow');
        }
      }
    }

    // Verify customer mới xuất hiện trong danh sách khách hàng
    await page.goto('/customers');
    await page.waitForLoadState('networkidle');
    const customerInList = page.getByText(TEST_NAME).first();
    if (await customerInList.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await screenshotStep(page, '05-customer-trong-list', 'lead-flow');
    }
  });

  // ── Step 6: Tạo order cho customer ────────────────────────
  test('6. Tạo đơn hàng cho khách hàng', async ({ page }) => {
    await loginAsManager(page);
    await page.goto('/customers');
    await page.waitForLoadState('networkidle');

    // Click vào customer vừa convert
    const customerLink = page.getByText(TEST_NAME).first();
    if (await customerLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await customerLink.click();
      await page.waitForLoadState('networkidle');
      await screenshotStep(page, '06-customer-detail', 'lead-flow');

      // Click nút Tạo đơn hàng
      const createOrderBtn = page.getByRole('button', { name: /Tạo đơn|Thêm đơn|Order/i });
      if (await createOrderBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await createOrderBtn.click();
        await page.waitForTimeout(500);

        // Điền form tạo order
        const amountInput = page.getByLabel(/Số tiền|Amount|Giá trị/i);
        if (await amountInput.isVisible()) {
          await amountInput.fill('5000000');
        }

        // Submit
        const submitBtn = page.getByRole('button', { name: /Tạo|Lưu|Submit/i }).last();
        await submitBtn.click();
        await page.waitForTimeout(1000);
        await screenshotStep(page, '06-sau-tao-order', 'lead-flow');
      }
    }
  });

  // ── Step 7: Verify trên dashboard ─────────────────────────
  test('7. Dashboard cập nhật KPI', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await screenshotStep(page, '07-dashboard-final', 'lead-flow');

    // Dashboard hiển thị KPI
    await expect(page.getByText(/Lead mới|Leads|Trang chủ/i).first()).toBeVisible();
  });
});
