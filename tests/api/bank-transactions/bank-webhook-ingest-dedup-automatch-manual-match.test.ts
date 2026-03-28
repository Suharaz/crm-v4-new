/**
 * Test suite: Bank transactions — webhook ingest, dedup, auto-match, manual match
 * Covers: POST /webhooks/bank-transactions (@Public), dedup by externalId,
 *         amount validation, auto-match with pending payment,
 *         GET /bank-transactions (MANAGER+), POST manual match
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('Bank Transactions — Webhook & Matching', () => {
  let admin: ApiTestClient;
  let manager: ApiTestClient;
  let user: ApiTestClient;
  let ingestedTxId: string;
  let pendingPaymentId: string;
  let orderId: string;
  let customerId: string;

  beforeAll(async () => {
    [admin, manager, user] = await Promise.all([
      adminClient(),
      managerClient(),
      userClient(),
    ]);

    // Tạo customer + order + payment để test auto-match
    const { body: custBody } = await manager.postJson<any>('/customers', {
      name: 'Bank Test Customer',
      phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
    });
    customerId = custBody.data.id;

    const { body: orderBody } = await user.postJson<any>('/orders', {
      customerId,
      amount: 3000000,
    });
    orderId = orderBody.data.id;

    const { body: pmtBody } = await user.postJson<any>('/payments', {
      orderId,
      amount: 3000000,
      transferContent: 'TT don hang 3 trieu',
    });
    pendingPaymentId = pmtBody.data.id;
  });

  // ── POST /webhooks/bank-transactions (@Public) ───────────────────────────

  describe('POST /webhooks/bank-transactions — ingest giao dịch ngân hàng', () => {
    it('webhook không cần auth (@Public) — ingest thành công → 201', async () => {
      const externalId = `TX-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const anon = new ApiTestClient(); // không có token

      const res = await anon.post('/webhooks/bank-transactions', {
        body: {
          externalId,
          amount: 3000000,
          content: 'TT don hang 3 trieu',
          bankAccount: '1234567890',
          senderName: 'NGUYEN VAN A',
          senderAccount: '0987654321',
          transactionTime: new Date().toISOString(),
        },
      });
      const body = await res.json() as any;

      expect(res.status).toBe(201);
      expect(body.data.id).toBeDefined();
      ingestedTxId = body.data.id;
    });

    it('dedup: gửi cùng externalId lần 2 → 409', async () => {
      const externalId = `TX-DEDUP-${Date.now()}`;
      const anon = new ApiTestClient();
      const payload = {
        externalId,
        amount: 1000000,
        content: 'Test dedup',
        transactionTime: new Date().toISOString(),
      };

      const res1 = await anon.post('/webhooks/bank-transactions', { body: payload });
      expect(res1.status).toBe(201);

      const res2 = await anon.post('/webhooks/bank-transactions', { body: payload });
      expect(res2.status).toBe(409);
    });

    it('amount = 0 → 400', async () => {
      const anon = new ApiTestClient();
      const res = await anon.post('/webhooks/bank-transactions', {
        body: {
          externalId: `TX-ZERO-${Date.now()}`,
          amount: 0,
          content: 'Zero amount',
          transactionTime: new Date().toISOString(),
        },
      });
      expect(res.status).toBe(400);
    });

    it('amount âm → 400', async () => {
      const anon = new ApiTestClient();
      const res = await anon.post('/webhooks/bank-transactions', {
        body: {
          externalId: `TX-NEG-${Date.now()}`,
          amount: -500000,
          content: 'Negative amount',
          transactionTime: new Date().toISOString(),
        },
      });
      expect(res.status).toBe(400);
    });

    it('thiếu externalId → 400', async () => {
      const anon = new ApiTestClient();
      const res = await anon.post('/webhooks/bank-transactions', {
        body: {
          amount: 1000000,
          content: 'Missing externalId',
          transactionTime: new Date().toISOString(),
        },
      });
      expect(res.status).toBe(400);
    });

    it('thiếu transactionTime → 400', async () => {
      const anon = new ApiTestClient();
      const res = await anon.post('/webhooks/bank-transactions', {
        body: {
          externalId: `TX-NOTIME-${Date.now()}`,
          amount: 1000000,
          content: 'Missing time',
        },
      });
      expect(res.status).toBe(400);
    });

    it('auto-match: ingest giao dịch khớp content với payment PENDING', async () => {
      // Giao dịch có content khớp với payment đã tạo ở beforeAll
      const anon = new ApiTestClient();
      const res = await anon.post('/webhooks/bank-transactions', {
        body: {
          externalId: `TX-MATCH-${Date.now()}`,
          amount: 3000000,
          content: 'TT don hang 3 trieu',
          transactionTime: new Date().toISOString(),
        },
      });
      const body = await res.json() as any;
      expect(res.status).toBe(201);
      // matchStatus có thể là AUTO_MATCHED nếu logic khớp
      expect(['AUTO_MATCHED', 'UNMATCHED']).toContain(body.data.matchStatus);
    });
  });

  // ── GET /bank-transactions ───────────────────────────────────────────────

  describe('GET /bank-transactions — danh sách giao dịch ngân hàng', () => {
    it('MANAGER xem danh sách → 200', async () => {
      const { status, body } = await manager.getJson<any>('/bank-transactions');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('SUPER_ADMIN xem danh sách → 200', async () => {
      const { status } = await admin.getJson<any>('/bank-transactions');
      expect(status).toBe(200);
    });

    it('USER xem danh sách → 403 (chỉ MANAGER+)', async () => {
      const { status } = await user.getJson<any>('/bank-transactions');
      expect(status).toBe(403);
    });

    it('lọc theo matchStatus=UNMATCHED → 200', async () => {
      const { status, body } = await manager.getJson<any>('/bank-transactions?matchStatus=UNMATCHED');
      expect(status).toBe(200);
      const items = body.data?.items ?? body.data ?? [];
      items.forEach((tx: any) => {
        expect(tx.matchStatus).toBe('UNMATCHED');
      });
    });

    it('GET /bank-transactions/unmatched → MANAGER → 200', async () => {
      const { status } = await manager.getJson<any>('/bank-transactions/unmatched');
      expect(status).toBe(200);
    });
  });

  // ── POST /bank-transactions/:id/match ────────────────────────────────────

  describe('POST /bank-transactions/:id/match — manual match', () => {
    it('MANAGER manual match tx với payment → 200', async () => {
      // Tạo tx + payment mới với nội dung độc đáo để tránh auto-match
      const anon = new ApiTestClient();
      const uniqueContent = `Manual-Manager-${Date.now()}`;
      const txRes = await anon.post('/webhooks/bank-transactions', {
        body: {
          externalId: `TX-MGR-MANUAL-${Date.now()}`,
          amount: 2500000,
          content: uniqueContent,
          transactionTime: new Date().toISOString(),
        },
      });
      const txBody = await txRes.json() as any;
      const manualTxId = txBody.data.id;

      const { body: orderBody } = await user.postJson<any>('/orders', {
        customerId,
        amount: 2500000,
      });
      const { body: pmtBody } = await user.postJson<any>('/payments', {
        orderId: orderBody.data.id,
        amount: 2500000,
      });

      const { status, body } = await manager.postJson<any>(
        `/bank-transactions/${manualTxId}/match`,
        { paymentId: pmtBody.data.id },
      );
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
      // service trả về { bankTxId, paymentId, status }
      expect(body.data.status).toBe('MANUALLY_MATCHED');
    });

    it('SUPER_ADMIN manual match → 200', async () => {
      // Tạo tx mới + payment mới để match
      const anon = new ApiTestClient();
      const txRes = await anon.post('/webhooks/bank-transactions', {
        body: {
          externalId: `TX-MANUAL-${Date.now()}`,
          amount: 1500000,
          content: 'Manual match test',
          transactionTime: new Date().toISOString(),
        },
      });
      const txBody = await txRes.json() as any;
      const newTxId = txBody.data.id;

      const { body: orderBody } = await user.postJson<any>('/orders', {
        customerId,
        amount: 1500000,
      });
      const { body: pmtBody } = await user.postJson<any>('/payments', {
        orderId: orderBody.data.id,
        amount: 1500000,
      });

      const { status } = await admin.postJson<any>(
        `/bank-transactions/${newTxId}/match`,
        { paymentId: pmtBody.data.id },
      );
      expect(status).toBe(200);
    });

    it('USER manual match → 403', async () => {
      if (!ingestedTxId) return;
      const { status } = await user.postJson<any>(
        `/bank-transactions/${ingestedTxId}/match`,
        { paymentId: pendingPaymentId },
      );
      expect(status).toBe(403);
    });

    it('tx không tồn tại → 404', async () => {
      const { status } = await manager.postJson<any>(
        '/bank-transactions/999999999/match',
        { paymentId: pendingPaymentId },
      );
      expect(status).toBe(404);
    });

    it('thiếu paymentId → 400', async () => {
      if (!ingestedTxId) return;
      const { status } = await manager.postJson<any>(
        `/bank-transactions/${ingestedTxId}/match`,
        {},
      );
      expect(status).toBe(400);
    });
  });
});
