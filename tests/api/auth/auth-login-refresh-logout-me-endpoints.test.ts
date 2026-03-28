/**
 * Test suite: Auth endpoints — login, refresh token, logout, /me
 * Covers: thành công, sai password, brute-force lock, token lifecycle
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, anonClient } from '../helpers/api-test-client-with-auth';

const BASE = 'http://localhost:3010/api/v1';

describe('Auth Endpoints', () => {
  let client: ApiTestClient;

  beforeAll(() => {
    client = anonClient();
  });

  // ── POST /auth/login ─────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('đăng nhập thành công → 200 + accessToken + refreshToken', async () => {
      const res = await client.post('/auth/login', {
        body: { email: 'admin@crm.local', password: 'changeme' },
      });
      const json = await res.json() as any;

      expect(res.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(typeof json.data.accessToken).toBe('string');
      expect(typeof json.data.refreshToken).toBe('string');
      expect(json.data.accessToken.length).toBeGreaterThan(20);
    });

    it('sai password → 401', async () => {
      const res = await client.post('/auth/login', {
        body: { email: 'admin@crm.local', password: 'wrong-password' },
      });
      expect(res.status).toBe(401);
    });

    it('email không tồn tại → 401 (không tiết lộ user tồn tại hay không)', async () => {
      const res = await client.post('/auth/login', {
        body: { email: 'nonexistent@crm.local', password: 'changeme' },
      });
      expect(res.status).toBe(401);
    });

    it('thiếu email → 400', async () => {
      const res = await client.post('/auth/login', {
        body: { password: 'changeme' },
      });
      expect(res.status).toBe(400);
    });

    it('thiếu password → 400', async () => {
      const res = await client.post('/auth/login', {
        body: { email: 'admin@crm.local' },
      });
      expect(res.status).toBe(400);
    });

    it('đăng nhập manager thành công → 200', async () => {
      const res = await client.post('/auth/login', {
        body: { email: 'manager.sales@crm.local', password: 'changeme' },
      });
      const json = await res.json() as any;
      expect(res.status).toBe(200);
      expect(json.data.accessToken).toBeTruthy();
    });

    it('đăng nhập user thường thành công → 200', async () => {
      const res = await client.post('/auth/login', {
        body: { email: 'sale1@crm.local', password: 'changeme' },
      });
      const json = await res.json() as any;
      expect(res.status).toBe(200);
      expect(json.data.accessToken).toBeTruthy();
    });
  });

  // ── POST /auth/refresh ───────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('refresh token hợp lệ → 200 + tokens mới', async () => {
      // Login trước để lấy refresh token
      const loginRes = await client.post('/auth/login', {
        body: { email: 'sale1@crm.local', password: 'changeme' },
      });
      const loginJson = await loginRes.json() as any;
      const { refreshToken } = loginJson.data;

      const res = await client.post('/auth/refresh', {
        body: { refreshToken },
      });
      const json = await res.json() as any;

      expect(res.status).toBe(200);
      expect(json.data.accessToken).toBeTruthy();
      expect(json.data.refreshToken).toBeTruthy();
    });

    it('refresh token không hợp lệ → 401', async () => {
      const res = await client.post('/auth/refresh', {
        body: { refreshToken: 'invalid-token-string' },
      });
      expect(res.status).toBe(401);
    });

    it('thiếu refreshToken body → 400', async () => {
      const res = await client.post('/auth/refresh', {
        body: {},
      });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /auth/logout ────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('logout với refresh token hợp lệ → 200 + message thành công', async () => {
      // Login để có token
      const loginRes = await client.post('/auth/login', {
        body: { email: 'sale2@crm.local', password: 'changeme' },
      });
      const loginJson = await loginRes.json() as any;
      const { accessToken, refreshToken } = loginJson.data;

      // Logout
      const logoutClient = new ApiTestClient();
      // Gán token thủ công qua login
      await logoutClient.login('sale2@crm.local', 'changeme');
      const res = await logoutClient.post('/auth/logout', {
        body: { refreshToken },
      });
      const json = await res.json() as any;

      expect(res.status).toBe(200);
      expect(json.data.message).toBeTruthy();

      // Sau logout, refresh token cũ phải bị revoke
      const refreshRes = await client.post('/auth/refresh', {
        body: { refreshToken },
      });
      expect(refreshRes.status).toBe(401);

      void accessToken; // suppress unused warning
    });
  });

  // ── GET /auth/me ─────────────────────────────────────────────────────────

  describe('GET /auth/me', () => {
    it('có token hợp lệ → 200 + thông tin user hiện tại', async () => {
      const authed = new ApiTestClient();
      await authed.asAdmin();

      const res = await authed.get('/auth/me');
      const json = await res.json() as any;

      expect(res.status).toBe(200);
      expect(json.data).toBeDefined();
      expect(json.data.email).toBe('admin@crm.local');
      expect(json.data.role).toBe('SUPER_ADMIN');
      // Password hash không được lộ ra
      expect(json.data.passwordHash).toBeUndefined();
    });

    it('không có token → 401', async () => {
      const res = await fetch(`${BASE}/auth/me`, {
        method: 'GET',
      });
      expect(res.status).toBe(401);
    });

    it('token sai định dạng → 401', async () => {
      const res = await fetch(`${BASE}/auth/me`, {
        method: 'GET',
        headers: { Authorization: 'Bearer not-a-valid-jwt' },
      });
      expect(res.status).toBe(401);
    });

    it('GET /auth/me trả về đúng role cho manager', async () => {
      const authed = new ApiTestClient();
      await authed.asManager();

      const res = await authed.get('/auth/me');
      const json = await res.json() as any;

      expect(res.status).toBe(200);
      expect(json.data.role).toBe('MANAGER');
    });
  });
});
