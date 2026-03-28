/**
 * Test suite: Notifications CRUD
 * Covers: list personal notifications, unread count, mark single as read, mark all as read
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('Notifications', () => {
  let admin: ApiTestClient;
  let manager: ApiTestClient;
  let user: ApiTestClient;

  beforeAll(async () => {
    [admin, manager, user] = await Promise.all([
      adminClient(),
      managerClient(),
      userClient(),
    ]);
  });

  // ── GET /notifications ───────────────────────────────────────────────────

  describe('GET /notifications — danh sách thông báo cá nhân', () => {
    it('USER lấy danh sách notifications của mình → 200', async () => {
      const { status, body } = await user.getJson<any>('/notifications');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('MANAGER lấy danh sách → 200', async () => {
      const { status } = await manager.getJson<any>('/notifications');
      expect(status).toBe(200);
    });

    it('SUPER_ADMIN lấy danh sách → 200', async () => {
      const { status } = await admin.getJson<any>('/notifications');
      expect(status).toBe(200);
    });

    it('không có token → 401', async () => {
      const anon = new ApiTestClient();
      const { status } = await anon.getJson<any>('/notifications');
      expect(status).toBe(401);
    });

    it('cursor pagination → 200', async () => {
      const { status, body } = await user.getJson<any>('/notifications?limit=5');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('notifications của user không lẫn sang manager', async () => {
      const { body: userBody } = await user.getJson<any>('/notifications');
      const { body: managerBody } = await manager.getJson<any>('/notifications');

      const userItems = userBody.data?.items ?? userBody.data ?? [];
      const managerItems = managerBody.data?.items ?? managerBody.data ?? [];

      const userIds = new Set(userItems.map((n: any) => n.id));
      const managerIds = new Set(managerItems.map((n: any) => n.id));
      const overlap = [...userIds].filter((id) => managerIds.has(id));
      expect(overlap.length).toBe(0);
    });
  });

  // ── GET /notifications/unread-count ──────────────────────────────────────

  describe('GET /notifications/unread-count — số thông báo chưa đọc', () => {
    it('USER lấy unread count → 200 + { count: number }', async () => {
      const { status, body } = await user.getJson<any>('/notifications/unread-count');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
      expect(typeof body.data.count).toBe('number');
      expect(body.data.count).toBeGreaterThanOrEqual(0);
    });

    it('MANAGER lấy unread count → 200', async () => {
      const { status, body } = await manager.getJson<any>('/notifications/unread-count');
      expect(status).toBe(200);
      expect(typeof body.data.count).toBe('number');
    });

    it('không có token → 401', async () => {
      const anon = new ApiTestClient();
      const { status } = await anon.getJson<any>('/notifications/unread-count');
      expect(status).toBe(401);
    });
  });

  // ── POST /notifications/:id/read ─────────────────────────────────────────

  describe('POST /notifications/:id/read — đánh dấu đã đọc', () => {
    it('không có notification nào → ID không tồn tại → 404', async () => {
      const { status } = await user.postJson<any>('/notifications/999999999/read', {});
      expect([404, 400]).toContain(status);
    });

    it('mark notification của user khác → 403 hoặc 404', async () => {
      // Lấy notification của manager (nếu có)
      const { body: managerBody } = await manager.getJson<any>('/notifications');
      const managerItems = managerBody.data?.items ?? managerBody.data ?? [];
      if (managerItems.length === 0) return;

      const managersNotifId = managerItems[0].id;
      // User cố mark notification của manager → không được
      const { status } = await user.postJson<any>(`/notifications/${managersNotifId}/read`, {});
      expect([403, 404]).toContain(status);
    });
  });

  // ── POST /notifications/read-all ─────────────────────────────────────────

  describe('POST /notifications/read-all — đánh dấu tất cả đã đọc', () => {
    it('USER mark all read → 200 + message', async () => {
      const { status, body } = await user.postJson<any>('/notifications/read-all', {});
      expect(status).toBe(200);
      expect(body.data.message).toBeTruthy();
    });

    it('MANAGER mark all read → 200', async () => {
      const { status } = await manager.postJson<any>('/notifications/read-all', {});
      expect(status).toBe(200);
    });

    it('sau mark all read → unread count = 0', async () => {
      await user.postJson<any>('/notifications/read-all', {});
      const { body } = await user.getJson<any>('/notifications/unread-count');
      expect(body.data.count).toBe(0);
    });

    it('không có token → 401', async () => {
      const anon = new ApiTestClient();
      const { status } = await anon.postJson<any>('/notifications/read-all', {});
      expect(status).toBe(401);
    });
  });
});
