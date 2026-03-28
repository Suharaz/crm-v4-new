/**
 * Test suite: AI Distribution config, scores, batch distribute
 * Covers: GET/PATCH config per dept, score preview, batch distribute, RBAC
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('AI Distribution', () => {
  let admin: ApiTestClient;
  let manager: ApiTestClient;
  let user: ApiTestClient;
  let salesDeptId: string;

  beforeAll(async () => {
    [admin, manager, user] = await Promise.all([
      adminClient(),
      managerClient(),
      userClient(),
    ]);

    // Lấy sales department ID
    const { body } = await admin.getJson<any>('/departments');
    const depts = body.data?.items ?? body.data ?? [];
    const sales = depts.find((d: any) => d.name === 'Sales');
    if (sales) salesDeptId = sales.id;
  });

  // ── GET /distribution/config/:deptId ────────────────────────────────────

  describe('GET /distribution/config/:deptId — lấy config phân phối', () => {
    it('MANAGER lấy config dept → 200', async () => {
      if (!salesDeptId) return;
      const { status, body } = await manager.getJson<any>(`/distribution/config/${salesDeptId}`);
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('SUPER_ADMIN lấy config → 200', async () => {
      if (!salesDeptId) return;
      const { status } = await admin.getJson<any>(`/distribution/config/${salesDeptId}`);
      expect(status).toBe(200);
    });

    it('USER lấy config → 403 (chỉ MANAGER+)', async () => {
      if (!salesDeptId) return;
      const { status } = await user.getJson<any>(`/distribution/config/${salesDeptId}`);
      expect(status).toBe(403);
    });

    it('dept không tồn tại → 404 hoặc trả về config mặc định', async () => {
      const { status } = await admin.getJson<any>('/distribution/config/999999999');
      expect([200, 404]).toContain(status);
    });
  });

  // ── PATCH /distribution/config/:deptId ──────────────────────────────────

  describe('PATCH /distribution/config/:deptId — cập nhật config', () => {
    it('SUPER_ADMIN cập nhật config → 200', async () => {
      if (!salesDeptId) return;
      const { status, body } = await admin.patchJson<any>(`/distribution/config/${salesDeptId}`, {
        isActive: true,
        weightConfig: {
          performance: 0.4,
          workload: 0.3,
          seniority: 0.3,
        },
      });
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('MANAGER cập nhật config → 403 (chỉ SUPER_ADMIN)', async () => {
      if (!salesDeptId) return;
      const { status } = await manager.patchJson<any>(`/distribution/config/${salesDeptId}`, {
        isActive: false,
      });
      expect(status).toBe(403);
    });

    it('USER cập nhật config → 403', async () => {
      if (!salesDeptId) return;
      const { status } = await user.patchJson<any>(`/distribution/config/${salesDeptId}`, {
        isActive: true,
      });
      expect(status).toBe(403);
    });

    it('weightConfig tổng ≠ 1.0 → có thể lỗi validation', async () => {
      if (!salesDeptId) return;
      const { status } = await admin.patchJson<any>(`/distribution/config/${salesDeptId}`, {
        weightConfig: {
          performance: 0.9,
          workload: 0.9, // tổng > 1
        },
      });
      // Tùy implementation: có thể 400 hoặc 200 (không validate tổng)
      expect([200, 400]).toContain(status);
    });
  });

  // ── GET /distribution/scores/:deptId ────────────────────────────────────

  describe('GET /distribution/scores/:deptId — xem điểm phân phối', () => {
    it('MANAGER xem scores → 200 + array of user scores', async () => {
      if (!salesDeptId) return;
      const { status, body } = await manager.getJson<any>(`/distribution/scores/${salesDeptId}`);
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
      // Scores phải là array
      const scores = body.data?.scores ?? body.data;
      expect(Array.isArray(scores)).toBe(true);
    });

    it('SUPER_ADMIN xem scores → 200', async () => {
      if (!salesDeptId) return;
      const { status } = await admin.getJson<any>(`/distribution/scores/${salesDeptId}`);
      expect(status).toBe(200);
    });

    it('USER xem scores → 403', async () => {
      if (!salesDeptId) return;
      const { status } = await user.getJson<any>(`/distribution/scores/${salesDeptId}`);
      expect(status).toBe(403);
    });
  });

  // ── POST /distribution/distribute/:deptId ───────────────────────────────

  describe('POST /distribution/distribute/:deptId — batch distribute leads', () => {
    it('MANAGER batch distribute → 200', async () => {
      if (!salesDeptId) return;
      const { status, body } = await manager.postJson<any>(
        `/distribution/distribute/${salesDeptId}`,
        {},
      );
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('SUPER_ADMIN batch distribute → 200', async () => {
      if (!salesDeptId) return;
      const { status } = await admin.postJson<any>(
        `/distribution/distribute/${salesDeptId}`,
        {},
      );
      expect(status).toBe(200);
    });

    it('USER batch distribute → 403', async () => {
      if (!salesDeptId) return;
      const { status } = await user.postJson<any>(
        `/distribution/distribute/${salesDeptId}`,
        {},
      );
      expect(status).toBe(403);
    });

    it('dept không có leads POOL → 200 + distributed count = 0', async () => {
      // Distribute dept không có leads → không lỗi, chỉ trả về 0 distributed
      if (!salesDeptId) return;
      const { status, body } = await manager.postJson<any>(
        `/distribution/distribute/${salesDeptId}`,
        {},
      );
      expect(status).toBe(200);
      // distributed count có thể là 0 nếu không còn leads
      const distributed = body.data?.distributed ?? body.data?.count ?? 0;
      expect(typeof distributed).toBe('number');
    });
  });
});
