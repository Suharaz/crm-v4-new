import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaClient, Prisma, UserRole } from '@prisma/client';
import { normalizePhone, isValidVNPhone } from '@crm/utils';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CustomerListQueryDto } from './dto/customer-list-query.dto';

const CUSTOMER_SELECT = {
  id: true,
  phone: true,
  name: true,
  email: true,
  assignedUserId: true,
  assignedDepartmentId: true,
  status: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  assignedUser: { select: { id: true, name: true } },
  assignedDepartment: { select: { id: true, name: true } },
  labels: { include: { label: true } },
} satisfies Prisma.CustomerSelect;

interface CurrentUser {
  id: bigint;
  role: UserRole;
  departmentId: bigint | null;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: CustomerListQueryDto) {
    const limit = query.limit ?? 20;
    const where: Prisma.CustomerWhereInput = { deletedAt: null };

    if (query.status) where.status = query.status;
    if (query.departmentId) where.assignedDepartmentId = BigInt(query.departmentId);
    if (query.assignedUserId) where.assignedUserId = BigInt(query.assignedUserId);
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const customers = await this.prisma.customer.findMany({
      where,
      select: CUSTOMER_SELECT,
      orderBy: { id: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });

    const hasMore = customers.length > limit;
    const data = hasMore ? customers.slice(0, limit) : customers;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async searchByPhone(phone: string) {
    const normalized = normalizePhone(phone);
    const data = await this.prisma.customer.findMany({
      where: { phone: normalized, deletedAt: null },
      select: { id: true, phone: true, name: true, email: true, status: true },
      take: 10,
    });
    return { data };
  }

  async findById(id: bigint) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
      select: {
        ...CUSTOMER_SELECT,
        leads: { where: { deletedAt: null }, select: { id: true, status: true, productId: true, sourceId: true, createdAt: true }, take: 50 },
        orders: { where: { deletedAt: null }, select: { id: true, status: true, totalAmount: true, createdAt: true }, take: 50 },
      },
    });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    return customer;
  }

  async create(dto: CreateCustomerDto, user: CurrentUser) {
    const phone = normalizePhone(dto.phone);
    if (!isValidVNPhone(phone)) {
      throw new ConflictException('Số điện thoại không hợp lệ');
    }

    // Check existing
    const existing = await this.prisma.customer.findFirst({
      where: { phone, deletedAt: null },
    });
    if (existing) throw new ConflictException('Số điện thoại đã tồn tại');

    return this.prisma.customer.create({
      data: {
        phone,
        name: dto.name,
        email: dto.email,
        ...(dto.assignedUserId ? { assignedUser: { connect: { id: BigInt(dto.assignedUserId) } } } : {}),
        ...(dto.assignedDepartmentId ? { assignedDepartment: { connect: { id: BigInt(dto.assignedDepartmentId) } } } : {}),
      },
      select: CUSTOMER_SELECT,
    });
  }

  async update(id: bigint, data: Record<string, unknown>, user: CurrentUser) {
    const customer = await this.findById(id);

    // Phone field-level permission: manager+ only
    if (data.phone && !([UserRole.SUPER_ADMIN, UserRole.MANAGER] as UserRole[]).includes(user.role)) {
      throw new ForbiddenException('Chỉ quản lý mới được sửa số điện thoại');
    }

    const updateData: Prisma.CustomerUpdateInput = {};
    if (data.name) updateData.name = data.name as string;
    if (data.email !== undefined) updateData.email = data.email as string | null;
    if (data.phone) {
      const phone = normalizePhone(data.phone as string);
      if (!isValidVNPhone(phone)) throw new ConflictException('Số điện thoại không hợp lệ');
      // Dedup check
      const existing = await this.prisma.customer.findFirst({
        where: { phone, deletedAt: null, id: { not: id } },
      });
      if (existing) throw new ConflictException('Số điện thoại đã tồn tại');
      updateData.phone = phone;
    }

    return this.prisma.customer.update({ where: { id }, data: updateData, select: CUSTOMER_SELECT });
  }

  async claim(id: bigint, user: CurrentUser) {
    // Atomic claim: only if unassigned
    const result = await this.prisma.customer.updateMany({
      where: { id, assignedUserId: null, deletedAt: null, status: { in: ['ACTIVE', 'FLOATING'] } },
      data: {
        assignedUserId: user.id,
        assignedDepartmentId: user.departmentId,
        status: 'ACTIVE',
      },
    });
    if (result.count === 0) throw new ConflictException('Không thể claim khách hàng này');

    // Log assignment history
    await this.prisma.assignmentHistory.create({
      data: {
        entityType: 'CUSTOMER',
        entityId: id,
        toUserId: user.id,
        toDepartmentId: user.departmentId,
        assignedBy: user.id,
        reason: 'Tự claim',
      },
    });

    return this.findById(id);
  }

  async transfer(id: bigint, targetType: string, targetDeptId: string | null, user: CurrentUser) {
    const customer = await this.findById(id);

    // Permission check: assigned user, manager, or super_admin
    this.checkTransferPermission(customer, user);

    const updateData: Prisma.CustomerUpdateInput = {};
    let reason = '';

    switch (targetType) {
      case 'DEPARTMENT':
        if (!targetDeptId) throw new ConflictException('targetDeptId bắt buộc khi chuyển phòng ban');
        updateData.assignedUser = { disconnect: true };
        updateData.assignedDepartment = { connect: { id: BigInt(targetDeptId) } };
        updateData.status = 'ACTIVE';
        reason = 'Chuyển phòng ban';
        break;
      case 'FLOATING':
        updateData.assignedUser = { disconnect: true };
        updateData.assignedDepartment = { disconnect: true };
        updateData.status = 'FLOATING';
        reason = 'Chuyển kho thả nổi';
        break;
      case 'INACTIVE':
        updateData.assignedUser = { disconnect: true };
        updateData.status = 'INACTIVE';
        reason = 'Chăm sóc xong';
        break;
      default:
        throw new ConflictException('targetType không hợp lệ');
    }

    await this.prisma.customer.update({ where: { id }, data: updateData });

    await this.prisma.assignmentHistory.create({
      data: {
        entityType: 'CUSTOMER',
        entityId: id,
        fromUserId: customer.assignedUserId,
        fromDepartmentId: customer.assignedDepartmentId,
        toDepartmentId: targetDeptId ? BigInt(targetDeptId) : null,
        assignedBy: user.id,
        reason,
      },
    });

    return this.findById(id);
  }

  async reactivate(id: bigint, user: CurrentUser) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null, status: 'INACTIVE' },
    });
    if (!customer) throw new NotFoundException('Không tìm thấy khách hàng INACTIVE');

    return this.prisma.customer.update({
      where: { id },
      data: { status: 'ACTIVE' },
      select: CUSTOMER_SELECT,
    });
  }

  async softDelete(id: bigint) {
    await this.findById(id);
    return this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  private checkTransferPermission(customer: Record<string, unknown>, user: CurrentUser) {
    if (user.role === UserRole.SUPER_ADMIN) return;
    if (customer.assignedUserId === user.id) return;
    if (user.role === UserRole.MANAGER) return; // TODO: check managed depts
    throw new ForbiddenException('Không có quyền chuyển khách hàng này');
  }
}
