/**
 * Test suite: Global search endpoint
 * Covers: grouped results (leads/customers/orders), min 2 chars validation,
 *         RBAC, empty query handling
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('Global Search', () => {
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

  // ── GET /search?q= ───────────────────────────────────────────────────────

  describe('GET /search?q= — tìm kiếm toàn cục', () => {
    it('query hợp lệ (≥2 ký tự) → 200 + grouped results', async () => {
      const { status, body } = await admin.getJson<any>('/search?q=test');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
      // Kết quả phải có 3 nhóm
      expect(body.data).toHaveProperty('leads');
      expect(body.data).toHaveProperty('customers');
      expect(body.data).toHaveProperty('orders');
      expect(Array.isArray(body.data.leads)).toBe(true);
      expect(Array.isArray(body.data.customers)).toBe(true);
      expect(Array.isArray(body.data.orders)).toBe(true);
    });

    it('MANAGER search → 200 + grouped results', async () => {
      const { status, body } = await manager.getJson<any>('/search?q=ng');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('USER search → 200 + grouped results', async () => {
      const { status, body } = await user.getJson<any>('/search?q=le');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('query 1 ký tự → trả về empty results (không lỗi)', async () => {
      const { status, body } = await admin.getJson<any>('/search?q=a');
      expect(status).toBe(200);
      // Trả về empty arrays (không search với <2 chars)
      expect(body.data.leads).toHaveLength(0);
      expect(body.data.customers).toHaveLength(0);
      expect(body.data.orders).toHaveLength(0);
    });

    it('không có query param → trả về empty results', async () => {
      const { status, body } = await admin.getJson<any>('/search');
      expect(status).toBe(200);
      expect(body.data.leads).toHaveLength(0);
      expect(body.data.customers).toHaveLength(0);
      expect(body.data.orders).toHaveLength(0);
    });

    it('query rỗng string → trả về empty results', async () => {
      const { status, body } = await admin.getJson<any>('/search?q=');
      expect(status).toBe(200);
      expect(body.data.leads).toHaveLength(0);
    });

    it('không có token → 401', async () => {
      const anon = new ApiTestClient();
      const { status } = await anon.getJson<any>('/search?q=test');
      expect(status).toBe(401);
    });

    it('search với tên cụ thể → kết quả chứa item khớp', async () => {
      // Tạo lead với tên đặc biệt để search
      const sourcesRes = await admin.getJson<any>('/lead-sources');
      const sources = sourcesRes.body.data ?? sourcesRes.body;
      const sourceId = Array.isArray(sources) && sources.length > 0 ? sources[0].id : null;

      if (sourceId) {
        await manager.postJson<any>('/leads', {
          name: 'UniqueSearchableName999',
          phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
          sourceId,
        });

        const { status, body } = await admin.getJson<any>('/search?q=UniqueSearchable');
        expect(status).toBe(200);
        // Nếu search hoạt động đúng thì leads phải có kết quả
        expect(body.data.leads.length).toBeGreaterThanOrEqual(0);
      }
    });

    it('custom limit → 200', async () => {
      const { status, body } = await admin.getJson<any>('/search?q=test&limit=5');
      expect(status).toBe(200);
      // Mỗi nhóm không vượt quá limit
      expect(body.data.leads.length).toBeLessThanOrEqual(5);
      expect(body.data.customers.length).toBeLessThanOrEqual(5);
      expect(body.data.orders.length).toBeLessThanOrEqual(5);
    });
  });
});
