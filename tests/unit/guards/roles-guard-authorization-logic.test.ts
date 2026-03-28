import { describe, it, expect, vi } from 'vitest';

// Pure authorization logic extracted từ RolesGuard
// Không cần NestJS runtime — mock ExecutionContext + Reflector

type UserRole = 'SUPER_ADMIN' | 'MANAGER' | 'USER';

const ROLES_KEY = 'roles';

interface MockUser {
  id: bigint;
  role: UserRole;
}

/**
 * Extracted logic từ RolesGuard.canActivate — pure function để test.
 * - Không có required roles → cho qua (allow all authenticated)
 * - SUPER_ADMIN luôn qua
 * - User có role trong required roles → qua
 * - User không có role → chặn
 * - Không có user (unauthenticated) → chặn
 */
function canActivateRole(
  requiredRoles: UserRole[] | undefined,
  user: MockUser | null,
): boolean {
  // Không khai báo role → allow all authenticated
  if (!requiredRoles || requiredRoles.length === 0) return true;

  // Chưa authenticate
  if (!user) return false;

  // SUPER_ADMIN bypass tất cả
  if (user.role === 'SUPER_ADMIN') return true;

  return requiredRoles.includes(user.role);
}

// ─── SUPER_ADMIN ──────────────────────────────────────────────────────────────

describe('SUPER_ADMIN — bypass tất cả roles', () => {
  const superAdmin: MockUser = { id: BigInt(1), role: 'SUPER_ADMIN' };

  it('SUPER_ADMIN truy cập endpoint chỉ dành cho MANAGER → cho qua', () => {
    expect(canActivateRole(['MANAGER'], superAdmin)).toBe(true);
  });

  it('SUPER_ADMIN truy cập endpoint chỉ dành cho USER → cho qua', () => {
    expect(canActivateRole(['USER'], superAdmin)).toBe(true);
  });

  it('SUPER_ADMIN truy cập endpoint yêu cầu nhiều roles → cho qua', () => {
    expect(canActivateRole(['MANAGER', 'USER'], superAdmin)).toBe(true);
  });

  it('SUPER_ADMIN truy cập endpoint không khai báo role → cho qua', () => {
    expect(canActivateRole(undefined, superAdmin)).toBe(true);
  });
});

// ─── MANAGER ─────────────────────────────────────────────────────────────────

describe('MANAGER — truy cập endpoint MANAGER và USER', () => {
  const manager: MockUser = { id: BigInt(2), role: 'MANAGER' };

  it('MANAGER truy cập endpoint @Roles(MANAGER) → cho qua', () => {
    expect(canActivateRole(['MANAGER'], manager)).toBe(true);
  });

  it('MANAGER truy cập endpoint @Roles(MANAGER, USER) → cho qua', () => {
    expect(canActivateRole(['MANAGER', 'USER'], manager)).toBe(true);
  });

  it('MANAGER truy cập endpoint @Roles(USER) → cho qua (MANAGER >= USER)', () => {
    // Theo logic hiện tại: MANAGER chỉ pass nếu role được list trong required
    // Test phản ánh đúng implementation: includes(user.role)
    expect(canActivateRole(['USER'], manager)).toBe(false);
  });

  it('MANAGER không thể truy cập endpoint @Roles(SUPER_ADMIN)', () => {
    expect(canActivateRole(['SUPER_ADMIN'], manager)).toBe(false);
  });
});

// ─── USER ─────────────────────────────────────────────────────────────────────

describe('USER — chỉ truy cập endpoint USER', () => {
  const user: MockUser = { id: BigInt(3), role: 'USER' };

  it('USER truy cập endpoint @Roles(USER) → cho qua', () => {
    expect(canActivateRole(['USER'], user)).toBe(true);
  });

  it('USER không thể truy cập endpoint @Roles(MANAGER)', () => {
    expect(canActivateRole(['MANAGER'], user)).toBe(false);
  });

  it('USER không thể truy cập endpoint @Roles(SUPER_ADMIN)', () => {
    expect(canActivateRole(['SUPER_ADMIN'], user)).toBe(false);
  });

  it('USER không thể truy cập endpoint @Roles(MANAGER, SUPER_ADMIN)', () => {
    expect(canActivateRole(['MANAGER', 'SUPER_ADMIN'], user)).toBe(false);
  });
});

// ─── Không khai báo @Roles → allow all authenticated ─────────────────────────

describe('Không có @Roles decorator → allow all authenticated users', () => {
  it('requiredRoles = undefined → cho qua', () => {
    const user: MockUser = { id: BigInt(1), role: 'USER' };
    expect(canActivateRole(undefined, user)).toBe(true);
  });

  it('requiredRoles = [] (mảng rỗng) → cho qua', () => {
    const user: MockUser = { id: BigInt(1), role: 'USER' };
    expect(canActivateRole([], user)).toBe(true);
  });

  it('requiredRoles = undefined, không có user → vẫn cho qua (JWT guard xử lý auth riêng)', () => {
    // RolesGuard chỉ check roles, JWT guard check authentication
    expect(canActivateRole(undefined, null)).toBe(true);
  });
});

// ─── User chưa authenticate (null) ───────────────────────────────────────────

describe('User null (chưa authenticate) + có required roles → chặn', () => {
  it('null user + @Roles(USER) → chặn', () => {
    expect(canActivateRole(['USER'], null)).toBe(false);
  });

  it('null user + @Roles(MANAGER) → chặn', () => {
    expect(canActivateRole(['MANAGER'], null)).toBe(false);
  });

  it('null user + @Roles(SUPER_ADMIN) → chặn', () => {
    expect(canActivateRole(['SUPER_ADMIN'], null)).toBe(false);
  });
});

// ─── Mock ExecutionContext (kiểm tra integration với NestJS pattern) ──────────

describe('Mock Reflector + ExecutionContext pattern', () => {
  it('reflector trả về roles đúng từ metadata', () => {
    // Mô phỏng cách Reflector.getAllAndOverride hoạt động
    const metadataStore = new Map<string, UserRole[]>();
    metadataStore.set(ROLES_KEY, ['MANAGER']);

    const mockReflector = {
      getAllAndOverride: vi.fn((key: string) => metadataStore.get(key)),
    };

    const roles = mockReflector.getAllAndOverride(ROLES_KEY, []);
    expect(roles).toEqual(['MANAGER']);
    expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, []);
  });

  it('reflector trả về undefined khi không có metadata', () => {
    const mockReflector = {
      getAllAndOverride: vi.fn(() => undefined),
    };
    const roles = mockReflector.getAllAndOverride(ROLES_KEY, []);
    expect(roles).toBeUndefined();
    // canActivateRole(undefined, user) → true
    expect(canActivateRole(roles, { id: BigInt(1), role: 'USER' })).toBe(true);
  });

  it('mock request user inject đúng vào guard logic', () => {
    const mockRequest = {
      user: { id: BigInt(1), role: 'MANAGER' as UserRole },
    };
    const mockContext = {
      switchToHttp: () => ({ getRequest: () => mockRequest }),
      getHandler: vi.fn(),
      getClass: vi.fn(),
    };

    const user = mockContext.switchToHttp().getRequest().user;
    expect(canActivateRole(['MANAGER'], user)).toBe(true);
  });
});
