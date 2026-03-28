/**
 * Test suite: Activity timeline — create notes, cursor pagination,
 *             auto IN_PROGRESS trigger on first note for ASSIGNED lead,
 *             customer activities
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('Activity Timeline', () => {
  let admin: ApiTestClient;
  let manager: ApiTestClient;
  let user: ApiTestClient;
  let sourceId: string;
  let assignedUserId: string;
  let customerId: string;

  beforeAll(async () => {
    [admin, manager, user] = await Promise.all([
      adminClient(),
      managerClient(),
      userClient(),
    ]);

    // Lấy sourceId
    const { body: srcBody } = await admin.getJson<any>('/lead-sources');
    const sources = srcBody.data ?? srcBody;
    if (Array.isArray(sources) && sources.length > 0) sourceId = sources[0].id;

    // Lấy sale1 user ID
    const { body: usersBody } = await admin.getJson<any>('/users');
    const items = usersBody.data?.items ?? usersBody.data ?? [];
    const sale1 = items.find((u: any) => u.email === 'sale1@crm.local');
    if (sale1) assignedUserId = sale1.id;

    // Tạo customer để test customer activities
    const { body: custBody } = await manager.postJson<any>('/customers', {
      name: 'Activity Test Customer',
      phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
    });
    customerId = custBody.data.id;
  });

  async function createAssignedLead(): Promise<string> {
    const { body } = await manager.postJson<any>('/leads', {
      name: `Activity Lead ${Date.now()}`,
      phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
      sourceId,
    });
    const leadId = body.data.id;
    if (assignedUserId) {
      await manager.postJson<any>(`/leads/${leadId}/assign`, { userId: assignedUserId });
    }
    return leadId;
  }

  // ── POST /leads/:id/activities ───────────────────────────────────────────

  describe('POST /leads/:id/activities — tạo note cho lead', () => {
    it('USER tạo note cho lead → 201', async () => {
      const leadId = await createAssignedLead();
      const { status, body } = await user.postJson<any>(`/leads/${leadId}/activities`, {
        content: 'Đã gọi điện, khách có nhu cầu tìm hiểu sản phẩm',
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
      expect(body.data.content).toBe('Đã gọi điện, khách có nhu cầu tìm hiểu sản phẩm');
    });

    it('MANAGER tạo note → 201', async () => {
      const leadId = await createAssignedLead();
      const { status } = await manager.postJson<any>(`/leads/${leadId}/activities`, {
        content: 'Manager ghi chú',
      });
      expect(status).toBe(201);
    });

    it('SUPER_ADMIN tạo note → 201', async () => {
      const leadId = await createAssignedLead();
      const { status } = await admin.postJson<any>(`/leads/${leadId}/activities`, {
        content: 'Admin ghi chú',
      });
      expect(status).toBe(201);
    });

    it('thiếu content → 400', async () => {
      const leadId = await createAssignedLead();
      const { status } = await user.postJson<any>(`/leads/${leadId}/activities`, {});
      expect(status).toBe(400);
    });

    it('content rỗng → 400', async () => {
      const leadId = await createAssignedLead();
      const { status } = await user.postJson<any>(`/leads/${leadId}/activities`, {
        content: '',
      });
      expect(status).toBe(400);
    });

    it('lead không tồn tại → 404', async () => {
      const { status } = await user.postJson<any>('/leads/999999999/activities', {
        content: 'Note for nonexistent lead',
      });
      expect(status).toBe(404);
    });

    it('không có token → 401', async () => {
      const leadId = await createAssignedLead();
      const anon = new ApiTestClient();
      const { status } = await anon.postJson<any>(`/leads/${leadId}/activities`, {
        content: 'Anon note',
      });
      expect(status).toBe(401);
    });
  });

  // ── Auto IN_PROGRESS trigger ─────────────────────────────────────────────

  describe('Auto IN_PROGRESS trigger — note đầu tiên cho lead ASSIGNED', () => {
    it('lead ASSIGNED + user tạo note đầu tiên → lead tự chuyển IN_PROGRESS', async () => {
      const leadId = await createAssignedLead();

      // Kiểm tra trạng thái ban đầu là ASSIGNED
      const { body: beforeBody } = await admin.getJson<any>(`/leads/${leadId}`);
      expect(beforeBody.data.status).toBe('ASSIGNED');

      // User tạo note đầu tiên
      const { status: noteStatus } = await user.postJson<any>(`/leads/${leadId}/activities`, {
        content: 'Note đầu tiên kích hoạt IN_PROGRESS',
      });
      expect(noteStatus).toBe(201);

      // Lead phải tự chuyển sang IN_PROGRESS
      const { body: afterBody } = await admin.getJson<any>(`/leads/${leadId}`);
      expect(afterBody.data.status).toBe('IN_PROGRESS');
    });

    it('lead POOL (chưa assign) + tạo note → không trigger IN_PROGRESS', async () => {
      const { body: leadBody } = await manager.postJson<any>('/leads', {
        name: `Pool Note Lead ${Date.now()}`,
        phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
        sourceId,
      });
      const leadId = leadBody.data.id;

      await manager.postJson<any>(`/leads/${leadId}/activities`, {
        content: 'Note on POOL lead',
      });

      const { body } = await admin.getJson<any>(`/leads/${leadId}`);
      // Status phải vẫn là POOL
      expect(body.data.status).toBe('POOL');
    });

    it('note thứ 2 trở đi không trigger lại (lead đã IN_PROGRESS)', async () => {
      const leadId = await createAssignedLead();

      // Note đầu tiên
      await user.postJson<any>(`/leads/${leadId}/activities`, { content: 'Note 1' });

      // Xác nhận đã IN_PROGRESS
      const { body: mid } = await admin.getJson<any>(`/leads/${leadId}`);
      expect(mid.data.status).toBe('IN_PROGRESS');

      // Note thứ 2
      const { status } = await user.postJson<any>(`/leads/${leadId}/activities`, {
        content: 'Note 2 — không thay đổi status',
      });
      expect(status).toBe(201);

      // Status vẫn IN_PROGRESS (không bị thay đổi lại)
      const { body: after } = await admin.getJson<any>(`/leads/${leadId}`);
      expect(after.data.status).toBe('IN_PROGRESS');
    });
  });

  // ── GET /leads/:id/activities ────────────────────────────────────────────

  describe('GET /leads/:id/activities — timeline với cursor pagination', () => {
    it('lấy timeline lead → 200 + array notes', async () => {
      const leadId = await createAssignedLead();
      // Tạo vài notes
      await user.postJson<any>(`/leads/${leadId}/activities`, { content: 'Note A' });
      await user.postJson<any>(`/leads/${leadId}/activities`, { content: 'Note B' });

      const { status, body } = await manager.getJson<any>(`/leads/${leadId}/activities`);
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
      const items = body.data?.items ?? body.data;
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThanOrEqual(2);
    });

    it('cursor pagination trên timeline → 200', async () => {
      const leadId = await createAssignedLead();
      // Tạo nhiều notes
      for (let i = 0; i < 5; i++) {
        await user.postJson<any>(`/leads/${leadId}/activities`, { content: `Note ${i}` });
      }

      const { body: page1 } = await manager.getJson<any>(`/leads/${leadId}/activities?limit=3`);
      const nextCursor = page1.data?.meta?.nextCursor ?? page1.meta?.nextCursor;

      if (nextCursor) {
        const { status } = await manager.getJson<any>(
          `/leads/${leadId}/activities?limit=3&cursor=${nextCursor}`,
        );
        expect(status).toBe(200);
      }
    });

    it('lead không tồn tại → 404', async () => {
      const { status } = await admin.getJson<any>('/leads/999999999/activities');
      expect(status).toBe(404);
    });
  });

  // ── POST /customers/:id/activities ──────────────────────────────────────

  describe('POST /customers/:id/activities — tạo note cho customer', () => {
    it('USER tạo note cho customer → 201', async () => {
      const { status, body } = await user.postJson<any>(`/customers/${customerId}/activities`, {
        content: 'Gọi điện cho khách, đã đặt hàng',
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
    });

    it('MANAGER tạo note cho customer → 201', async () => {
      const { status } = await manager.postJson<any>(`/customers/${customerId}/activities`, {
        content: 'Manager ghi chú customer',
      });
      expect(status).toBe(201);
    });

    it('thiếu content → 400', async () => {
      const { status } = await user.postJson<any>(`/customers/${customerId}/activities`, {});
      expect(status).toBe(400);
    });

    it('customer không tồn tại → 404', async () => {
      const { status } = await user.postJson<any>('/customers/999999999/activities', {
        content: 'Note for nonexistent customer',
      });
      expect(status).toBe(404);
    });
  });

  // ── GET /customers/:id/activities ────────────────────────────────────────

  describe('GET /customers/:id/activities — customer timeline', () => {
    it('lấy timeline customer → 200 + array', async () => {
      const { status, body } = await manager.getJson<any>(`/customers/${customerId}/activities`);
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
      const items = body.data?.items ?? body.data;
      expect(Array.isArray(items)).toBe(true);
    });

    it('cursor pagination → 200', async () => {
      const { status } = await manager.getJson<any>(
        `/customers/${customerId}/activities?limit=2`,
      );
      expect(status).toBe(200);
    });

    it('không có token → 401', async () => {
      const anon = new ApiTestClient();
      const { status } = await anon.getJson<any>(`/customers/${customerId}/activities`);
      expect(status).toBe(401);
    });
  });
});
