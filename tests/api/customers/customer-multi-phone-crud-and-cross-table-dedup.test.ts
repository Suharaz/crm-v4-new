/**
 * Test suite: Customer Multi-Phone CRUD + cross-table dedup + role gates
 * Covers: GET/POST/PATCH/DELETE /customers/:id/phones, RBAC,
 *         cross-table dedup (số chính KH A vs số phụ KH B vice versa),
 *         search by alt phone, third-party-api findOrCreate by alt.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('Customer Multi-Phone — CRUD + cross-table dedup', () => {
  let admin: ApiTestClient;
  let manager: ApiTestClient;
  let user: ApiTestClient;

  // Customer A — sẽ có số phụ
  let customerAId: string;
  let customerAPhone: string;
  // Customer B — dùng để test dedup ngược
  let customerBId: string;
  // ID của 1 số phụ active để PATCH/DELETE
  let altPhoneId: string;
  // SĐT phụ của customer A
  const altPhoneOfA = uniquePhone();

  function uniquePhone(): string {
    return `09${Math.floor(10000000 + Math.random() * 89999999)}`;
  }

  beforeAll(async () => {
    [admin, manager, user] = await Promise.all([
      adminClient(),
      managerClient(),
      userClient(),
    ]);

    customerAPhone = uniquePhone();
    const { status: sa, body: ba } = await manager.postJson<any>('/customers', {
      name: 'KH A — multi-phone',
      phone: customerAPhone,
    });
    expect(sa).toBe(201);
    customerAId = ba.data.id;

    const { status: sb, body: bb } = await manager.postJson<any>('/customers', {
      name: 'KH B — control',
      phone: uniquePhone(),
    });
    expect(sb).toBe(201);
    customerBId = bb.data.id;
  });

  // ── POST /customers/:id/phones ────────────────────────────────────────

  describe('POST /customers/:id/phones', () => {
    it('MANAGER thêm số phụ → 201', async () => {
      const { status, body } = await manager.postJson<any>(
        `/customers/${customerAId}/phones`,
        { phone: altPhoneOfA, label: 'Vợ', note: 'Số nhà' },
      );
      expect(status).toBe(201);
      expect(body.data.phone).toBe(altPhoneOfA);
      expect(body.data.label).toBe('Vợ');
      altPhoneId = body.data.id;
    });

    it('SUPER_ADMIN thêm số phụ → 201', async () => {
      const { status } = await admin.postJson<any>(
        `/customers/${customerAId}/phones`,
        { phone: uniquePhone(), label: 'Thư ký' },
      );
      expect(status).toBe(201);
    });

    it('USER (sale) thêm số phụ → 403', async () => {
      const { status } = await user.postJson<any>(
        `/customers/${customerAId}/phones`,
        { phone: uniquePhone() },
      );
      expect(status).toBe(403);
    });

    it('SĐT format không hợp lệ → 400/409', async () => {
      const { status } = await manager.postJson<any>(
        `/customers/${customerAId}/phones`,
        { phone: '12345' },
      );
      expect([400, 409]).toContain(status);
    });

    it('SĐT trùng số chính KH khác → 409', async () => {
      // dùng số chính của KH A
      const { status } = await manager.postJson<any>(
        `/customers/${customerBId}/phones`,
        { phone: customerAPhone },
      );
      expect(status).toBe(409);
    });

    it('SĐT trùng số phụ KH khác → 409', async () => {
      // số phụ vừa thêm cho KH A → giờ thêm cho KH B
      const { status } = await manager.postJson<any>(
        `/customers/${customerBId}/phones`,
        { phone: altPhoneOfA },
      );
      expect(status).toBe(409);
    });
  });

  // ── Cross-table dedup khi tạo customer mới ──────────────────────────────

  describe('Cross-table dedup khi tạo customer mới', () => {
    it('Tạo customer với phone = số phụ KH cũ → 409', async () => {
      const { status } = await manager.postJson<any>('/customers', {
        name: 'KH C — trùng số phụ KH A',
        phone: altPhoneOfA,
      });
      expect(status).toBe(409);
    });
  });

  // ── GET /customers/:id/phones ─────────────────────────────────────────

  describe('GET /customers/:id/phones', () => {
    it('MANAGER list số phụ → 200', async () => {
      const { status, body } = await manager.getJson<any>(`/customers/${customerAId}/phones`);
      expect(status).toBe(200);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThanOrEqual(2);
    });

    it('GET /customers/:id include phones', async () => {
      const { status, body } = await admin.getJson<any>(`/customers/${customerAId}`);
      expect(status).toBe(200);
      expect(Array.isArray(body.data.phones)).toBe(true);
      expect(body.data.phones.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ── PATCH /customers/:id/phones/:phoneId ─────────────────────────────

  describe('PATCH /customers/:id/phones/:phoneId', () => {
    it('MANAGER cập nhật label → 200', async () => {
      const { status, body } = await manager.patchJson<any>(
        `/customers/${customerAId}/phones/${altPhoneId}`,
        { label: 'Vợ (đã đổi)' },
      );
      expect(status).toBe(200);
      expect(body.data.label).toBe('Vợ (đã đổi)');
    });

    it('USER cập nhật → 403', async () => {
      const { status } = await user.patchJson<any>(
        `/customers/${customerAId}/phones/${altPhoneId}`,
        { label: 'hack' },
      );
      expect(status).toBe(403);
    });
  });

  // ── Search by alt phone ───────────────────────────────────────────────

  describe('Search match số phụ', () => {
    it('GET /customers/search?phone=<altPhone> → trả KH A', async () => {
      const { status, body } = await manager.getJson<any>(
        `/customers/search?phone=${altPhoneOfA}`,
      );
      expect(status).toBe(200);
      const ids = (body.data ?? []).map((c: any) => c.id);
      expect(ids).toContain(customerAId);
    });
  });

  // ── DELETE /customers/:id/phones/:phoneId ────────────────────────────

  describe('DELETE /customers/:id/phones/:phoneId', () => {
    it('USER xóa → 403', async () => {
      const { status } = await user.deleteJson<any>(
        `/customers/${customerAId}/phones/${altPhoneId}`,
      );
      expect(status).toBe(403);
    });

    it('MANAGER soft-delete → 200', async () => {
      const { status } = await manager.deleteJson<any>(
        `/customers/${customerAId}/phones/${altPhoneId}`,
      );
      expect(status).toBe(200);
    });

    it('Sau khi xóa: số đó không còn trong list', async () => {
      const { body } = await manager.getJson<any>(`/customers/${customerAId}/phones`);
      const ids = body.data.map((p: any) => p.id);
      expect(ids).not.toContain(altPhoneId);
    });

    it('Sau khi xóa: có thể tái sử dụng số đó cho KH khác', async () => {
      const { status } = await manager.postJson<any>(
        `/customers/${customerBId}/phones`,
        { phone: altPhoneOfA, label: 'reuse OK' },
      );
      expect(status).toBe(201);
    });
  });
});
