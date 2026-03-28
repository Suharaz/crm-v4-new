/**
 * Test suite: CSV Import & Export
 * Covers: upload CSV → import job created, list jobs, check job status,
 *         export leads/customers/orders as CSV download, RBAC
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

const BASE_URL = 'http://localhost:3010/api/v1';

/** Tạo CSV buffer tối giản cho leads */
function makeLeadsCsvBuffer(): Buffer {
  const content = [
    'name,phone,source',
    'Nguyễn Văn Import,0912000100,Facebook',
    'Trần Thị Import,0912000101,Zalo',
    'Lê Văn Import,0912000102,Website',
  ].join('\n');
  return Buffer.from(content, 'utf-8');
}

/** Build FormData với file CSV */
function buildCsvFormData(filename: string, buffer: Buffer): FormData {
  const blob = new Blob([buffer], { type: 'text/csv' });
  const form = new FormData();
  form.append('file', blob, filename);
  return form;
}

describe('CSV Import & Export', () => {
  let admin: ApiTestClient;
  let manager: ApiTestClient;
  let user: ApiTestClient;
  let importJobId: string;

  beforeAll(async () => {
    [admin, manager, user] = await Promise.all([
      adminClient(),
      managerClient(),
      userClient(),
    ]);
  });

  // ── POST /imports/leads ──────────────────────────────────────────────────

  describe('POST /imports/leads — upload CSV tạo import job', () => {
    it('MANAGER upload CSV leads → 201 + import job created', async () => {
      const form = buildCsvFormData('leads.csv', makeLeadsCsvBuffer());
      const res = await manager.post('/imports/leads', { body: form, isFormData: true });
      const body = await res.json() as any;

      expect(res.status).toBe(201);
      expect(body.data.id).toBeDefined();
      expect(body.data.status).toBeDefined();
      importJobId = body.data.id;
    });

    it('SUPER_ADMIN upload CSV leads → 201', async () => {
      const form = buildCsvFormData('leads-admin.csv', makeLeadsCsvBuffer());
      const res = await admin.post('/imports/leads', { body: form, isFormData: true });
      const body = await res.json() as any;
      expect(res.status).toBe(201);
      expect(body.data.id).toBeDefined();
    });

    it('USER upload CSV → 403 (chỉ MANAGER+)', async () => {
      const form = buildCsvFormData('leads-user.csv', makeLeadsCsvBuffer());
      const res = await user.post('/imports/leads', { body: form, isFormData: true });
      expect(res.status).toBe(403);
    });

    it('upload không có file → 400', async () => {
      const res = await manager.post('/imports/leads', {
        body: { notAFile: 'test' },
      });
      expect([400, 422]).toContain(res.status);
    });

    it('upload file không phải CSV → 400', async () => {
      const txtBlob = new Blob(['not a csv'], { type: 'text/plain' });
      const form = new FormData();
      form.append('file', txtBlob, 'data.txt');
      const res = await manager.post('/imports/leads', { body: form, isFormData: true });
      expect(res.status).toBe(400);
    });
  });

  // ── GET /imports — danh sách import jobs ─────────────────────────────────

  describe('GET /imports — danh sách import jobs', () => {
    it('MANAGER lấy danh sách import jobs của mình → 200', async () => {
      const { status, body } = await manager.getJson<any>('/imports');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('SUPER_ADMIN lấy danh sách → 200', async () => {
      const { status } = await admin.getJson<any>('/imports');
      expect(status).toBe(200);
    });

    it('USER lấy danh sách → 403', async () => {
      const { status } = await user.getJson<any>('/imports');
      expect(status).toBe(403);
    });
  });

  // ── GET /imports/:id/status ───────────────────────────────────────────────

  describe('GET /imports/:id/status — kiểm tra trạng thái import job', () => {
    it('MANAGER xem status import job → 200 + status field', async () => {
      if (!importJobId) return;
      const { status, body } = await manager.getJson<any>(`/imports/${importJobId}/status`);
      expect(status).toBe(200);
      expect(body.data.status).toBeDefined();
      expect(['PROCESSING', 'COMPLETED', 'FAILED']).toContain(body.data.status);
    });

    it('ID không tồn tại → 404', async () => {
      const { status } = await admin.getJson<any>('/imports/999999999/status');
      expect(status).toBe(404);
    });
  });

  // ── GET /exports/leads ───────────────────────────────────────────────────

  describe('GET /exports/leads — download CSV leads', () => {
    it('MANAGER download leads CSV → 200 + Content-Type text/csv', async () => {
      const res = await manager.get('/exports/leads');
      expect(res.status).toBe(200);
      const contentType = res.headers.get('Content-Type') ?? '';
      expect(contentType).toContain('text/csv');
    });

    it('SUPER_ADMIN download leads CSV → 200', async () => {
      const res = await admin.get('/exports/leads');
      expect(res.status).toBe(200);
    });

    it('USER download leads CSV → 403', async () => {
      const res = await user.get('/exports/leads');
      expect(res.status).toBe(403);
    });

    it('response có Content-Disposition attachment → filename leads-export', async () => {
      const res = await manager.get('/exports/leads');
      const disposition = res.headers.get('Content-Disposition') ?? '';
      expect(disposition).toContain('attachment');
      expect(disposition).toContain('leads-export');
    });

    it('lọc theo status → 200', async () => {
      const res = await manager.get('/exports/leads?status=POOL');
      expect(res.status).toBe(200);
    });
  });

  // ── GET /exports/customers ───────────────────────────────────────────────

  describe('GET /exports/customers — download CSV customers', () => {
    it('MANAGER download customers CSV → 200 + Content-Type text/csv', async () => {
      const res = await manager.get('/exports/customers');
      expect(res.status).toBe(200);
      const contentType = res.headers.get('Content-Type') ?? '';
      expect(contentType).toContain('text/csv');
    });

    it('USER download customers CSV → 403', async () => {
      const res = await user.get('/exports/customers');
      expect(res.status).toBe(403);
    });

    it('response có Content-Disposition → customers-export', async () => {
      const res = await manager.get('/exports/customers');
      const disposition = res.headers.get('Content-Disposition') ?? '';
      expect(disposition).toContain('customers-export');
    });
  });

  // ── GET /exports/orders ──────────────────────────────────────────────────

  describe('GET /exports/orders — download CSV orders', () => {
    it('MANAGER download orders CSV → 200', async () => {
      const res = await manager.get('/exports/orders');
      expect(res.status).toBe(200);
      const contentType = res.headers.get('Content-Type') ?? '';
      expect(contentType).toContain('text/csv');
    });

    it('USER download orders CSV → 403', async () => {
      const res = await user.get('/exports/orders');
      expect(res.status).toBe(403);
    });

    it('response có Content-Disposition → orders-export', async () => {
      const res = await manager.get('/exports/orders');
      const disposition = res.headers.get('Content-Disposition') ?? '';
      expect(disposition).toContain('orders-export');
    });

    it('lọc theo customerId → 200', async () => {
      // Lấy customer ID bất kỳ
      const { body } = await manager.getJson<any>('/customers');
      const items = body.data?.items ?? body.data ?? [];
      if (items.length === 0) return;
      const custId = items[0].id;
      const res = await manager.get(`/exports/orders?customerId=${custId}`);
      expect(res.status).toBe(200);
    });
  });

  // ── POST /imports/customers ───────────────────────────────────────────────

  describe('POST /imports/customers — upload CSV customers', () => {
    it('MANAGER upload customers CSV → 201', async () => {
      const csv = ['name,phone', 'Import Customer 1,0912111001', 'Import Customer 2,0912111002'].join('\n');
      const form = new FormData();
      form.append('file', new Blob([csv], { type: 'text/csv' }), 'customers.csv');
      const res = await manager.post('/imports/customers', { body: form, isFormData: true });
      const body = await res.json() as any;
      expect(res.status).toBe(201);
      expect(body.data.id).toBeDefined();
    });
  });

  void BASE_URL; // suppress unused import
});
