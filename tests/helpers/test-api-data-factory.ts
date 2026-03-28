/**
 * Test data factory — tạo dữ liệu test qua API trực tiếp.
 * Login để lấy JWT token, sau đó dùng token để tạo các entity.
 */

const API_BASE = 'http://localhost:3010/api/v1';

interface AuthTokens {
  accessToken?: string;
  cookieHeader?: string;
}

/**
 * Login qua API, trả về cookie header để dùng trong các request tiếp theo.
 */
export async function apiLogin(
  email: string,
  password: string,
): Promise<AuthTokens> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
    redirect: 'manual',
  });

  if (!res.ok && res.status !== 302) {
    throw new Error(`Login failed: ${res.status}`);
  }

  // Lấy Set-Cookie header để dùng trong các request tiếp theo
  const setCookie = res.headers.get('set-cookie') || '';
  return { cookieHeader: setCookie };
}

/**
 * Lấy cookie header từ admin account (SUPER_ADMIN).
 */
async function getAdminCookies(): Promise<string> {
  const tokens = await apiLogin('admin@crm.vn', 'Admin@123');
  return tokens.cookieHeader || '';
}

/**
 * Helper gọi API với cookie auth.
 */
async function apiCall<T>(
  method: string,
  endpoint: string,
  body?: unknown,
  cookieHeader?: string,
): Promise<T> {
  const cookies = cookieHeader || (await getAdminCookies());
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookies,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
    throw new Error(err.message || `API call failed: ${res.status}`);
  }

  return res.json();
}

/** Tạo lead test. Trả về lead object. */
export async function createTestLead(
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const timestamp = Date.now();
  const body = {
    name: `Test Lead ${timestamp}`,
    phone: `09${timestamp.toString().slice(-8)}`,
    email: `testlead${timestamp}@test.com`,
    ...overrides,
  };
  const res = await apiCall<{ data: any }>('POST', '/leads', body);
  return res.data ?? res;
}

/** Tạo customer test. Trả về customer object. */
export async function createTestCustomer(
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const timestamp = Date.now();
  const body = {
    name: `Test Customer ${timestamp}`,
    phone: `08${timestamp.toString().slice(-8)}`,
    email: `testcustomer${timestamp}@test.com`,
    ...overrides,
  };
  const res = await apiCall<{ data: any }>('POST', '/customers', body);
  return res.data ?? res;
}

/** Tạo product test. Trả về product object. */
export async function createTestProduct(
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const timestamp = Date.now();
  const body = {
    name: `Test Product ${timestamp}`,
    price: 1_000_000,
    ...overrides,
  };
  const res = await apiCall<{ data: any }>('POST', '/products', body);
  return res.data ?? res;
}

/** Tạo order test từ customer. Trả về order object. */
export async function createTestOrder(
  customerId: string,
  productId: string,
  overrides: Record<string, unknown> = {},
): Promise<any> {
  const body = {
    customerId,
    items: [{ productId, quantity: 1, unitPrice: 1_000_000 }],
    ...overrides,
  };
  const res = await apiCall<{ data: any }>('POST', '/orders', body);
  return res.data ?? res;
}

/** Xóa lead theo id (cleanup sau test). */
export async function deleteTestLead(id: string): Promise<void> {
  await apiCall('DELETE', `/leads/${id}`).catch(() => {
    // Bỏ qua lỗi khi cleanup
  });
}

/** Xóa customer theo id (cleanup sau test). */
export async function deleteTestCustomer(id: string): Promise<void> {
  await apiCall('DELETE', `/customers/${id}`).catch(() => {});
}

/** Xóa product theo id (cleanup sau test). */
export async function deleteTestProduct(id: string): Promise<void> {
  await apiCall('DELETE', `/products/${id}`).catch(() => {});
}
