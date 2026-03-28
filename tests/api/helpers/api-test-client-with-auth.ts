/**
 * HTTP test client helper wrapping fetch with JWT auth for API integration tests.
 * Provides role-based login shortcuts and authenticated request methods.
 */

const BASE_URL = 'http://localhost:3010/api/v1';

// Seed accounts (từ packages/database/prisma/seed.ts)
const SEED_ACCOUNTS = {
  admin: { email: 'admin@crm.local', password: 'changeme' },
  manager: { email: 'manager.sales@crm.local', password: 'changeme' },
  user: { email: 'sale1@crm.local', password: 'changeme' },
};

interface LoginResponse {
  data: {
    accessToken: string;
    refreshToken: string;
  };
}

interface RequestOptions {
  body?: unknown;
  headers?: Record<string, string>;
  isFormData?: boolean;
}

export class ApiTestClient {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  /** Đăng nhập và lưu token */
  async login(email: string, password: string): Promise<LoginResponse> {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const json = (await res.json()) as LoginResponse;
    if (res.ok && json.data?.accessToken) {
      this.accessToken = json.data.accessToken;
      this.refreshToken = json.data.refreshToken;
    }
    return json;
  }

  /** Login với tài khoản SUPER_ADMIN từ seed */
  async asAdmin(): Promise<this> {
    await this.login(SEED_ACCOUNTS.admin.email, SEED_ACCOUNTS.admin.password);
    return this;
  }

  /** Login với tài khoản MANAGER từ seed */
  async asManager(): Promise<this> {
    await this.login(SEED_ACCOUNTS.manager.email, SEED_ACCOUNTS.manager.password);
    return this;
  }

  /** Login với tài khoản USER từ seed */
  async asUser(): Promise<this> {
    await this.login(SEED_ACCOUNTS.user.email, SEED_ACCOUNTS.user.password);
    return this;
  }

  /** Xóa token hiện tại (unauthenticated requests) */
  clearAuth(): this {
    this.accessToken = null;
    this.refreshToken = null;
    return this;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  private buildHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    return headers;
  }

  async get(path: string, opts?: RequestOptions): Promise<Response> {
    return fetch(`${BASE_URL}${path}`, {
      method: 'GET',
      headers: this.buildHeaders(opts?.headers),
    });
  }

  async post(path: string, opts?: RequestOptions): Promise<Response> {
    const isFormData = opts?.isFormData ?? false;
    const headers = this.buildHeaders(opts?.headers);
    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }
    return fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: isFormData
        ? (opts?.body as FormData)
        : opts?.body !== undefined
          ? JSON.stringify(opts.body)
          : undefined,
    });
  }

  async patch(path: string, opts?: RequestOptions): Promise<Response> {
    return fetch(`${BASE_URL}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...this.buildHeaders(opts?.headers) },
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  }

  async delete(path: string, opts?: RequestOptions): Promise<Response> {
    return fetch(`${BASE_URL}${path}`, {
      method: 'DELETE',
      headers: this.buildHeaders(opts?.headers),
    });
  }

  /** Gọi GET và parse JSON tiện lợi */
  async getJson<T = unknown>(path: string): Promise<{ status: number; body: T }> {
    const res = await this.get(path);
    const body = (await res.json()) as T;
    return { status: res.status, body };
  }

  /** Gọi POST và parse JSON tiện lợi */
  async postJson<T = unknown>(path: string, data?: unknown): Promise<{ status: number; body: T }> {
    const res = await this.post(path, { body: data });
    const body = (await res.json()) as T;
    return { status: res.status, body };
  }

  /** Gọi PATCH và parse JSON tiện lợi */
  async patchJson<T = unknown>(path: string, data?: unknown): Promise<{ status: number; body: T }> {
    const res = await this.patch(path, { body: data });
    const body = (await res.json()) as T;
    return { status: res.status, body };
  }

  /** Gọi DELETE và parse JSON tiện lợi */
  async deleteJson<T = unknown>(path: string): Promise<{ status: number; body: T }> {
    const res = await this.delete(path);
    const body = (await res.json()) as T;
    return { status: res.status, body };
  }
}

/** Factory: tạo client đã đăng nhập sẵn theo role */
export async function adminClient(): Promise<ApiTestClient> {
  return new ApiTestClient().asAdmin();
}

export async function managerClient(): Promise<ApiTestClient> {
  return new ApiTestClient().asManager();
}

export async function userClient(): Promise<ApiTestClient> {
  return new ApiTestClient().asUser();
}

/** Client chưa đăng nhập */
export function anonClient(): ApiTestClient {
  return new ApiTestClient();
}
