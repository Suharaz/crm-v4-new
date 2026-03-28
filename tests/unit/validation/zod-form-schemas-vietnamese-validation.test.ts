import { describe, it, expect } from 'vitest';
import {
  leadSchema,
  customerSchema,
  userCreateSchema,
  userEditSchema,
  productSchema,
  orderSchema,
  taskSchema,
  settingsNameSchema,
  parseZodErrors,
} from '../../../apps/web/src/lib/zod-form-validation-schemas';

// ─── leadSchema ──────────────────────────────────────────────────────────────

describe('leadSchema', () => {
  it('dữ liệu hợp lệ đầy đủ', () => {
    const result = leadSchema.safeParse({
      phone: '0912345678',
      name: 'Nguyễn Văn An',
      email: 'an@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('dữ liệu hợp lệ tối thiểu (không có email)', () => {
    const result = leadSchema.safeParse({ phone: '0912345678', name: 'Nguyễn Văn An' });
    expect(result.success).toBe(true);
  });

  it('thiếu phone → lỗi tiếng Việt', () => {
    const result = leadSchema.safeParse({ name: 'Test' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.phone).toBeTruthy();
    }
  });

  it('phone sai định dạng → lỗi tiếng Việt', () => {
    const result = leadSchema.safeParse({ phone: '912345678', name: 'Test' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.phone).toMatch(/không hợp lệ/);
    }
  });

  it('phone regex /^0\\d{9,10}$/ — đúng 10 chữ số bắt đầu 0', () => {
    expect(leadSchema.safeParse({ phone: '0912345678', name: 'AA' }).success).toBe(true);
  });

  it('phone regex — 11 chữ số bắt đầu 0 cũng hợp lệ', () => {
    expect(leadSchema.safeParse({ phone: '09123456789', name: 'AA' }).success).toBe(true);
  });

  it('phone regex — bắt đầu bằng 1 → không hợp lệ', () => {
    expect(leadSchema.safeParse({ phone: '1912345678', name: 'AA' }).success).toBe(false);
  });

  it('name dưới 2 ký tự → lỗi', () => {
    const result = leadSchema.safeParse({ phone: '0912345678', name: 'A' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.name).toMatch(/ít nhất 2/);
    }
  });

  it('name vượt 100 ký tự → lỗi', () => {
    const result = leadSchema.safeParse({ phone: '0912345678', name: 'A'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('email không hợp lệ → lỗi tiếng Việt', () => {
    const result = leadSchema.safeParse({ phone: '0912345678', name: 'Test', email: 'not-an-email' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.email).toMatch(/không hợp lệ/);
    }
  });

  it('email undefined → hợp lệ (optional)', () => {
    expect(leadSchema.safeParse({ phone: '0912345678', name: 'Test' }).success).toBe(true);
  });
});

// ─── customerSchema ───────────────────────────────────────────────────────────

describe('customerSchema', () => {
  it('dữ liệu hợp lệ', () => {
    expect(customerSchema.safeParse({ phone: '0912345678', name: 'Khách Hàng A' }).success).toBe(true);
  });

  it('name rỗng → lỗi', () => {
    const result = customerSchema.safeParse({ phone: '0912345678', name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.name).toMatch(/Vui lòng/);
    }
  });
});

// ─── userCreateSchema ─────────────────────────────────────────────────────────

describe('userCreateSchema', () => {
  const validUser = {
    email: 'user@crm.com',
    password: 'matkhau123',
    name: 'Nhân Viên A',
    role: 'USER',
  };

  it('dữ liệu hợp lệ đầy đủ', () => {
    expect(userCreateSchema.safeParse(validUser).success).toBe(true);
  });

  it('email không hợp lệ → lỗi tiếng Việt', () => {
    const result = userCreateSchema.safeParse({ ...validUser, email: 'invalid' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.email).toMatch(/không hợp lệ/);
    }
  });

  it('email rỗng → lỗi nhập email', () => {
    const result = userCreateSchema.safeParse({ ...validUser, email: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.email).toMatch(/Vui lòng/);
    }
  });

  it('password dưới 8 ký tự → lỗi', () => {
    const result = userCreateSchema.safeParse({ ...validUser, password: '1234567' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.password).toMatch(/8 ký tự/);
    }
  });

  it('phone tùy chọn hợp lệ', () => {
    expect(userCreateSchema.safeParse({ ...validUser, phone: '0912345678' }).success).toBe(true);
  });

  it('phone tùy chọn không hợp lệ → lỗi', () => {
    const result = userCreateSchema.safeParse({ ...validUser, phone: '123' });
    expect(result.success).toBe(false);
  });

  it('phone undefined → hợp lệ (optional)', () => {
    expect(userCreateSchema.safeParse(validUser).success).toBe(true);
  });
});

// ─── userEditSchema ───────────────────────────────────────────────────────────

describe('userEditSchema', () => {
  const validEdit = {
    email: 'user@crm.com',
    name: 'Nhân Viên A',
    role: 'USER',
  };

  it('không có password → hợp lệ (optional khi edit)', () => {
    expect(userEditSchema.safeParse(validEdit).success).toBe(true);
  });

  it('password có giá trị nhưng dưới 8 ký tự → lỗi', () => {
    const result = userEditSchema.safeParse({ ...validEdit, password: '12345' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.password).toMatch(/8 ký tự/);
    }
  });

  it('password đủ 8 ký tự → hợp lệ', () => {
    expect(userEditSchema.safeParse({ ...validEdit, password: '12345678' }).success).toBe(true);
  });
});

// ─── productSchema ────────────────────────────────────────────────────────────

describe('productSchema', () => {
  it('sản phẩm hợp lệ', () => {
    expect(productSchema.safeParse({ name: 'Gói A', price: '500000' }).success).toBe(true);
  });

  it('tên rỗng → lỗi', () => {
    const result = productSchema.safeParse({ name: '', price: '500000' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.name).toMatch(/Vui lòng/);
    }
  });

  it('giá không phải số → lỗi', () => {
    const result = productSchema.safeParse({ name: 'Gói A', price: 'abc' });
    expect(result.success).toBe(false);
  });

  it('giá = 0 → lỗi', () => {
    const result = productSchema.safeParse({ name: 'Gói A', price: '0' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.price).toMatch(/lớn hơn 0/);
    }
  });

  it('giá âm → lỗi', () => {
    expect(productSchema.safeParse({ name: 'Gói A', price: '-100' }).success).toBe(false);
  });
});

// ─── orderSchema ──────────────────────────────────────────────────────────────

describe('orderSchema', () => {
  it('đơn hàng hợp lệ', () => {
    expect(orderSchema.safeParse({ customerId: '1', amount: '1000000' }).success).toBe(true);
  });

  it('thiếu customerId → lỗi', () => {
    const result = orderSchema.safeParse({ amount: '1000000' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.customerId).toMatch(/Vui lòng/);
    }
  });

  it('amount = 0 → lỗi', () => {
    const result = orderSchema.safeParse({ customerId: '1', amount: '0' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.amount).toMatch(/lớn hơn 0/);
    }
  });
});

// ─── taskSchema ───────────────────────────────────────────────────────────────

describe('taskSchema', () => {
  it('task hợp lệ tối thiểu', () => {
    expect(taskSchema.safeParse({ title: 'Gọi điện khách hàng' }).success).toBe(true);
  });

  it('tiêu đề rỗng → lỗi', () => {
    const result = taskSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.title).toMatch(/Vui lòng/);
    }
  });

  it('dueDate ISO string hợp lệ', () => {
    expect(taskSchema.safeParse({ title: 'Test', dueDate: '2026-12-31' }).success).toBe(true);
  });

  it('dueDate không hợp lệ → lỗi', () => {
    const result = taskSchema.safeParse({ title: 'Test', dueDate: 'not-a-date' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.dueDate).toMatch(/không hợp lệ/);
    }
  });

  it('remindAt hợp lệ', () => {
    expect(taskSchema.safeParse({ title: 'Test', remindAt: '2026-12-31T09:00:00.000Z' }).success).toBe(true);
  });
});

// ─── settingsNameSchema ───────────────────────────────────────────────────────

describe('settingsNameSchema', () => {
  it('tên hợp lệ', () => {
    expect(settingsNameSchema.safeParse({ name: 'Phòng Kinh Doanh' }).success).toBe(true);
  });

  it('tên rỗng → lỗi tiếng Việt', () => {
    const result = settingsNameSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(errors.name).toMatch(/Vui lòng/);
    }
  });
});

// ─── parseZodErrors ───────────────────────────────────────────────────────────

describe('parseZodErrors', () => {
  it('trả về map field → message đầu tiên', () => {
    const result = leadSchema.safeParse({ phone: '123', name: 'A' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      expect(typeof errors).toBe('object');
      expect(Object.keys(errors).length).toBeGreaterThan(0);
    }
  });

  it('chỉ lấy lỗi đầu tiên cho mỗi field', () => {
    const result = leadSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = parseZodErrors(result.error);
      // Mỗi field chỉ có 1 message
      Object.values(errors).forEach((msg) => expect(typeof msg).toBe('string'));
    }
  });
});
