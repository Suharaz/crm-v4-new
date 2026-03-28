/**
 * Test suite: Lead status transitions
 * Covers: POOL→ASSIGNED→IN_PROGRESS→CONVERTED/LOST→FLOATING, invalid transitions → 409/400
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('Lead Status Transitions', () => {
  let admin: ApiTestClient;
  let manager: ApiTestClient;
  let user: ApiTestClient;
  let sourceId: string;
  let assignedUserId: string;

  beforeAll(async () => {
    [admin, manager, user] = await Promise.all([
      adminClient(),
      managerClient(),
      userClient(),
    ]);

    // Lấy sourceId
    const { body } = await admin.getJson<any>('/lead-sources');
    const sources = body.data ?? body;
    if (Array.isArray(sources) && sources.length > 0) {
      sourceId = sources[0].id;
    }

    // Lấy userId của sale1
    const { body: usersBody } = await admin.getJson<any>('/users');
    const items = usersBody.data?.items ?? usersBody.data ?? [];
    const sale1 = items.find((u: any) => u.email === 'sale1@crm.local');
    if (sale1) assignedUserId = sale1.id;
  });

  /** Helper tạo lead mới ở trạng thái POOL */
  async function createPoolLead(): Promise<string> {
    const { body } = await manager.postJson<any>('/leads', {
      name: `Test Lead ${Date.now()}`,
      phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
      sourceId,
    });
    return body.data.id;
  }

  // ── POOL → ASSIGNED ──────────────────────────────────────────────────────

  describe('POOL → ASSIGNED (qua assign)', () => {
    it('manager assign lead cho user → lead trở thành ASSIGNED', async () => {
      const leadId = await createPoolLead();
      if (!assignedUserId) return;

      const { status, body } = await manager.postJson<any>(`/leads/${leadId}/assign`, {
        userId: assignedUserId,
      });
      expect(status).toBe(200);
      expect(body.data.status).toBe('ASSIGNED');
      expect(body.data.assignedUserId?.toString()).toBe(assignedUserId.toString());
    });
  });

  // ── ASSIGNED → IN_PROGRESS (auto khi tạo note) ───────────────────────────

  describe('ASSIGNED → IN_PROGRESS (auto trigger khi tạo note đầu tiên)', () => {
    it('tạo note đầu tiên cho lead ASSIGNED → lead auto chuyển IN_PROGRESS', async () => {
      const leadId = await createPoolLead();
      if (!assignedUserId) return;

      // Assign trước
      await manager.postJson<any>(`/leads/${leadId}/assign`, { userId: assignedUserId });

      // User tạo note (trigger IN_PROGRESS)
      const { status } = await user.postJson<any>(`/leads/${leadId}/activities`, {
        content: 'Đã gọi điện, khách quan tâm sản phẩm',
      });
      expect(status).toBe(201);

      // Kiểm tra lead đã chuyển IN_PROGRESS
      const { body } = await admin.getJson<any>(`/leads/${leadId}`);
      expect(body.data.status).toBe('IN_PROGRESS');
    });
  });

  // ── IN_PROGRESS → LOST → FLOATING ────────────────────────────────────────

  describe('IN_PROGRESS → LOST → FLOATING', () => {
    it('chuyển lead IN_PROGRESS sang LOST → 200', async () => {
      const leadId = await createPoolLead();
      if (!assignedUserId) return;

      await manager.postJson<any>(`/leads/${leadId}/assign`, { userId: assignedUserId });
      await user.postJson<any>(`/leads/${leadId}/activities`, { content: 'Ghi chú đầu tiên' });

      const { status, body } = await manager.postJson<any>(`/leads/${leadId}/status`, {
        status: 'LOST',
      });
      expect(status).toBe(200);
      expect(body.data.status).toBe('LOST');
    });

    it('lead LOST → chuyển sang FLOATING', async () => {
      const leadId = await createPoolLead();
      if (!assignedUserId) return;

      await manager.postJson<any>(`/leads/${leadId}/assign`, { userId: assignedUserId });
      await user.postJson<any>(`/leads/${leadId}/activities`, { content: 'Note' });
      await manager.postJson<any>(`/leads/${leadId}/status`, { status: 'LOST' });

      const { status, body } = await manager.postJson<any>(`/leads/${leadId}/status`, {
        status: 'FLOATING',
      });
      expect(status).toBe(200);
      expect(body.data.status).toBe('FLOATING');
    });
  });

  // ── IN_PROGRESS → CONVERTED ──────────────────────────────────────────────

  describe('IN_PROGRESS → CONVERTED', () => {
    it('convert lead IN_PROGRESS → 200, status CONVERTED', async () => {
      const leadId = await createPoolLead();
      if (!assignedUserId) return;

      await manager.postJson<any>(`/leads/${leadId}/assign`, { userId: assignedUserId });
      await user.postJson<any>(`/leads/${leadId}/activities`, { content: 'Note trigger' });

      const { status, body } = await manager.postJson<any>(`/leads/${leadId}/convert`, {});
      expect(status).toBe(200);
      expect(body.data.status).toBe('CONVERTED');
    });
  });

  // ── Invalid transitions ──────────────────────────────────────────────────

  describe('Các transition không hợp lệ → 409 hoặc 400', () => {
    it('CONVERTED → bất kỳ status nào → lỗi', async () => {
      const leadId = await createPoolLead();
      if (!assignedUserId) return;

      await manager.postJson<any>(`/leads/${leadId}/assign`, { userId: assignedUserId });
      await user.postJson<any>(`/leads/${leadId}/activities`, { content: 'Note' });
      await manager.postJson<any>(`/leads/${leadId}/convert`, {});

      // Thử chuyển CONVERTED → LOST
      const { status: s1 } = await manager.postJson<any>(`/leads/${leadId}/status`, {
        status: 'LOST',
      });
      expect([400, 409]).toContain(s1);

      // Thử chuyển CONVERTED → IN_PROGRESS
      const { status: s2 } = await manager.postJson<any>(`/leads/${leadId}/status`, {
        status: 'IN_PROGRESS',
      });
      expect([400, 409]).toContain(s2);
    });

    it('POOL → CONVERTED (bỏ qua các bước) → lỗi', async () => {
      const leadId = await createPoolLead();

      const { status } = await manager.postJson<any>(`/leads/${leadId}/convert`, {});
      expect([400, 409]).toContain(status);
    });

    it('POOL → LOST (không assign trước) → lỗi', async () => {
      const leadId = await createPoolLead();

      const { status } = await manager.postJson<any>(`/leads/${leadId}/status`, {
        status: 'LOST',
      });
      expect([400, 409]).toContain(status);
    });

    it('status không tồn tại → 400', async () => {
      const leadId = await createPoolLead();

      const { status } = await manager.postJson<any>(`/leads/${leadId}/status`, {
        status: 'INVALID_STATUS',
      });
      expect(status).toBe(400);
    });
  });
});
