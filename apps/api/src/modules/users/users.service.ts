import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from './users.repository';
import { CreateUserDto } from './dto/create-user.dto';
import { AdminUpdateUserDto, UpdateUserProfileDto } from './dto/update-user.dto';
import { UserListQueryDto } from './dto/user-list-query.dto';
import { AuthService } from '../auth/auth.service';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly prisma: PrismaClient,
    private readonly authService: AuthService,
  ) {}

  async list(query: UserListQueryDto) {
    const where: Prisma.UserWhereInput = {};
    if (query.departmentId) where.departmentId = BigInt(query.departmentId);
    if (query.role) where.role = query.role;
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
      ];
    }
    return this.repo.findMany({
      where,
      cursor: query.cursor ? BigInt(query.cursor) : undefined,
      limit: query.limit,
    });
  }

  async findById(id: bigint) {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');
    return user;
  }

  async create(dto: CreateUserDto) {
    const existing = await this.repo.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email đã tồn tại');

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    return this.repo.create({
      email: dto.email,
      passwordHash,
      name: dto.name,
      phone: dto.phone,
      role: dto.role,
      ...(dto.departmentId ? { department: { connect: { id: BigInt(dto.departmentId) } } } : {}),
      ...(dto.teamId ? { team: { connect: { id: BigInt(dto.teamId) } } } : {}),
      ...(dto.employeeLevelId
        ? { employeeLevel: { connect: { id: BigInt(dto.employeeLevelId) } } }
        : {}),
    });
  }

  async updateProfile(id: bigint, dto: UpdateUserProfileDto) {
    const data: Prisma.UserUpdateInput = {};
    if (dto.name) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }

    const user = await this.repo.update(id, data);

    // Revoke tokens on password change
    if (dto.password) {
      await this.authService.revokeAllUserTokens(id);
    }

    return user;
  }

  async adminUpdate(id: bigint, dto: AdminUpdateUserDto) {
    const existingUser = await this.repo.findById(id);
    if (!existingUser) throw new NotFoundException('Không tìm thấy người dùng');

    const data: Prisma.UserUpdateInput = {};
    if (dto.name) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.role) data.role = dto.role;
    if (dto.status) data.status = dto.status;
    if (dto.isLeader !== undefined) data.isLeader = dto.isLeader;
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    }
    if (dto.departmentId !== undefined) {
      data.department = dto.departmentId
        ? { connect: { id: BigInt(dto.departmentId) } }
        : { disconnect: true };
    }
    if (dto.teamId !== undefined) {
      data.team = dto.teamId ? { connect: { id: BigInt(dto.teamId) } } : { disconnect: true };
    }
    if (dto.employeeLevelId !== undefined) {
      data.employeeLevel = dto.employeeLevelId
        ? { connect: { id: BigInt(dto.employeeLevelId) } }
        : { disconnect: true };
    }

    const user = await this.repo.update(id, data);

    // Revoke tokens on role change, password change, or deactivation
    const roleChanged = dto.role && dto.role !== existingUser.role;
    const deactivated = dto.status === 'INACTIVE';
    if (roleChanged || deactivated || dto.password) {
      await this.authService.revokeAllUserTokens(id);
    }

    return user;
  }

  async deactivate(id: bigint, performedBy: bigint) {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    // Run deactivation cascade in a transaction
    await this.prisma.$transaction(async (tx) => {
      // 1. Soft-delete user
      await tx.user.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'INACTIVE' },
      });

      // 2. Revoke all refresh tokens
      await tx.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // 3. Unassign leads (back to dept pool)
      const leads = await tx.lead.findMany({
        where: { assignedUserId: id, deletedAt: null },
        select: { id: true, departmentId: true },
      });

      if (leads.length > 0) {
        await tx.lead.updateMany({
          where: { assignedUserId: id, deletedAt: null },
          data: { assignedUserId: null, status: 'POOL' },
        });

        // Log assignment history for each lead
        await tx.assignmentHistory.createMany({
          data: leads.map((lead) => ({
            entityType: 'LEAD' as const,
            entityId: lead.id,
            fromUserId: id,
            toUserId: null,
            fromDepartmentId: lead.departmentId,
            toDepartmentId: lead.departmentId,
            assignedBy: performedBy,
            reason: 'Tự động: người dùng bị vô hiệu hóa',
          })),
        });
      }

      // 4. Unassign customers (back to dept pool)
      const customers = await tx.customer.findMany({
        where: { assignedUserId: id, deletedAt: null },
        select: { id: true, assignedDepartmentId: true },
      });

      if (customers.length > 0) {
        await tx.customer.updateMany({
          where: { assignedUserId: id, deletedAt: null },
          data: { assignedUserId: null },
        });

        await tx.assignmentHistory.createMany({
          data: customers.map((customer) => ({
            entityType: 'CUSTOMER' as const,
            entityId: customer.id,
            fromUserId: id,
            toUserId: null,
            fromDepartmentId: customer.assignedDepartmentId,
            toDepartmentId: customer.assignedDepartmentId,
            assignedBy: performedBy,
            reason: 'Tự động: người dùng bị vô hiệu hóa',
          })),
        });
      }
    });

    return { message: 'Đã vô hiệu hóa người dùng' };
  }
}
