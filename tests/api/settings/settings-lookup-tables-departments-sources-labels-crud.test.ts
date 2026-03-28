/**
 * Test suite: Settings lookup tables CRUD
 * Covers: Departments, EmployeeLevels, LeadSources, Labels, PaymentTypes, ProductCategories
 *         RBAC: SUPER_ADMIN vs MANAGER vs USER per resource
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('Settings — Lookup Tables CRUD', () => {
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

  // ── Departments ──────────────────────────────────────────────────────────

  describe('Departments (SUPER_ADMIN only)', () => {
    let deptId: string;

    it('GET /departments — tất cả authenticated user xem được → 200', async () => {
      const { status, body } = await user.getJson<any>('/departments');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('SUPER_ADMIN tạo department → 201', async () => {
      const { status, body } = await admin.postJson<any>('/departments', {
        name: `Test Dept ${Date.now()}`,
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
      deptId = body.data.id;
    });

    it('MANAGER tạo department → 403', async () => {
      const { status } = await manager.postJson<any>('/departments', {
        name: 'Manager Cannot Create Dept',
      });
      expect(status).toBe(403);
    });

    it('USER tạo department → 403', async () => {
      const { status } = await user.postJson<any>('/departments', {
        name: 'User Cannot Create Dept',
      });
      expect(status).toBe(403);
    });

    it('SUPER_ADMIN cập nhật department → 200', async () => {
      if (!deptId) return;
      const { status, body } = await admin.patchJson<any>(`/departments/${deptId}`, {
        name: 'Updated Dept Name',
      });
      expect(status).toBe(200);
      expect(body.data.name).toBe('Updated Dept Name');
    });

    it('SUPER_ADMIN xóa department → 200', async () => {
      if (!deptId) return;
      const { status } = await admin.deleteJson<any>(`/departments/${deptId}`);
      expect(status).toBe(200);
    });
  });

  // ── Employee Levels ──────────────────────────────────────────────────────

  describe('EmployeeLevels (SUPER_ADMIN only)', () => {
    let levelId: string;

    it('GET /employee-levels — authenticated user xem được → 200', async () => {
      const { status, body } = await user.getJson<any>('/employee-levels');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('SUPER_ADMIN tạo employee level → 201', async () => {
      const { status, body } = await admin.postJson<any>('/employee-levels', {
        name: `Test Level ${Date.now()}`,
        rank: 99,
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
      levelId = body.data.id;
    });

    it('MANAGER tạo employee level → 403', async () => {
      const { status } = await manager.postJson<any>('/employee-levels', {
        name: 'Manager Cannot',
        rank: 50,
      });
      expect(status).toBe(403);
    });

    it('SUPER_ADMIN cập nhật employee level → 200', async () => {
      if (!levelId) return;
      const { status } = await admin.patchJson<any>(`/employee-levels/${levelId}`, {
        name: 'Updated Level',
      });
      expect(status).toBe(200);
    });

    it('SUPER_ADMIN xóa employee level → 200', async () => {
      if (!levelId) return;
      const { status } = await admin.deleteJson<any>(`/employee-levels/${levelId}`);
      expect(status).toBe(200);
    });
  });

  // ── Lead Sources ─────────────────────────────────────────────────────────

  describe('LeadSources (SUPER_ADMIN only)', () => {
    let sourceId: string;

    it('GET /lead-sources — tất cả authenticated user xem được → 200', async () => {
      const { status, body } = await user.getJson<any>('/lead-sources');
      expect(status).toBe(200);
      // Trả về array hoặc wrapped object
      const sources = body.data ?? body;
      expect(Array.isArray(sources)).toBe(true);
    });

    it('SUPER_ADMIN tạo lead source → 201', async () => {
      const { status, body } = await admin.postJson<any>('/lead-sources', {
        name: `Test Source ${Date.now()}`,
        description: 'Nguồn lead test',
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
      sourceId = body.data.id;
    });

    it('MANAGER tạo lead source → 403', async () => {
      const { status } = await manager.postJson<any>('/lead-sources', {
        name: 'Manager Cannot',
      });
      expect(status).toBe(403);
    });

    it('SUPER_ADMIN cập nhật lead source → 200', async () => {
      if (!sourceId) return;
      const { status } = await admin.patchJson<any>(`/lead-sources/${sourceId}`, {
        name: 'Updated Source',
        isActive: true,
      });
      expect(status).toBe(200);
    });

    it('SUPER_ADMIN deactivate lead source → 200', async () => {
      if (!sourceId) return;
      const { status } = await admin.deleteJson<any>(`/lead-sources/${sourceId}`);
      expect(status).toBe(200);
    });
  });

  // ── Labels ───────────────────────────────────────────────────────────────

  describe('Labels (MANAGER+)', () => {
    let labelId: string;

    it('GET /labels — tất cả authenticated user xem được → 200', async () => {
      const { status } = await user.getJson<any>('/labels');
      expect(status).toBe(200);
    });

    it('MANAGER tạo label → 201', async () => {
      const { status, body } = await manager.postJson<any>('/labels', {
        name: `Test Label ${Date.now()}`,
        color: '#FF5733',
        category: 'lead',
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
      labelId = body.data.id;
    });

    it('SUPER_ADMIN tạo label → 201', async () => {
      const { status, body } = await admin.postJson<any>('/labels', {
        name: `Admin Label ${Date.now()}`,
        color: '#00BFFF',
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
    });

    it('USER tạo label → 403', async () => {
      const { status } = await user.postJson<any>('/labels', {
        name: 'User Cannot Create Label',
      });
      expect(status).toBe(403);
    });

    it('MANAGER cập nhật label → 200', async () => {
      if (!labelId) return;
      const { status, body } = await manager.patchJson<any>(`/labels/${labelId}`, {
        name: 'Updated Label',
        isActive: false,
      });
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });
  });

  // ── Payment Types ────────────────────────────────────────────────────────

  describe('PaymentTypes (SUPER_ADMIN only)', () => {
    let paymentTypeId: string;

    it('GET /payment-types — tất cả authenticated user xem được → 200', async () => {
      const { status } = await user.getJson<any>('/payment-types');
      expect(status).toBe(200);
    });

    it('SUPER_ADMIN tạo payment type → 201', async () => {
      const { status, body } = await admin.postJson<any>('/payment-types', {
        name: `Test Payment Type ${Date.now()}`,
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
      paymentTypeId = body.data.id;
    });

    it('MANAGER tạo payment type → 403', async () => {
      const { status } = await manager.postJson<any>('/payment-types', {
        name: 'Manager Cannot',
      });
      expect(status).toBe(403);
    });

    it('SUPER_ADMIN cập nhật payment type → 200', async () => {
      if (!paymentTypeId) return;
      const { status } = await admin.patchJson<any>(`/payment-types/${paymentTypeId}`, {
        name: 'Updated Payment Type',
      });
      expect(status).toBe(200);
    });

    it('SUPER_ADMIN xóa payment type → 200', async () => {
      if (!paymentTypeId) return;
      const { status } = await admin.deleteJson<any>(`/payment-types/${paymentTypeId}`);
      expect(status).toBe(200);
    });
  });

  // ── Product Categories ───────────────────────────────────────────────────

  describe('ProductCategories (MANAGER+)', () => {
    let catId: string;

    it('GET /product-categories — tất cả authenticated user xem được → 200', async () => {
      const { status } = await user.getJson<any>('/product-categories');
      expect(status).toBe(200);
    });

    it('MANAGER tạo product category → 201', async () => {
      const { status, body } = await manager.postJson<any>('/product-categories', {
        name: `Test Cat ${Date.now()}`,
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
      catId = body.data.id;
    });

    it('USER tạo product category → 403', async () => {
      const { status } = await user.postJson<any>('/product-categories', {
        name: 'User Cannot',
      });
      expect(status).toBe(403);
    });

    it('MANAGER cập nhật product category → 200', async () => {
      if (!catId) return;
      const { status } = await manager.patchJson<any>(`/product-categories/${catId}`, {
        name: 'Updated Category',
      });
      expect(status).toBe(200);
    });

    it('SUPER_ADMIN xóa product category → 200', async () => {
      if (!catId) return;
      const { status } = await admin.deleteJson<any>(`/product-categories/${catId}`);
      expect(status).toBe(200);
    });
  });
});
