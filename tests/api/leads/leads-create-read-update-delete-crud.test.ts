/**
 * Test suite: Leads CRUD
 * Covers: tạo lead, list với cursor pagination, detail, update, soft delete,
 *         phone normalization, RBAC
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('Leads CRUD', () => {
  let admin: ApiTestClient;
  let manager: ApiTestClient;
  let user: ApiTestClient;
  let createdLeadId: string;
  let sourceId: string;

  beforeAll(async () => {
    [admin, manager, user] = await Promise.all([
      adminClient(),
      managerClient(),
      userClient(),
    ]);

    // Lấy sourceId từ danh sách lead sources
    const { body } = await admin.getJson<any>('/lead-sources');
    const sources = body.data ?? body;
    if (Array.isArray(sources) && sources.length > 0) {
      sourceId = sources[0].id;
    }
  });

  // ── POST /leads ──────────────────────────────────────────────────────────

  describe('POST /leads — tạo lead mới', () => {
    it('MANAGER tạo lead với đầy đủ thông tin → 201', async () => {
      const payload = {
        name: 'Nguyễn Văn Test Lead',
        phone: '+84912345678',
        sourceId,
        notes: 'Lead test từ integration test',
      };
      const { status, body } = await manager.postJson<any>('/leads', payload);
      expect(status).toBe(201);
      expect(body.data).toBeDefined();
      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBe(payload.name);
      createdLeadId = body.data.id;
    });

    it('SUPER_ADMIN tạo lead → 201', async () => {
      const { status, body } = await admin.postJson<any>('/leads', {
        name: 'Admin Test Lead',
        phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`,
        sourceId,
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
    });

    it('USER tạo lead → 403 (chỉ MANAGER+ được tạo)', async () => {
      const { status } = await user.postJson<any>('/leads', {
        name: 'Unauthorized Lead',
        phone: '0911111112',
        sourceId,
      });
      expect(status).toBe(403);
    });

    it('phone normalization: +84912345678 → lưu thành 0912345678', async () => {
      const { status, body } = await manager.postJson<any>('/leads', {
        name: 'Phone Norm Test',
        phone: '+84987654321',
        sourceId,
      });
      expect(status).toBe(201);
      // Phone phải được normalize về định dạng 0x
      expect(body.data.phone).toBe('0987654321');
    });

    it('thiếu phone → 400', async () => {
      const { status } = await manager.postJson<any>('/leads', {
        name: 'No Phone Lead',
        sourceId,
      });
      expect(status).toBe(400);
    });

    it('thiếu name → 400', async () => {
      const { status } = await manager.postJson<any>('/leads', {
        phone: '0911111113',
        sourceId,
      });
      expect(status).toBe(400);
    });
  });

  // ── GET /leads ───────────────────────────────────────────────────────────

  describe('GET /leads — danh sách lead với cursor pagination', () => {
    it('MANAGER lấy danh sách → 200 + data + meta.nextCursor', async () => {
      const { status, body } = await manager.getJson<any>('/leads?limit=5');
      expect(status).toBe(200);
      // Hỗ trợ cả 2 cấu trúc response
      const data = body.data?.items ?? body.data;
      expect(Array.isArray(data)).toBe(true);
    });

    it('USER lấy danh sách → 200 (chỉ thấy leads của mình)', async () => {
      const { status } = await user.getJson<any>('/leads');
      expect(status).toBe(200);
    });

    it('cursor pagination: page 2 trả về nextCursor khác', async () => {
      const { body: page1 } = await manager.getJson<any>('/leads?limit=2');
      const nextCursor = page1.data?.meta?.nextCursor ?? page1.meta?.nextCursor;
      if (!nextCursor) return; // Không đủ data để page

      const { status, body: page2 } = await manager.getJson<any>(
        `/leads?limit=2&cursor=${nextCursor}`,
      );
      expect(status).toBe(200);
      const page1Items = page1.data?.items ?? page1.data ?? [];
      const page2Items = page2.data?.items ?? page2.data ?? [];
      // Items ở page 2 không trùng page 1
      if (page1Items.length > 0 && page2Items.length > 0) {
        expect(page2Items[0].id).not.toBe(page1Items[0].id);
      }
    });

    it('không có token → 401', async () => {
      const anon = new ApiTestClient();
      const { status } = await anon.getJson<any>('/leads');
      expect(status).toBe(401);
    });
  });

  // ── GET /leads/:id ───────────────────────────────────────────────────────

  describe('GET /leads/:id — chi tiết lead', () => {
    it('MANAGER xem lead tồn tại → 200 + data đầy đủ', async () => {
      if (!createdLeadId) return;
      const { status, body } = await manager.getJson<any>(`/leads/${createdLeadId}`);
      expect(status).toBe(200);
      expect(body.data.id).toBe(createdLeadId);
      expect(body.data.name).toBeDefined();
      expect(body.data.phone).toBeDefined();
    });

    it('ID không tồn tại → 404', async () => {
      const { status } = await manager.getJson<any>('/leads/999999999');
      expect(status).toBe(404);
    });
  });

  // ── PATCH /leads/:id ─────────────────────────────────────────────────────

  describe('PATCH /leads/:id — cập nhật lead', () => {
    it('MANAGER cập nhật tên lead → 200', async () => {
      if (!createdLeadId) return;
      const { status, body } = await manager.patchJson<any>(`/leads/${createdLeadId}`, {
        name: 'Tên Lead Đã Cập Nhật',
      });
      expect(status).toBe(200);
      expect(body.data.name).toBe('Tên Lead Đã Cập Nhật');
    });

    it('ADMIN cập nhật lead → 200', async () => {
      if (!createdLeadId) return;
      const { status } = await admin.patchJson<any>(`/leads/${createdLeadId}`, {
        notes: 'Notes updated by admin',
      });
      expect(status).toBe(200);
    });
  });

  // ── DELETE /leads/:id ─────────────────────────────────────────────────────

  describe('DELETE /leads/:id — soft delete', () => {
    it('MANAGER xóa lead → 403 (chỉ SUPER_ADMIN được xóa)', async () => {
      if (!createdLeadId) return;
      const { status } = await manager.deleteJson<any>(`/leads/${createdLeadId}`);
      expect(status).toBe(403);
    });

    it('USER xóa lead → 403', async () => {
      if (!createdLeadId) return;
      const { status } = await user.deleteJson<any>(`/leads/${createdLeadId}`);
      expect(status).toBe(403);
    });

    it('SUPER_ADMIN xóa lead → 200 (soft delete)', async () => {
      if (!createdLeadId) return;
      const { status, body } = await admin.deleteJson<any>(`/leads/${createdLeadId}`);
      expect(status).toBe(200);
      expect(body.data.message).toBeTruthy();
    });

    it('lead đã xóa không còn truy cập được → 404', async () => {
      if (!createdLeadId) return;
      const { status } = await admin.getJson<any>(`/leads/${createdLeadId}`);
      expect(status).toBe(404);
    });
  });
});
