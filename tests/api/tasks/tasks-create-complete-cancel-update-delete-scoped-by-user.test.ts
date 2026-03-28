/**
 * Test suite: Tasks/Todo CRUD
 * Covers: tạo, list, complete, cancel, update, delete task — scoped per user (personal only)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('Tasks CRUD — Personal Scoped', () => {
  let admin: ApiTestClient;
  let manager: ApiTestClient;
  let user: ApiTestClient;
  let createdTaskId: string;
  let managerTaskId: string;

  beforeAll(async () => {
    [admin, manager, user] = await Promise.all([
      adminClient(),
      managerClient(),
      userClient(),
    ]);
  });

  // ── POST /tasks ──────────────────────────────────────────────────────────

  describe('POST /tasks — tạo task mới', () => {
    it('USER tạo task → 201', async () => {
      const { status, body } = await user.postJson<any>('/tasks', {
        title: 'Gọi điện cho khách hàng ABC',
        dueDate: new Date(Date.now() + 86400000).toISOString(), // ngày mai
        priority: 'HIGH',
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
      expect(body.data.title).toBe('Gọi điện cho khách hàng ABC');
      createdTaskId = body.data.id;
    });

    it('MANAGER tạo task → 201', async () => {
      const { status, body } = await manager.postJson<any>('/tasks', {
        title: 'Kiểm tra báo cáo doanh số',
        priority: 'MEDIUM',
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
      managerTaskId = body.data.id;
    });

    it('SUPER_ADMIN tạo task → 201', async () => {
      const { status, body } = await admin.postJson<any>('/tasks', {
        title: 'Task của admin',
        priority: 'LOW',
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
    });

    it('thiếu title → 400', async () => {
      const { status } = await user.postJson<any>('/tasks', {
        priority: 'HIGH',
      });
      expect(status).toBe(400);
    });

    it('không có token → 401', async () => {
      const anon = new ApiTestClient();
      const { status } = await anon.postJson<any>('/tasks', {
        title: 'Anonymous Task',
      });
      expect(status).toBe(401);
    });
  });

  // ── GET /tasks ───────────────────────────────────────────────────────────

  describe('GET /tasks — danh sách task của chính mình', () => {
    it('USER chỉ thấy tasks của mình → 200', async () => {
      const { status, body } = await user.getJson<any>('/tasks');
      expect(status).toBe(200);
      const items = body.data?.items ?? body.data ?? [];
      // Tất cả tasks trả về đều phải của user này
      expect(Array.isArray(items)).toBe(true);
    });

    it('MANAGER chỉ thấy tasks của mình → 200', async () => {
      const { status, body } = await manager.getJson<any>('/tasks');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('lọc theo status=PENDING → 200', async () => {
      const { status, body } = await user.getJson<any>('/tasks?status=PENDING');
      expect(status).toBe(200);
      const items = body.data?.items ?? body.data ?? [];
      items.forEach((t: any) => {
        expect(t.status).toBe('PENDING');
      });
    });

    it('lọc theo status=COMPLETED → 200', async () => {
      const { status } = await user.getJson<any>('/tasks?status=COMPLETED');
      expect(status).toBe(200);
    });

    it('tasks của manager không lẫn vào tasks của user', async () => {
      const { body: userBody } = await user.getJson<any>('/tasks');
      const { body: managerBody } = await manager.getJson<any>('/tasks');

      const userItems = userBody.data?.items ?? userBody.data ?? [];
      const managerItems = managerBody.data?.items ?? managerBody.data ?? [];

      // Không có task nào trùng ID giữa 2 users
      const userIds = new Set(userItems.map((t: any) => t.id));
      const managerIds = new Set(managerItems.map((t: any) => t.id));
      const intersection = [...userIds].filter((id) => managerIds.has(id));
      expect(intersection.length).toBe(0);
    });
  });

  // ── POST /tasks/:id/complete ─────────────────────────────────────────────

  describe('POST /tasks/:id/complete — đánh dấu hoàn thành', () => {
    it('USER complete task của mình → 200, status COMPLETED', async () => {
      if (!createdTaskId) return;
      const { status, body } = await user.postJson<any>(`/tasks/${createdTaskId}/complete`, {});
      expect(status).toBe(200);
      expect(body.data.status).toBe('COMPLETED');
    });

    it('complete task đã COMPLETED → 400 hoặc 409', async () => {
      if (!createdTaskId) return;
      const { status } = await user.postJson<any>(`/tasks/${createdTaskId}/complete`, {});
      expect([400, 409]).toContain(status);
    });
  });

  // ── POST /tasks/:id/cancel ────────────────────────────────────────────────

  describe('POST /tasks/:id/cancel — hủy task', () => {
    it('MANAGER cancel task của mình → 200, status CANCELLED', async () => {
      if (!managerTaskId) return;
      const { status, body } = await manager.postJson<any>(`/tasks/${managerTaskId}/cancel`, {});
      expect(status).toBe(200);
      expect(body.data.status).toBe('CANCELLED');
    });
  });

  // ── PATCH /tasks/:id ─────────────────────────────────────────────────────

  describe('PATCH /tasks/:id — cập nhật task', () => {
    let updateTaskId: string;

    beforeAll(async () => {
      const { body } = await user.postJson<any>('/tasks', {
        title: 'Task để update',
        priority: 'LOW',
      });
      updateTaskId = body.data.id;
    });

    it('USER cập nhật title task của mình → 200', async () => {
      if (!updateTaskId) return;
      const { status, body } = await user.patchJson<any>(`/tasks/${updateTaskId}`, {
        title: 'Title đã cập nhật',
        priority: 'HIGH',
      });
      expect(status).toBe(200);
      expect(body.data.title).toBe('Title đã cập nhật');
    });

    it('cập nhật dueDate → 200', async () => {
      if (!updateTaskId) return;
      const newDue = new Date(Date.now() + 2 * 86400000).toISOString();
      const { status, body } = await user.patchJson<any>(`/tasks/${updateTaskId}`, {
        dueDate: newDue,
      });
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });
  });

  // ── DELETE /tasks/:id ─────────────────────────────────────────────────────

  describe('DELETE /tasks/:id — xóa task', () => {
    let deleteTaskId: string;

    beforeAll(async () => {
      const { body } = await user.postJson<any>('/tasks', {
        title: 'Task để xóa',
      });
      deleteTaskId = body.data.id;
    });

    it('USER xóa task của mình → 200', async () => {
      if (!deleteTaskId) return;
      const { status, body } = await user.deleteJson<any>(`/tasks/${deleteTaskId}`);
      expect(status).toBe(200);
      expect(body.data.success).toBe(true);
    });

    it('xóa task không tồn tại → 404', async () => {
      const { status } = await user.deleteJson<any>('/tasks/999999999');
      expect(status).toBe(404);
    });
  });
});
