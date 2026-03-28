/**
 * Test suite: Users CRUD + RBAC
 * Covers: list, create, update, deactivate, profile update, role access control
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('Users CRUD & RBAC', () => {
  let admin: ApiTestClient;
  let manager: ApiTestClient;
  let user: ApiTestClient;
  let createdUserId: string;

  beforeAll(async () => {
    [admin, manager, user] = await Promise.all([
      adminClient(),
      managerClient(),
      userClient(),
    ]);
  });

  // ── GET /users ───────────────────────────────────────────────────────────

  describe('GET /users — danh sách người dùng', () => {
    it('SUPER_ADMIN → 200 + danh sách users', async () => {
      const { status, body } = await admin.getJson<any>('/users');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('MANAGER → 200 + danh sách users', async () => {
      const { status, body } = await manager.getJson<any>('/users');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('USER → 403 không có quyền xem danh sách', async () => {
      const { status } = await user.getJson<any>('/users');
      expect(status).toBe(403);
    });

    it('không có token → 401', async () => {
      const anon = new ApiTestClient();
      const { status } = await anon.getJson<any>('/users');
      expect(status).toBe(401);
    });
  });

  // ── POST /users ──────────────────────────────────────────────────────────

  describe('POST /users — tạo user mới', () => {
    it('SUPER_ADMIN tạo user mới → 201 + user data', async () => {
      const payload = {
        email: `testuser-${Date.now()}@crm.local`,
        password: 'Test@123456',
        name: 'Test User Tạo Mới',
        phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
        role: 'USER',
      };
      const { status, body } = await admin.postJson<any>('/users', payload);
      expect(status).toBe(201);
      expect(body.data.email).toBe(payload.email);
      expect(body.data.id).toBeDefined();
      // Lưu lại ID để test sau
      createdUserId = body.data.id;
    });

    it('MANAGER tạo user → 403', async () => {
      const { status } = await manager.postJson<any>('/users', {
        email: 'blocked@crm.local',
        password: 'Test@123456',
        name: 'Blocked User',
        role: 'USER',
      });
      expect(status).toBe(403);
    });

    it('USER tạo user → 403', async () => {
      const { status } = await user.postJson<any>('/users', {
        email: 'blocked2@crm.local',
        password: 'Test@123456',
        name: 'Blocked User 2',
        role: 'USER',
      });
      expect(status).toBe(403);
    });

    it('email trùng → 409 hoặc 400', async () => {
      const { status } = await admin.postJson<any>('/users', {
        email: 'admin@crm.local',
        password: 'changeme',
        name: 'Duplicate Admin',
        role: 'USER',
      });
      expect([400, 409]).toContain(status);
    });
  });

  // ── PATCH /users/:id ─────────────────────────────────────────────────────

  describe('PATCH /users/:id — cập nhật user (admin)', () => {
    it('SUPER_ADMIN cập nhật user → 200', async () => {
      if (!createdUserId) return;
      const { status, body } = await admin.patchJson<any>(`/users/${createdUserId}`, {
        name: 'Updated Name',
      });
      expect(status).toBe(200);
      expect(body.data.name).toBe('Updated Name');
    });

    it('MANAGER cập nhật user khác → 403', async () => {
      if (!createdUserId) return;
      const { status } = await manager.patchJson<any>(`/users/${createdUserId}`, {
        name: 'Manager Cannot Update',
      });
      expect(status).toBe(403);
    });

    it('USER cập nhật user khác → 403', async () => {
      if (!createdUserId) return;
      const { status } = await user.patchJson<any>(`/users/${createdUserId}`, {
        name: 'User Cannot Update',
      });
      expect(status).toBe(403);
    });
  });

  // ── PATCH /users/profile ─────────────────────────────────────────────────

  describe('PATCH /users/profile — cập nhật profile của chính mình', () => {
    it('USER cập nhật profile của chính mình → 200', async () => {
      const { status, body } = await user.patchJson<any>('/users/profile', {
        name: 'Lê Văn Sale (Updated)',
      });
      expect(status).toBe(200);
      expect(body.data.name).toBe('Lê Văn Sale (Updated)');
    });

    it('MANAGER cập nhật profile của chính mình → 200', async () => {
      const { status, body } = await manager.patchJson<any>('/users/profile', {
        name: 'Nguyễn Văn Quản Lý (Updated)',
      });
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('ADMIN cập nhật profile của chính mình → 200', async () => {
      const { status } = await admin.patchJson<any>('/users/profile', {
        name: 'Super Admin (Updated)',
      });
      expect(status).toBe(200);
    });
  });

  // ── DELETE /users/:id (deactivate) ───────────────────────────────────────

  describe('DELETE /users/:id — deactivate user', () => {
    it('MANAGER deactivate user → 403', async () => {
      if (!createdUserId) return;
      const { status } = await manager.deleteJson<any>(`/users/${createdUserId}`);
      expect(status).toBe(403);
    });

    it('USER deactivate user → 403', async () => {
      if (!createdUserId) return;
      const { status } = await user.deleteJson<any>(`/users/${createdUserId}`);
      expect(status).toBe(403);
    });

    it('SUPER_ADMIN deactivate user → 200', async () => {
      if (!createdUserId) return;
      const { status } = await admin.deleteJson<any>(`/users/${createdUserId}`);
      expect(status).toBe(200);
    });

    it('SUPER_ADMIN không thể deactivate chính mình', async () => {
      // Lấy ID admin
      const { body: meBody } = await admin.getJson<any>('/auth/me');
      const adminId = meBody.data.id;
      const { status } = await admin.deleteJson<any>(`/users/${adminId}`);
      // Nên trả về lỗi 400 hoặc 403
      expect([400, 403]).toContain(status);
    });
  });

  // ── GET /users/:id ───────────────────────────────────────────────────────

  describe('GET /users/:id — xem chi tiết user', () => {
    it('SUPER_ADMIN xem bất kỳ user → 200', async () => {
      const { body: listBody } = await admin.getJson<any>('/users');
      const firstUser = listBody.data?.[0] ?? listBody.data?.items?.[0];
      if (!firstUser) return;
      const { status } = await admin.getJson<any>(`/users/${firstUser.id}`);
      expect(status).toBe(200);
    });

    it('USER xem user khác → trả về chính mình (không lộ thông tin người khác)', async () => {
      const { body: listBody } = await admin.getJson<any>('/users');
      const items = listBody.data?.items ?? listBody.data ?? [];
      const otherUser = items.find((u: any) => u.email !== 'sale1@crm.local');
      if (!otherUser) return;

      const { status, body } = await user.getJson<any>(`/users/${otherUser.id}`);
      // Nên trả về 200 nhưng data là chính user đó (không phải otherUser)
      expect(status).toBe(200);
      expect(body.data.email).toBe('sale1@crm.local');
    });
  });
});
