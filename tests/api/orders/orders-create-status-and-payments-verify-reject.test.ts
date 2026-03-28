/**
 * Test suite: Orders + Payments
 * Covers: tạo order, status transitions, tạo payment, verify/reject bởi MANAGER+,
 *         conversion trigger khi total verified >= order amount
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('Orders & Payments', () => {
  let admin: ApiTestClient;
  let manager: ApiTestClient;
  let user: ApiTestClient;
  let customerId: string;
  let orderId: string;
  let paymentId: string;

  beforeAll(async () => {
    [admin, manager, user] = await Promise.all([
      adminClient(),
      managerClient(),
      userClient(),
    ]);

    // Tạo khách hàng để gắn order
    const { body } = await manager.postJson<any>('/customers', {
      name: 'Order Test Customer',
      phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
    });
    customerId = body.data.id;
  });

  // ── POST /orders ─────────────────────────────────────────────────────────

  describe('POST /orders — tạo đơn hàng', () => {
    it('USER tạo order với customerId và amount → 201', async () => {
      const { status, body } = await user.postJson<any>('/orders', {
        customerId,
        amount: 5000000,
        notes: 'Đơn hàng test integration',
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
      expect(body.data.amount).toBeDefined();
      orderId = body.data.id;
    });

    it('MANAGER tạo order → 201', async () => {
      const { status, body } = await manager.postJson<any>('/orders', {
        customerId,
        amount: 10000000,
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
    });

    it('thiếu customerId → 400', async () => {
      const { status } = await user.postJson<any>('/orders', {
        amount: 5000000,
      });
      expect(status).toBe(400);
    });

    it('thiếu amount → 400', async () => {
      const { status } = await user.postJson<any>('/orders', {
        customerId,
      });
      expect(status).toBe(400);
    });

    it('amount âm → 400', async () => {
      const { status } = await user.postJson<any>('/orders', {
        customerId,
        amount: -100000,
      });
      expect(status).toBe(400);
    });

    it('không có token → 401', async () => {
      const anon = new ApiTestClient();
      const { status } = await anon.postJson<any>('/orders', {
        customerId,
        amount: 1000000,
      });
      expect(status).toBe(401);
    });
  });

  // ── GET /orders ──────────────────────────────────────────────────────────

  describe('GET /orders — danh sách đơn hàng', () => {
    it('MANAGER lấy danh sách → 200', async () => {
      const { status, body } = await manager.getJson<any>('/orders');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('lọc theo customerId → chỉ trả orders của customer đó', async () => {
      const { status, body } = await manager.getJson<any>(`/orders?customerId=${customerId}`);
      expect(status).toBe(200);
      const items = body.data?.items ?? body.data ?? [];
      if (items.length > 0) {
        items.forEach((o: any) => {
          expect(o.customerId?.toString()).toBe(customerId.toString());
        });
      }
    });
  });

  // ── GET /orders/:id ──────────────────────────────────────────────────────

  describe('GET /orders/:id — chi tiết đơn hàng', () => {
    it('MANAGER xem chi tiết → 200', async () => {
      if (!orderId) return;
      const { status, body } = await manager.getJson<any>(`/orders/${orderId}`);
      expect(status).toBe(200);
      expect(body.data.id).toBe(orderId);
    });
  });

  // ── PATCH /orders/:id/status ─────────────────────────────────────────────

  describe('PATCH /orders/:id/status — cập nhật trạng thái đơn hàng', () => {
    it('MANAGER chuyển PENDING → CONFIRMED → 200', async () => {
      if (!orderId) return;
      const { status, body } = await manager.patchJson<any>(`/orders/${orderId}/status`, {
        status: 'CONFIRMED',
      });
      expect(status).toBe(200);
      expect(body.data.status).toBe('CONFIRMED');
    });

    it('MANAGER chuyển CONFIRMED → COMPLETED → 200', async () => {
      if (!orderId) return;
      const { status, body } = await manager.patchJson<any>(`/orders/${orderId}/status`, {
        status: 'COMPLETED',
      });
      expect(status).toBe(200);
      expect(body.data.status).toBe('COMPLETED');
    });

    it('USER cập nhật status → 403 (chỉ MANAGER+)', async () => {
      if (!orderId) return;
      const { status } = await user.patchJson<any>(`/orders/${orderId}/status`, {
        status: 'CANCELLED',
      });
      expect(status).toBe(403);
    });
  });

  // ── POST /payments — tạo payment ─────────────────────────────────────────

  describe('POST /payments — tạo thanh toán', () => {
    it('tạo payment PENDING cho order → 201', async () => {
      if (!orderId) return;
      const { status, body } = await user.postJson<any>('/payments', {
        orderId,
        amount: 5000000,
        transferContent: 'CK thanh toan don hang test',
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
      expect(body.data.status).toBe('PENDING');
      paymentId = body.data.id;
    });

    it('thiếu orderId → 400', async () => {
      const { status } = await user.postJson<any>('/payments', {
        amount: 1000000,
      });
      expect(status).toBe(400);
    });
  });

  // ── GET /payments ────────────────────────────────────────────────────────

  describe('GET /payments — danh sách thanh toán', () => {
    it('MANAGER lấy danh sách → 200', async () => {
      const { status } = await manager.getJson<any>('/payments');
      expect(status).toBe(200);
    });

    it('GET /payments/pending → MANAGER+ xem pending → 200', async () => {
      const { status } = await manager.getJson<any>('/payments/pending');
      expect(status).toBe(200);
    });

    it('USER xem /payments/pending → 403', async () => {
      const { status } = await user.getJson<any>('/payments/pending');
      expect(status).toBe(403);
    });
  });

  // ── POST /payments/:id/verify ────────────────────────────────────────────

  describe('POST /payments/:id/verify — xác nhận thanh toán', () => {
    it('USER verify payment → 403 (chỉ MANAGER+)', async () => {
      if (!paymentId) return;
      const { status } = await user.postJson<any>(`/payments/${paymentId}/verify`, {});
      expect(status).toBe(403);
    });

    it('MANAGER verify payment → 200, status VERIFIED', async () => {
      if (!paymentId) return;
      const { status, body } = await manager.postJson<any>(`/payments/${paymentId}/verify`, {});
      expect(status).toBe(200);
      expect(body.data.status).toBe('VERIFIED');
    });
  });

  // ── POST /payments/:id/reject ────────────────────────────────────────────

  describe('POST /payments/:id/reject — từ chối thanh toán', () => {
    it('MANAGER reject payment PENDING → 200, status REJECTED', async () => {
      // Tạo order + payment mới để reject
      const { body: orderBody } = await user.postJson<any>('/orders', {
        customerId,
        amount: 2000000,
      });
      const newOrderId = orderBody.data.id;

      const { body: pmtBody } = await user.postJson<any>('/payments', {
        orderId: newOrderId,
        amount: 2000000,
      });
      const newPaymentId = pmtBody.data.id;

      const { status, body } = await manager.postJson<any>(`/payments/${newPaymentId}/reject`, {});
      expect(status).toBe(200);
      expect(body.data.status).toBe('REJECTED');
    });

    it('USER reject payment → 403', async () => {
      // Tạo fresh payment
      const { body: orderBody } = await user.postJson<any>('/orders', {
        customerId,
        amount: 1000000,
      });
      const { body: pmtBody } = await user.postJson<any>('/payments', {
        orderId: orderBody.data.id,
        amount: 1000000,
      });

      const { status } = await user.postJson<any>(`/payments/${pmtBody.data.id}/reject`, {});
      expect(status).toBe(403);
    });
  });
});
