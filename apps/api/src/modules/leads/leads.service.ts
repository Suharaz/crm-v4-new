import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaClient, Prisma, LeadStatus, UserRole } from '@prisma/client';
import { normalizePhone, isValidVNPhone } from '@crm/utils';
import { CreateLeadDto } from './dto/create-lead.dto';
import { LeadListQueryDto } from './dto/lead-list-query.dto';

// Valid status transitions
const ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  POOL: ['ASSIGNED', 'FLOATING'],
  ZOOM: ['ASSIGNED', 'POOL', 'FLOATING'], // Kho Zoom: có thể assign, chuyển pool, hoặc thả nổi
  ASSIGNED: ['IN_PROGRESS', 'POOL', 'FLOATING'],
  IN_PROGRESS: ['CONVERTED', 'LOST', 'POOL', 'FLOATING'],
  CONVERTED: [], // terminal
  LOST: ['FLOATING'], // LOST → FLOATING (kho thả nổi)
  FLOATING: ['ASSIGNED'], // claim
};

const LEAD_SELECT = {
  id: true, phone: true, name: true, email: true, status: true,
  customerId: true, productId: true, sourceId: true,
  assignedUserId: true, departmentId: true,
  metadata: true, createdAt: true, updatedAt: true,
  customer: { select: { id: true, name: true, phone: true } },
  product: { select: { id: true, name: true, price: true } },
  source: { select: { id: true, name: true } },
  assignedUser: { select: { id: true, name: true } },
  department: { select: { id: true, name: true } },
  labels: { include: { label: true } },
  orders: { where: { status: 'COMPLETED' }, select: { id: true }, take: 1 },
} satisfies Prisma.LeadSelect;

