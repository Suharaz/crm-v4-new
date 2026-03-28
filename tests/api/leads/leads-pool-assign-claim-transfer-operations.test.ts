/**
 * Test suite: Lead pools (3 kho) + assign, claim, transfer operations
 * Covers: pool/new, pool/floating, assign, claim atomic, transfer DEPARTMENT/FLOATING/UNASSIGN,
 *         permission checks per operation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('Lead Pools & Assignment Operations', () => {
  let admin: ApiTestClient;
  let manager: ApiTestClient;
  let user: ApiTestClient;
  let sourceId: string;
  let assignedUserId: string;
  let salesDeptId: string;

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

    // Lấy sales department ID
    const { body: deptBody } = await admin.getJson<any>('/departments');
    const depts = deptBody.data?.items ?? deptBody.data ?? [];
    const sales = depts.find((d: any) => d.name === 'Sales');
    if (sales) salesDeptId = sales.id;
  });

  async function createPoolLead(): Promise<string> {
    const { body } = await manager.postJson<any>('/leads', {
      name: `Pool Lead ${Date.now()}`,
      phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
      sourceId,
    });
    return body.data.id;
  }

  // ── GET /leads/pool/new ──────────────────────────────────────────────────

  describe('GET /leads/pool/new — Kho Mới', () => {
    it('SUPER_ADMIN xem kho mới → 200', async () => {
      const { status, body } = await admin.getJson<any>('/leads/pool/new');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('MANAGER xem kho mới → 200', async () => {
      const { status } = await manager.getJson<any>('/leads/pool/new');
      expect(status).toBe(200);
    });

    it('USER xem kho mới → 403 (chỉ MANAGER+ được xem)', async () => {
      const { status } = await user.getJson<any>('/leads/pool/new');
      expect(status).toBe(403);
    });
  });

  // ── GET /leads/pool/floating ─────────────────────────────────────────────

  describe('GET /leads/pool/floating — Kho Thả Nổi', () => {
    it('SUPER_ADMIN xem kho thả nổi → 200', async () => {
      const { status } = await admin.getJson<any>('/leads/pool/floating');
      expect(status).toBe(200);
    });

    it('MANAGER xem kho thả nổi → 200', async () => {
      const { status } = await manager.getJson<any>('/leads/pool/floating');
      expect(status).toBe(200);
    });

    it('USER xem kho thả nổi → 200 (tất cả user được xem)', async () => {
      const { status } = await user.getJson<any>('/leads/pool/floating');
      expect(status).toBe(200);
    });
  });

  // ── GET /leads/pool/department/:deptId ───────────────────────────────────

  describe('GET /leads/pool/department/:deptId — Kho Phòng Ban', () => {
    it('MANAGER xem kho phòng ban → 200', async () => {
      if (!salesDeptId) return;
      const { status } = await manager.getJson<any>(`/leads/pool/department/${salesDeptId}`);
      expect(status).toBe(200);
    });

    it('USER cùng phòng ban xem kho phòng ban → 200', async () => {
      if (!salesDeptId) return;
      const { status } = await user.getJson<any>(`/leads/pool/department/${salesDeptId}`);
      expect(status).toBe(200);
    });
  });

  // ── POST /leads/:id/assign ───────────────────────────────────────────────

  describe('POST /leads/:id/assign — Manager assign lead cho user', () => {
    it('MANAGER assign lead POOL cho user → 200, status ASSIGNED', async () => {
      const leadId = await createPoolLead();
      if (!assignedUserId) return;

      const { status, body } = await manager.postJson<any>(`/leads/${leadId}/assign`, {
        userId: assignedUserId,
      });
      expect(status).toBe(200);
      expect(body.data.status).toBe('ASSIGNED');
      expect(body.data.assignedUserId?.toString()).toBe(assignedUserId.toString());
    });

    it('USER assign lead → 403 (chỉ MANAGER+ được assign)', async () => {
      const leadId = await createPoolLead();
      if (!assignedUserId) return;

      const { status } = await user.postJson<any>(`/leads/${leadId}/assign`, {
        userId: assignedUserId,
      });
      expect(status).toBe(403);
    });

    it('SUPER_ADMIN assign lead → 200', async () => {
      const leadId = await createPoolLead();
      if (!assignedUserId) return;

      const { status } = await admin.postJson<any>(`/leads/${leadId}/assign`, {
        userId: assignedUserId,
      });
      expect(status).toBe(200);
    });
  });

  // ── POST /leads/:id/claim ─────────────────────────────────────────────────

  describe('POST /leads/:id/claim — User claim lead từ pool (atomic)', () => {
    it('USER claim lead từ kho → 200, lead được gán cho user', async () => {
      const leadId = await createPoolLead();

      const { status, body } = await user.postJson<any>(`/leads/${leadId}/claim`, {});
      expect(status).toBe(200);
      expect(body.data.assignedUserId?.toString()).toBe(assignedUserId?.toString());
    });

    it('MANAGER có thể claim lead → 200', async () => {
      const leadId = await createPoolLead();

      const { status } = await manager.postJson<any>(`/leads/${leadId}/claim`, {});
      expect(status).toBe(200);
    });

    it('claim lead đã được assign → 400 hoặc 409 (conflict)', async () => {
      const leadId = await createPoolLead();
      if (!assignedUserId) return;

      // Assign trước
      await manager.postJson<any>(`/leads/${leadId}/assign`, { userId: assignedUserId });

      // Claim lead đã assign
      const { status } = await user.postJson<any>(`/leads/${leadId}/claim`, {});
      expect([400, 409]).toContain(status);
    });
  });

  // ── POST /leads/:id/transfer ──────────────────────────────────────────────

  describe('POST /leads/:id/transfer — Transfer lead', () => {
    it('owner transfer lead sang FLOATING → 200', async () => {
      const leadId = await createPoolLead();
      if (!assignedUserId) return;

      await manager.postJson<any>(`/leads/${leadId}/assign`, { userId: assignedUserId });

      const { status, body } = await user.postJson<any>(`/leads/${leadId}/transfer`, {
        targetType: 'FLOATING',
      });
      expect(status).toBe(200);
      expect(body.data.status).toBe('FLOATING');
    });

    it('manager transfer lead sang phòng ban khác (DEPARTMENT) → 200', async () => {
      const leadId = await createPoolLead();
      if (!salesDeptId) return;

      const { status } = await manager.postJson<any>(`/leads/${leadId}/transfer`, {
        targetType: 'DEPARTMENT',
        targetDeptId: salesDeptId,
      });
      expect(status).toBe(200);
    });

    it('SUPER_ADMIN transfer lead UNASSIGN → 200', async () => {
      const leadId = await createPoolLead();
      if (!assignedUserId) return;

      await manager.postJson<any>(`/leads/${leadId}/assign`, { userId: assignedUserId });

      const { status } = await admin.postJson<any>(`/leads/${leadId}/transfer`, {
        targetType: 'UNASSIGN',
      });
      expect(status).toBe(200);
    });

    it('user không phải owner transfer lead → 403', async () => {
      // Tạo lead và assign cho user
      const leadId = await createPoolLead();
      if (!assignedUserId) return;
      await manager.postJson<any>(`/leads/${leadId}/assign`, { userId: assignedUserId });

      // Manager của phòng ban khác cố transfer
      const otherManager = new ApiTestClient();
      await otherManager.login('manager.support@crm.local', 'changeme');

      const { status } = await otherManager.postJson<any>(`/leads/${leadId}/transfer`, {
        targetType: 'FLOATING',
      });
      expect([403, 400]).toContain(status);
    });

    it('targetType không hợp lệ → 400', async () => {
      const leadId = await createPoolLead();

      const { status } = await manager.postJson<any>(`/leads/${leadId}/transfer`, {
        targetType: 'INVALID_TYPE',
      });
      expect(status).toBe(400);
    });
  });
});
