/**
 * Shared IDOR prevention utility.
 * Builds Prisma where-clause fragments based on user role to enforce data scoping.
 *
 * Usage:
 *   const where = { ...baseWhere, ...buildAccessFilter(user, 'lead') };
 *
 * Current rules (matching existing behavior):
 *   - SUPER_ADMIN / MANAGER: no filter (sees everything)
 *   - USER: sees only data assigned to / created by them
 */
import { UserRole } from '@prisma/client';

export interface AccessFilterUser {
  id: bigint;
  role: UserRole;
  departmentId: bigint | null;
}

type EntityType = 'lead' | 'order' | 'task' | 'customer';

export function buildAccessFilter(
  user: AccessFilterUser,
  entity: EntityType,
): Record<string, unknown> {
  if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.MANAGER) {
    return {};
  }

  // USER role: scoped to own data
  switch (entity) {
    case 'lead':
      return { assignedUserId: user.id };
    case 'customer':
      return { assignedUserId: user.id };
    case 'order':
      return { createdBy: user.id };
    case 'task':
      return { OR: [{ assignedTo: user.id }, { createdBy: user.id }] };
    default:
      return {};
  }
}