interface CurrentUser {
  id: bigint;
  role: UserRole;
  departmentId: bigint | null;
}

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaClient) {}

  // ── List with filters + role-based access ────────────────────────────────
  async list(query: LeadListQueryDto, user?: CurrentUser) {
    const limit = query.limit ?? 20;
    const where: Prisma.LeadWhereInput = { deletedAt: null };

    // USER role: only sees leads assigned to them
    if (user && user.role === UserRole.USER) {
      where.assignedUserId = user.id;
    }

    if (query.status) where.status = query.status;
    if (query.sourceId) where.sourceId = BigInt(query.sourceId);
    if (query.productId) where.productId = BigInt(query.productId);
    // Only allow assignedUserId filter override for manager+
    if (query.assignedUserId && (!user || user.role !== UserRole.USER)) {
      where.assignedUserId = BigInt(query.assignedUserId);
    }
    if (query.departmentId) where.departmentId = BigInt(query.departmentId);
    if (query.labelId) where.labels = { some: { labelId: BigInt(query.labelId) } };
    if (query.hasOrder === 'true') where.orders = { some: { status: 'COMPLETED' } };
    if (query.hasOrder === 'false') where.orders = { none: { status: 'COMPLETED' } };
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) (where.createdAt as any).gte = new Date(query.dateFrom);
      if (query.dateTo) (where.createdAt as any).lte = new Date(query.dateTo + 'T23:59:59Z');
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const leads = await this.prisma.lead.findMany({
      where, select: LEAD_SELECT,
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });

    const hasMore = leads.length > limit;
    const data = hasMore ? leads.slice(0, limit) : leads;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  // ── My department pool (for USER role) ──────────────────────────────────
  async myDeptPool(user: CurrentUser, limit: number, cursor?: string) {
    if (!user.departmentId) return { data: [], meta: {} };
    return this.poolDepartment(user.departmentId, limit, cursor);
  }

  // ── 3 Kho Pool Endpoints ────────────────────────────────────────────────
  async poolNew(query: LeadListQueryDto) {
    return this.list({ ...query, status: LeadStatus.POOL, departmentId: undefined, assignedUserId: undefined });
  }

  async poolNewFiltered(limit: number, cursor?: string) {
    // Kho Mới: POOL + dept=null
    const take = (limit ?? 20) + 1;
    const leads = await this.prisma.lead.findMany({
      where: { status: 'POOL', departmentId: null, deletedAt: null },
      select: LEAD_SELECT, orderBy: { id: 'desc' }, take,
      ...(cursor ? { skip: 1, cursor: { id: BigInt(cursor) } } : {}),
    });
    const hasMore = leads.length > (limit ?? 20);
    const data = hasMore ? leads.slice(0, limit ?? 20) : leads;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async poolZoom(limit: number, cursor?: string) {
    // Kho Zoom: ZOOM status, chưa assign
    const take = (limit ?? 20) + 1;
    const leads = await this.prisma.lead.findMany({
      where: { status: 'ZOOM', deletedAt: null },
      select: LEAD_SELECT, orderBy: { id: 'desc' }, take,
      ...(cursor ? { skip: 1, cursor: { id: BigInt(cursor) } } : {}),
    });
    const hasMore = leads.length > (limit ?? 20);
    const data = hasMore ? leads.slice(0, limit ?? 20) : leads;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async poolDepartment(deptId: bigint, limit: number, cursor?: string) {
    const take = (limit ?? 20) + 1;
    const leads = await this.prisma.lead.findMany({
      where: { status: 'POOL', departmentId: deptId, assignedUserId: null, deletedAt: null },
      select: LEAD_SELECT, orderBy: { id: 'desc' }, take,
      ...(cursor ? { skip: 1, cursor: { id: BigInt(cursor) } } : {}),
    });
    const hasMore = leads.length > (limit ?? 20);
    const data = hasMore ? leads.slice(0, limit ?? 20) : leads;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async poolFloating(limit: number, cursor?: string) {
    const take = (limit ?? 20) + 1;
    const leads = await this.prisma.lead.findMany({
      where: { status: 'FLOATING', deletedAt: null },
      select: LEAD_SELECT, orderBy: { id: 'desc' }, take,
      ...(cursor ? { skip: 1, cursor: { id: BigInt(cursor) } } : {}),
    });
    const hasMore = leads.length > (limit ?? 20);
    const data = hasMore ? leads.slice(0, limit ?? 20) : leads;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  // ── Find by ID ──────────────────────────────────────────────────────────
  async findById(id: bigint) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, deletedAt: null },
      select: LEAD_SELECT,
    });
    if (!lead) throw new NotFoundException('Không tìm thấy lead');
    return lead;
  }

  // ── Create ──────────────────────────────────────────────────────────────
  async create(dto: CreateLeadDto, user: CurrentUser) {
    const phone = normalizePhone(dto.phone);
    if (!isValidVNPhone(phone)) throw new BadRequestException('Số điện thoại không hợp lệ');

    // Find or create customer by phone + gather duplicate info
    let customer = await this.prisma.customer.findFirst({
      where: { phone, deletedAt: null },
      include: { labels: { select: { labelId: true } } },
    });
    const isDuplicate = !!customer;
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { phone, name: dto.name || phone, email: dto.email },
        include: { labels: { select: { labelId: true } } },
      });
    }

    // Check if source has skipPool flag → auto-distribute instead of pool
    let skipPool = false;
    if (dto.sourceId) {
      const source = await this.prisma.leadSource.findFirst({
        where: { id: BigInt(dto.sourceId) },
        select: { skipPool: true },
      });
      skipPool = source?.skipPool ?? false;
    }

    // skipPool → status ZOOM (kho zoom riêng), otherwise POOL (Kho Mới)
    const lead = await this.prisma.lead.create({
      data: {
        phone, name: dto.name || phone, email: dto.email,
        status: skipPool ? 'ZOOM' : 'POOL',
        customer: { connect: { id: customer.id } },
        ...(dto.sourceId ? { source: { connect: { id: BigInt(dto.sourceId) } } } : {}),
        ...(dto.productId ? { product: { connect: { id: BigInt(dto.productId) } } } : {}),
      },
      select: LEAD_SELECT,
    });

    // Merge labels from customer → new lead (if customer already has labels)
    if (isDuplicate && customer.labels?.length > 0) {
      await this.prisma.leadLabel.createMany({
        data: customer.labels.map((cl: any) => ({ leadId: lead.id, labelId: cl.labelId })),
        skipDuplicates: true,
      });
    }

    // Return lead with duplicate warning
    const result = await this.findById(lead.id);
    if (isDuplicate) {
      (result as any)._warning = {
        type: 'DUPLICATE_PHONE',
        message: `SĐT ${phone} đã tồn tại — ${customer.name || 'khách hàng'}`,
        existingCustomerId: customer.id.toString(),
        existingName: customer.name,
      };
    }
    return result;
  }

  // ── Update ──────────────────────────────────────────────────────────────
  async update(id: bigint, data: Record<string, unknown>, user: CurrentUser) {
    await this.findById(id);

    // Phone field-level permission
    if (data.phone && !([UserRole.SUPER_ADMIN, UserRole.MANAGER] as UserRole[]).includes(user.role)) {
      throw new ForbiddenException('Chỉ quản lý mới được sửa số điện thoại');
    }

    const updateData: Prisma.LeadUpdateInput = {};
    if (data.name) updateData.name = data.name as string;
    if (data.email !== undefined) updateData.email = data.email as string | null;
    if (data.phone) {
      const phone = normalizePhone(data.phone as string);
      if (!isValidVNPhone(phone)) throw new BadRequestException('Số điện thoại không hợp lệ');
      updateData.phone = phone;
    }

    return this.prisma.lead.update({ where: { id }, data: updateData, select: LEAD_SELECT });
  }

  // ── Assign ──────────────────────────────────────────────────────────────
  /** Check if user has capacity to hold more leads (maxLeads from EmployeeLevel) */
  private async checkUserCapacity(userId: bigint, count = 1) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId },
      select: { employeeLevel: { select: { maxLeads: true } } },
    });
    const maxLeads = user?.employeeLevel?.maxLeads;
    if (maxLeads === null || maxLeads === undefined) return; // unlimited

    const currentCount = await this.prisma.lead.count({
      where: { assignedUserId: userId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] }, deletedAt: null },
    });
    const customerCount = await this.prisma.customer.count({
      where: { assignedUserId: userId, status: 'ACTIVE', deletedAt: null },
    });

    if (currentCount + customerCount + count > maxLeads) {
      throw new ConflictException(`Nhân viên đã đạt giới hạn ${maxLeads} leads+customers`);
    }
  }

  async assign(id: bigint, targetUserId: bigint, user: CurrentUser) {
    const lead = await this.findById(id);

    if (!['POOL', 'ZOOM', 'FLOATING'].includes(lead.status)) {
      throw new ConflictException('Chỉ gán lead ở trạng thái POOL, ZOOM hoặc FLOATING');
    }

    // Check capacity before assigning
    await this.checkUserCapacity(targetUserId);

    // Get target user's department
    const targetUser = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, departmentId: true },
    });
    if (!targetUser) throw new NotFoundException('Không tìm thấy nhân viên');

    await this.prisma.lead.update({
      where: { id },
      data: {
        assignedUserId: targetUserId,
        departmentId: targetUser.departmentId,
        status: 'ASSIGNED',
      },
    });

    // Log assignment history
    await this.prisma.assignmentHistory.create({
      data: {
        entityType: 'LEAD', entityId: id,
        fromUserId: lead.assignedUserId,
        toUserId: targetUserId,
        fromDepartmentId: lead.departmentId,
        toDepartmentId: targetUser.departmentId,
        assignedBy: user.id,
      },
    });

    // Log activity
    await this.prisma.activity.create({
      data: {
        entityType: 'LEAD', entityId: id, userId: user.id,
        type: 'ASSIGNMENT',
        content: `Gán cho nhân viên`,
        metadata: { toUserId: targetUserId.toString() },
      },
    });

    return this.findById(id);
  }

  /** Bulk assign multiple leads to a single user in one transaction */
  async bulkAssign(leadIds: bigint[], targetUserId: bigint, user: CurrentUser) {
    const targetUser = await this.prisma.user.findFirst({
      where: { id: targetUserId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true, departmentId: true, name: true },
    });
    if (!targetUser) throw new NotFoundException('Không tìm thấy nhân viên');

    const leads = await this.prisma.lead.findMany({
      where: { id: { in: leadIds }, status: { in: ['POOL', 'FLOATING'] }, deletedAt: null },
      select: { id: true, assignedUserId: true, departmentId: true },
    });

    if (leads.length === 0) {
      throw new BadRequestException('Không có lead nào ở trạng thái có thể phân phối');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.lead.updateMany({
        where: { id: { in: leads.map(l => l.id) } },
        data: { assignedUserId: targetUserId, departmentId: targetUser.departmentId, status: 'ASSIGNED' },
      });

      await tx.assignmentHistory.createMany({
        data: leads.map(l => ({
          entityType: 'LEAD' as const, entityId: l.id,
          fromUserId: l.assignedUserId, toUserId: targetUserId,
          fromDepartmentId: l.departmentId, toDepartmentId: targetUser.departmentId,
          assignedBy: user.id,
        })),
      });

      await tx.activity.createMany({
        data: leads.map(l => ({
          entityType: 'LEAD' as const, entityId: l.id, userId: user.id,
          type: 'ASSIGNMENT',
          content: `Phân hàng loạt cho ${targetUser.name}`,
          metadata: { toUserId: targetUserId.toString(), bulk: true },
        })),
      });
    });

    return { data: { assigned: leads.length, skipped: leadIds.length - leads.length, targetUser: { id: targetUser.id.toString(), name: targetUser.name } } };
  }

  // ── Claim ───────────────────────────────────────────────────────────────
  async claim(id: bigint, user: CurrentUser) {
    const lead = await this.findById(id);

    // Check capacity before claiming
    await this.checkUserCapacity(user.id);

    // Dept pool: only same dept users can claim
    if (lead.status === 'POOL' && lead.departmentId) {
      if (user.departmentId !== lead.departmentId) {
        throw new ForbiddenException('Chỉ nhân viên cùng phòng ban mới claim được');
      }
    }

    // Floating: any user can claim
    if (lead.status !== 'POOL' && lead.status !== 'FLOATING') {
      throw new ConflictException('Chỉ claim lead ở trạng thái POOL, ZOOM hoặc FLOATING');
    }

    // Atomic claim
    const result = await this.prisma.lead.updateMany({
      where: { id, assignedUserId: null, deletedAt: null, status: { in: ['POOL', 'FLOATING'] } },
      data: {
        assignedUserId: user.id,
        departmentId: user.departmentId,
        status: 'ASSIGNED',
      },
    });
    if (result.count === 0) throw new ConflictException('Lead đã được claim bởi người khác');

    await this.prisma.assignmentHistory.create({
      data: {
        entityType: 'LEAD', entityId: id,
        toUserId: user.id, toDepartmentId: user.departmentId,
        assignedBy: user.id, reason: 'Tự claim',
      },
    });

    return this.findById(id);
  }

  // ── Transfer ────────────────────────────────────────────────────────────
  async transfer(id: bigint, targetType: string, targetDeptId: string | null, user: CurrentUser) {
    const lead = await this.findById(id);
    await this.checkTransferPermission(lead, user);

    let status: LeadStatus;
    let deptId: bigint | null = null;

    switch (targetType) {
      case 'DEPARTMENT':
        if (!targetDeptId) throw new BadRequestException('targetDeptId bắt buộc');
        status = 'POOL';
        deptId = BigInt(targetDeptId);
        break;
      case 'FLOATING':
        status = 'FLOATING';
        break;
      case 'UNASSIGN':
        status = 'POOL';
        deptId = lead.departmentId; // giữ dept cũ
        break;
      default:
        throw new BadRequestException('targetType không hợp lệ');
    }

    await this.prisma.lead.update({
      where: { id },
      data: { assignedUserId: null, departmentId: deptId, status },
    });

    await this.prisma.assignmentHistory.create({
      data: {
        entityType: 'LEAD', entityId: id,
        fromUserId: lead.assignedUserId, fromDepartmentId: lead.departmentId,
        toDepartmentId: deptId, assignedBy: user.id,
        reason: `Chuyển: ${targetType}`,
      },
    });

    return this.findById(id);
  }

  // ── Status Change ───────────────────────────────────────────────────────
  async changeStatus(id: bigint, newStatus: LeadStatus, user: CurrentUser) {
    const validStatuses = Object.keys(ALLOWED_TRANSITIONS) as LeadStatus[];
    if (!validStatuses.includes(newStatus)) {
      throw new BadRequestException(`Trạng thái không hợp lệ: ${newStatus}`);
    }

    const lead = await this.findById(id);
    const currentStatus = lead.status as LeadStatus;

    if (!ALLOWED_TRANSITIONS[currentStatus]?.includes(newStatus)) {
      throw new ConflictException(`Không thể chuyển từ ${currentStatus} sang ${newStatus}`);
    }

    const updateData: Prisma.LeadUpdateInput = { status: newStatus };

    // LOST → FLOATING: clear user + dept
    if (newStatus === 'FLOATING') {
      updateData.assignedUser = { disconnect: true };
      updateData.department = { disconnect: true };
    }

    await this.prisma.lead.update({ where: { id }, data: updateData });

    await this.prisma.activity.create({
      data: {
        entityType: 'LEAD', entityId: id, userId: user.id,
        type: 'STATUS_CHANGE',
        content: `${currentStatus} → ${newStatus}`,
        metadata: { fromStatus: currentStatus, toStatus: newStatus },
      },
    });

    return this.findById(id);
  }

  // ── Convert to Customer ─────────────────────────────────────────────────
  async convert(id: bigint, user: CurrentUser) {
    const lead = await this.findById(id);

    if (lead.status !== 'IN_PROGRESS') {
      throw new ConflictException('Chỉ convert lead ở trạng thái IN_PROGRESS');
    }

    await this.prisma.$transaction(async (tx) => {
      // Update or create customer
      if (lead.customerId) {
        await tx.customer.update({
          where: { id: lead.customerId },
          data: {
            assignedUserId: lead.assignedUserId,
            assignedDepartmentId: lead.departmentId,
            status: 'ACTIVE',
          },
        });
      } else {
        const customer = await tx.customer.create({
          data: {
            phone: lead.phone, name: lead.name, email: lead.email,
            assignedUserId: lead.assignedUserId,
            assignedDepartmentId: lead.departmentId,
          },
        });
        await tx.lead.update({ where: { id }, data: { customerId: customer.id } });
      }

      // Set lead to CONVERTED
      await tx.lead.update({ where: { id }, data: { status: 'CONVERTED' } });

      // Log activity
      await tx.activity.create({
        data: {
          entityType: 'LEAD', entityId: id, userId: user.id,
          type: 'STATUS_CHANGE',
          content: 'Chuyển đổi thành khách hàng',
          metadata: { fromStatus: 'IN_PROGRESS', toStatus: 'CONVERTED' },
        },
      });
    });

    return this.findById(id);
  }

  // ── Auto IN_PROGRESS trigger ────────────────────────────────────────────
  async triggerInProgress(leadId: bigint, userId: bigint) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, status: 'ASSIGNED', deletedAt: null },
    });
    if (!lead) return; // not ASSIGNED, skip

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { status: 'IN_PROGRESS' },
    });

    await this.prisma.activity.create({
      data: {
        entityType: 'LEAD', entityId: leadId, userId,
        type: 'STATUS_CHANGE',
        content: 'ASSIGNED → IN_PROGRESS (tự động)',
        metadata: { fromStatus: 'ASSIGNED', toStatus: 'IN_PROGRESS', auto: true },
      },
    });
  }

  // ── Soft Delete ─────────────────────────────────────────────────────────
  async softDelete(id: bigint) {
    await this.findById(id);
    return this.prisma.lead.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async checkTransferPermission(lead: Record<string, unknown>, user: CurrentUser) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    if (lead.assignedUserId === user.id) return;
    if (user.role === UserRole.MANAGER) {
      // Manager can transfer unowned leads (POOL with no assignee)
      if (!lead.assignedUserId) return;
      // Check if manager manages the lead's department
      const deptId = lead.departmentId as bigint | null;
      if (deptId) {
        const managed = await this.prisma.managerDepartment.findUnique({
          where: { managerId_departmentId: { managerId: user.id, departmentId: deptId } },
        });
        if (managed) return;
      }
    }
    throw new ForbiddenException('Không có quyền chuyển lead này');
  }
}
