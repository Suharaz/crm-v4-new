/**
 * Test suite: Customers CRUD + transfer + phone dedup + reactivate
 * Covers: CRUD, phone dedup conflict, claim, transfer DEPARTMENT/FLOATING/INACTIVE,
 *         reactivate INACTIVE→ACTIVE, manager dept permission
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('Customers CRUD, Transfer & Dedup', () => {
  let admin: ApiTestClient;
  let manager: ApiTestClient;
  let user: ApiTestClient;
  let createdCustomerId: string;
  let salesDeptId: string;

  beforeAll(async () => {
    [admin, manager, user] = await Promise.all([
      adminClient(),
      managerClient(),
      userClient(),
    ]);

    // Lấy sales department ID
    const { body: deptBody } = await admin.getJson<any>('/departments');
    const depts = deptBody.data?.items ?? deptBody.data ?? [];
    const sales = depts.find((d: any) => d.name === 'Sales');
    if (sales) salesDeptId = sales.id;
  });

  function uniquePhone(): string {
    return `09${Math.floor(10000000 + Math.random() * 89999999)}`;
  }

  // ── POST /customers ──────────────────────────────────────────────────────

  describe('POST /customers — tạo khách hàng', () => {
    it('MANAGER tạo khách hàng mới → 201', async () => {
      const phone = uniquePhone();
      const { status, body } = await manager.postJson<any>('/customers', {
        name: 'Nguyễn Văn Khách Hàng',
        phone,
        email: `customer-${Date.now()}@test.vn`,
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
      expect(body.data.phone).toBeDefined();
      createdCustomerId = body.data.id;
    });

    it('SUPER_ADMIN tạo khách hàng → 201', async () => {
      const { status, body } = await admin.postJson<any>('/customers', {
        name: 'Admin Tạo Khách',
        phone: uniquePhone(),
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
    });

    it('USER tạo khách hàng → 403', async () => {
      const { status } = await user.postJson<any>('/customers', {
        name: 'Unauthorized Customer',
        phone: uniquePhone(),
      });
      expect(status).toBe(403);
    });

    it('thiếu phone → 400', async () => {
      const { status } = await manager.postJson<any>('/customers', {
        name: 'No Phone Customer',
      });
      expect(status).toBe(400);
    });

    it('phone normalization: +84912000001 → 0912000001', async () => {
      const { status, body } = await manager.postJson<any>('/customers', {
        name: 'Phone Norm Customer',
        phone: '+84912000001',
      });
      expect(status).toBe(201);
      expect(body.data.phone).toBe('0912000001');
    });
  });

  // ── Phone dedup ──────────────────────────────────────────────────────────

  describe('Phone dedup — tạo 2 khách cùng SĐT → conflict', () => {
    it('tạo khách hàng thứ 2 với cùng SĐT → 409 hoặc 400', async () => {
      const phone = uniquePhone();

      // Tạo lần 1
      const { status: s1 } = await manager.postJson<any>('/customers', {
        name: 'Khách Hàng 1',
        phone,
      });
      expect(s1).toBe(201);

      // Tạo lần 2 cùng SĐT
      const { status: s2 } = await manager.postJson<any>('/customers', {
        name: 'Khách Hàng 2 Trùng SĐT',
        phone,
      });
      expect([400, 409]).toContain(s2);
    });
  });

  // ── GET /customers ───────────────────────────────────────────────────────

  describe('GET /customers — danh sách khách hàng', () => {
    it('SUPER_ADMIN xem danh sách → 200', async () => {
      const { status, body } = await admin.getJson<any>('/customers');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('MANAGER xem danh sách → 200', async () => {
      const { status } = await manager.getJson<any>('/customers');
      expect(status).toBe(200);
    });

    it('USER xem danh sách → 403 (chỉ MANAGER+ xem list)', async () => {
      const { status } = await user.getJson<any>('/customers');
      expect(status).toBe(403);
    });
  });

  // ── GET /customers/:id ───────────────────────────────────────────────────

  describe('GET /customers/:id — chi tiết khách hàng', () => {
    it('MANAGER xem chi tiết → 200', async () => {
      if (!createdCustomerId) return;
      const { status, body } = await manager.getJson<any>(`/customers/${createdCustomerId}`);
      expect(status).toBe(200);
      expect(body.data.id).toBe(createdCustomerId);
    });

    it('ID không tồn tại → 404', async () => {
      const { status } = await admin.getJson<any>('/customers/999999999');
      expect(status).toBe(404);
    });
  });

  // ── PATCH /customers/:id ─────────────────────────────────────────────────

  describe('PATCH /customers/:id — cập nhật thông tin', () => {
    it('MANAGER cập nhật tên khách hàng → 200', async () => {
      if (!createdCustomerId) return;
      const { status, body } = await manager.patchJson<any>(`/customers/${createdCustomerId}`, {
        name: 'Tên Khách Đã Cập Nhật',
      });
      expect(status).toBe(200);
      expect(body.data.name).toBe('Tên Khách Đã Cập Nhật');
    });
  });

  // ── POST /customers/:id/claim ────────────────────────────────────────────

  describe('POST /customers/:id/claim — nhận khách từ pool', () => {
    it('USER claim khách hàng từ pool → 200', async () => {
      // Tạo khách không có owner (status FLOATING)
      const { body: createBody } = await manager.postJson<any>('/customers', {
        name: 'Floating Customer Test',
        phone: uniquePhone(),
      });
      const custId = createBody.data.id;

      // Transfer sang FLOATING trước
      await manager.postJson<any>(`/customers/${custId}/transfer`, {
        targetType: 'FLOATING',
      });

      const { status } = await user.postJson<any>(`/customers/${custId}/claim`, {});
      expect(status).toBe(200);
    });
  });

  // ── POST /customers/:id/transfer ─────────────────────────────────────────

  describe('POST /customers/:id/transfer — chuyển khách hàng', () => {
    it('MANAGER transfer khách sang FLOATING → 200', async () => {
      if (!createdCustomerId) return;
      const { status, body } = await manager.postJson<any>(`/customers/${createdCustomerId}/transfer`, {
        targetType: 'FLOATING',
      });
      expect(status).toBe(200);
      expect(body.data.status).toBe('FLOATING');
    });

    it('MANAGER transfer khách sang phòng ban (DEPARTMENT) → 200', async () => {
      const { body: createBody } = await manager.postJson<any>('/customers', {
        name: 'Transfer Dept Customer',
        phone: uniquePhone(),
      });
      const custId = createBody.data.id;
      if (!salesDeptId) return;

      const { status } = await manager.postJson<any>(`/customers/${custId}/transfer`, {
        targetType: 'DEPARTMENT',
        targetDeptId: salesDeptId,
      });
      expect(status).toBe(200);
    });

    it('MANAGER set khách sang INACTIVE → 200', async () => {
      const { body: createBody } = await manager.postJson<any>('/customers', {
        name: 'Inactive Customer Test',
        phone: uniquePhone(),
      });
      const custId = createBody.data.id;

      const { status } = await manager.postJson<any>(`/customers/${custId}/transfer`, {
        targetType: 'INACTIVE',
      });
      expect(status).toBe(200);
    });

    it('USER không phải owner transfer → 403', async () => {
      // Tạo khách mới và assign cho manager (không phải user)
      const { body: createBody } = await manager.postJson<any>('/customers', {
        name: 'Not User Customer',
        phone: uniquePhone(),
      });
      const custId = createBody.data.id;

      const anotherUser = new ApiTestClient();
      await anotherUser.login('sale2@crm.local', 'changeme');
      const { status } = await anotherUser.postJson<any>(`/customers/${custId}/transfer`, {
        targetType: 'FLOATING',
      });
      expect([403, 400]).toContain(status);
    });
  });

  // ── POST /customers/:id/reactivate ───────────────────────────────────────

  describe('POST /customers/:id/reactivate — kích hoạt lại INACTIVE → ACTIVE', () => {
    it('MANAGER reactivate khách INACTIVE → 200, status ACTIVE', async () => {
      // Tạo và set INACTIVE
      const { body: createBody } = await manager.postJson<any>('/customers', {
        name: 'Reactivate Test Customer',
        phone: uniquePhone(),
      });
      const custId = createBody.data.id;

      await manager.postJson<any>(`/customers/${custId}/transfer`, { targetType: 'INACTIVE' });

      const { status, body } = await manager.postJson<any>(`/customers/${custId}/reactivate`, {});
      expect(status).toBe(200);
      expect(body.data.status).toBe('ACTIVE');
    });

    it('USER reactivate → 403', async () => {
      const { body: createBody } = await manager.postJson<any>('/customers', {
        name: 'No Reactivate Customer',
        phone: uniquePhone(),
      });
      const custId = createBody.data.id;
      await manager.postJson<any>(`/customers/${custId}/transfer`, { targetType: 'INACTIVE' });

      const { status } = await user.postJson<any>(`/customers/${custId}/reactivate`, {});
      expect(status).toBe(403);
    });
  });

  // ── GET /customers/search?phone ──────────────────────────────────────────

  describe('GET /customers/search?phone — tìm theo SĐT', () => {
    it('tìm theo SĐT tồn tại → trả về kết quả', async () => {
      const phone = uniquePhone();
      await manager.postJson<any>('/customers', { name: 'Search Test', phone });

      const { status, body } = await admin.getJson<any>(`/customers/search?phone=${phone}`);
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });
  });

  // ── DELETE /customers/:id ────────────────────────────────────────────────

  describe('DELETE /customers/:id — soft delete', () => {
    it('SUPER_ADMIN xóa khách hàng → 200', async () => {
      const { body: createBody } = await manager.postJson<any>('/customers', {
        name: 'To Delete Customer',
        phone: uniquePhone(),
      });
      const custId = createBody.data.id;

      const { status } = await admin.deleteJson<any>(`/customers/${custId}`);
      expect(status).toBe(200);
    });

    it('MANAGER xóa khách hàng → 403', async () => {
      const { body: createBody } = await manager.postJson<any>('/customers', {
        name: 'Manager Cannot Delete',
        phone: uniquePhone(),
      });
      const custId = createBody.data.id;

      const { status } = await manager.deleteJson<any>(`/customers/${custId}`);
      expect(status).toBe(403);
    });
  });
});
