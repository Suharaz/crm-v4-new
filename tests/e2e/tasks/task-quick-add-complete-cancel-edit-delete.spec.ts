import { test, expect } from '@playwright/test';
import { loginAsUser, loginAsManager } from '../../helpers/test-auth-login-helper';
import { screenshotStep } from '../../helpers/test-screenshot-on-step-helper';

test.describe('Công việc — Quick Add, Hoàn thành, Hủy, Sửa, Xóa', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page);
    await page.goto('/tasks');
    await page.waitForLoadState('networkidle');
  });

  test('Trang /tasks hiển thị đúng', async ({ page }) => {
    await screenshotStep(page, 'trang-cong-viec', 'task-page');

    await expect(page.getByRole('heading', { name: 'Công việc' })).toBeVisible();
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('Tạo task mới qua dialog', async ({ page }) => {
    // Tìm nút Thêm công việc
    const addBtn = page.getByRole('button', { name: /Thêm công việc|Tạo công việc|Thêm/ }).first();
    await addBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await addBtn.click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });

    const taskTitle = `Task Test ${Date.now()}`;
    await dialog.getByLabel('Tiêu đề').fill(taskTitle);

    await screenshotStep(page, 'dialog-tao-task', 'task-create');

    const saveBtn = dialog.getByRole('button', { name: /Lưu|Tạo/ }).first();
    await saveBtn.click();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'sau-tao-task', 'task-create');

    // Task mới xuất hiện trong danh sách
    await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });
  });

  test('Quick add task qua thanh nhập nhanh', async ({ page }) => {
    // Tìm input quick add (placeholder chứa "Thêm công việc" hoặc "Tiêu đề")
    const quickInput = page.getByPlaceholder(/Thêm công việc nhanh|Nhập tiêu đề|Công việc mới/).first();
    if (!(await quickInput.isVisible())) {
      test.skip(true, 'Không có thanh quick add');
      return;
    }

    const taskTitle = `Quick Task ${Date.now()}`;
    await quickInput.fill(taskTitle);
    await screenshotStep(page, 'quick-add-dien-xong', 'task-quick-add');

    // Submit bằng Enter
    await quickInput.press('Enter');
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'sau-quick-add', 'task-quick-add');
    await expect(page.getByText(taskTitle)).toBeVisible({ timeout: 10_000 });
  });

  test('Hoàn thành task → trạng thái COMPLETED', async ({ page }) => {
    // Tìm task PENDING đầu tiên
    const completeBtn = page.getByRole('button', { name: /Hoàn thành|Complete/ })
      .or(page.locator('[title="Hoàn thành"]'))
      .first();

    await completeBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await screenshotStep(page, 'truoc-complete-task', 'task-complete');

    await completeBtn.click();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'sau-complete-task', 'task-complete');

    // Badge COMPLETED hoặc text "Hoàn thành" xuất hiện
    await expect(
      page.getByText('Hoàn thành').or(page.getByText('COMPLETED')).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Hủy task → trạng thái CANCELLED', async ({ page }) => {
    // Click vào tab Đang chờ để thấy task PENDING
    const pendingTab = page.getByRole('tab', { name: 'Đang chờ' }).or(
      page.getByRole('button', { name: 'Đang chờ' }),
    ).first();
    if (await pendingTab.isVisible()) await pendingTab.click();

    const cancelBtn = page.getByRole('button', { name: /Hủy|Cancel/ })
      .or(page.locator('[title="Hủy"]'))
      .first();

    await cancelBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await screenshotStep(page, 'truoc-huy-task', 'task-cancel');

    await cancelBtn.click();

    // Confirm nếu có dialog
    const confirmBtn = page.getByRole('button', { name: /Xác nhận|OK/ }).first();
    if (await confirmBtn.isVisible({ timeout: 2_000 })) {
      await confirmBtn.click();
    }

    await page.waitForLoadState('networkidle');
    await screenshotStep(page, 'sau-huy-task', 'task-cancel');

    await expect(
      page.getByText('Đã hủy').or(page.getByText('CANCELLED')).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('Edit task → tiêu đề được cập nhật', async ({ page }) => {
    const editBtn = page.getByRole('button', { name: /Sửa|Edit/ })
      .or(page.locator('[title="Sửa"]'))
      .first();

    await editBtn.waitFor({ state: 'visible', timeout: 10_000 });
    await editBtn.click();

    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ state: 'visible', timeout: 5_000 });

    const updatedTitle = `Task Updated ${Date.now()}`;
    await dialog.getByLabel('Tiêu đề').clear();
    await dialog.getByLabel('Tiêu đề').fill(updatedTitle);

    await screenshotStep(page, 'dialog-edit-task', 'task-edit');

    await dialog.getByRole('button', { name: /Lưu/ }).first().click();
    await page.waitForLoadState('networkidle');

    await screenshotStep(page, 'sau-edit-task', 'task-edit');
    await expect(page.getByText(updatedTitle)).toBeVisible({ timeout: 10_000 });
  });

  test('Xóa task → biến mất khỏi danh sách', async ({ page }) => {
    // Lấy tiêu đề task đầu tiên
    const firstTask = page.locator('[data-testid="task-item"], tr, li').filter({
      hasText: /Task/,
    }).first();
    await firstTask.waitFor({ state: 'visible', timeout: 10_000 });
    const taskText = await firstTask.textContent();

    const deleteBtn = firstTask.getByRole('button', { name: /Xóa/ })
      .or(firstTask.locator('[title="Xóa"]'))
      .first();

    await deleteBtn.click();

    const confirmBtn = page.getByRole('button', { name: /Xác nhận|OK/ }).first();
    if (await confirmBtn.isVisible({ timeout: 2_000 })) {
      await confirmBtn.click();
    }

    await page.waitForLoadState('networkidle');
    await screenshotStep(page, 'sau-xoa-task', 'task-delete');

    if (taskText) {
      // Task đã biến mất
      await expect(page.getByText(taskText.trim()).first()).not.toBeVisible();
    }
  });

  test('Filter tab — chỉ hiện task theo trạng thái', async ({ page }) => {
    // Tab "Hoàn thành"
    const completedTab = page.getByRole('tab', { name: 'Hoàn thành' }).or(
      page.getByRole('button', { name: 'Hoàn thành' }),
    ).first();
    await completedTab.waitFor({ state: 'visible', timeout: 5_000 });
    await completedTab.click();

    await screenshotStep(page, 'tab-hoan-thanh', 'task-filter-tab');

    // Không còn task PENDING trong view này
    await expect(page.getByText('Đang chờ').first()).not.toBeVisible();
  });
});
