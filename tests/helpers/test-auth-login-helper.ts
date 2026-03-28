import { type Page } from '@playwright/test';

/**
 * Test accounts từ seed data.
 */
export const TEST_ACCOUNTS = {
  SUPER_ADMIN: { email: 'admin@crm.vn', password: 'Admin@123', role: 'SUPER_ADMIN' },
  MANAGER: { email: 'manager.sales@crm.vn', password: 'Manager@123', role: 'MANAGER' },
  USER: { email: 'sale1@crm.vn', password: 'Sale@123', role: 'USER' },
} as const;

export type TestRole = keyof typeof TEST_ACCOUNTS;

/**
 * Đăng nhập với role cụ thể.
 * Điều hướng đến /login, điền form, submit, chờ redirect về dashboard.
 */
export async function loginAs(page: Page, role: TestRole): Promise<void> {
  const account = TEST_ACCOUNTS[role];

  await page.goto('/login');
  await page.waitForURL('**/login');

  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu').fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  // Chờ redirect về dashboard sau khi đăng nhập thành công
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
}

/** Shortcut: đăng nhập SUPER_ADMIN */
export async function loginAsAdmin(page: Page): Promise<void> {
  return loginAs(page, 'SUPER_ADMIN');
}

/** Shortcut: đăng nhập MANAGER */
export async function loginAsManager(page: Page): Promise<void> {
  return loginAs(page, 'MANAGER');
}

/** Shortcut: đăng nhập USER (sale) */
export async function loginAsUser(page: Page): Promise<void> {
  return loginAs(page, 'USER');
}

/**
 * Đăng xuất khỏi hệ thống.
 * Click nút LogOut trên header, chờ redirect về /login.
 */
export async function logout(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await page.waitForURL('**/login', { timeout: 10_000 });
}
