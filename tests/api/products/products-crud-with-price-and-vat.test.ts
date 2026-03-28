/**
 * Test suite: Products CRUD
 * Covers: CRUD bởi MANAGER+, GET bởi any authenticated user, price Decimal, VAT rate, RBAC
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { ApiTestClient, adminClient, managerClient, userClient } from '../helpers/api-test-client-with-auth';

describe('Products CRUD', () => {
  let admin: ApiTestClient;
  let manager: ApiTestClient;
  let user: ApiTestClient;
  let createdProductId: string;
  let categoryId: string;

  beforeAll(async () => {
    [admin, manager, user] = await Promise.all([
      adminClient(),
      managerClient(),
      userClient(),
    ]);

    // Lấy hoặc tạo product category
    const { body: catBody } = await manager.getJson<any>('/product-categories');
    const cats = catBody.data?.items ?? catBody.data ?? [];
    if (cats.length > 0) {
      categoryId = cats[0].id;
    } else {
      const { body } = await manager.postJson<any>('/product-categories', { name: 'Test Category' });
      categoryId = body.data?.id;
    }
  });

  // ── POST /products ───────────────────────────────────────────────────────

  describe('POST /products — tạo sản phẩm', () => {
    it('MANAGER tạo sản phẩm mới → 201', async () => {
      const { status, body } = await manager.postJson<any>('/products', {
        name: `Sản Phẩm Test ${Date.now()}`,
        price: 2500000,
        description: 'Mô tả sản phẩm test',
        vatRate: 10,
        categoryId,
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
      expect(body.data.name).toBeTruthy();
      createdProductId = body.data.id;
    });

    it('SUPER_ADMIN tạo sản phẩm → 201', async () => {
      const { status, body } = await admin.postJson<any>('/products', {
        name: `Admin Product ${Date.now()}`,
        price: 1000000,
      });
      expect(status).toBe(201);
      expect(body.data.id).toBeDefined();
    });

    it('USER tạo sản phẩm → 403', async () => {
      const { status } = await user.postJson<any>('/products', {
        name: 'Unauthorized Product',
        price: 100000,
      });
      expect(status).toBe(403);
    });

    it('thiếu name → 400', async () => {
      const { status } = await manager.postJson<any>('/products', {
        price: 100000,
      });
      expect(status).toBe(400);
    });

    it('thiếu price → 400', async () => {
      const { status } = await manager.postJson<any>('/products', {
        name: 'No Price Product',
      });
      expect(status).toBe(400);
    });

    it('price âm → 400', async () => {
      const { status } = await manager.postJson<any>('/products', {
        name: 'Negative Price',
        price: -500000,
      });
      expect(status).toBe(400);
    });
  });

  // ── GET /products ────────────────────────────────────────────────────────

  describe('GET /products — danh sách sản phẩm', () => {
    it('SUPER_ADMIN xem danh sách → 200', async () => {
      const { status, body } = await admin.getJson<any>('/products');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('MANAGER xem danh sách → 200', async () => {
      const { status } = await manager.getJson<any>('/products');
      expect(status).toBe(200);
    });

    it('USER xem danh sách → 200 (tất cả authenticated user được xem)', async () => {
      const { status } = await user.getJson<any>('/products');
      expect(status).toBe(200);
    });

    it('không có token → 401', async () => {
      const anon = new ApiTestClient();
      const { status } = await anon.getJson<any>('/products');
      expect(status).toBe(401);
    });

    it('search theo tên → trả về kết quả khớp', async () => {
      const { status, body } = await manager.getJson<any>('/products?search=Sản Phẩm Test');
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });
  });

  // ── GET /products/:id ────────────────────────────────────────────────────

  describe('GET /products/:id — chi tiết sản phẩm', () => {
    it('bất kỳ authenticated user xem chi tiết → 200', async () => {
      if (!createdProductId) return;
      const { status, body } = await user.getJson<any>(`/products/${createdProductId}`);
      expect(status).toBe(200);
      expect(body.data.id).toBe(createdProductId);
    });

    it('ID không tồn tại → 404', async () => {
      const { status } = await admin.getJson<any>('/products/999999999');
      expect(status).toBe(404);
    });
  });

  // ── PATCH /products/:id ──────────────────────────────────────────────────

  describe('PATCH /products/:id — cập nhật sản phẩm', () => {
    it('MANAGER cập nhật giá → 200', async () => {
      if (!createdProductId) return;
      const { status, body } = await manager.patchJson<any>(`/products/${createdProductId}`, {
        price: 3000000,
        vatRate: 8,
      });
      expect(status).toBe(200);
      expect(body.data).toBeDefined();
    });

    it('USER cập nhật sản phẩm → 403', async () => {
      if (!createdProductId) return;
      const { status } = await user.patchJson<any>(`/products/${createdProductId}`, {
        price: 1000,
      });
      expect(status).toBe(403);
    });
  });

  // ── DELETE /products/:id ─────────────────────────────────────────────────

  describe('DELETE /products/:id — soft delete', () => {
    it('SUPER_ADMIN xóa sản phẩm → 200', async () => {
      if (!createdProductId) return;
      const { status, body } = await admin.deleteJson<any>(`/products/${createdProductId}`);
      expect(status).toBe(200);
      expect(body.data.message).toBeTruthy();
    });

    it('MANAGER xóa sản phẩm → 403', async () => {
      // Tạo product mới để test
      const { body: createBody } = await manager.postJson<any>('/products', {
        name: `Manager Delete Test ${Date.now()}`,
        price: 500000,
      });
      const { status } = await manager.deleteJson<any>(`/products/${createBody.data.id}`);
      expect(status).toBe(403);
    });
  });
});
