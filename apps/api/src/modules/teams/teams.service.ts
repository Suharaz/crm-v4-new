import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(departmentId?: string) {
    const where: Record<string, unknown> = { deletedAt: null };
    if (departmentId) where.departmentId = BigInt(departmentId);

    const data = await this.prisma.team.findMany({
      where,
      include: {
        department: { select: { id: true, name: true } },
        leader: { select: { id: true, name: true, email: true } },
        _count: { select: { members: { where: { deletedAt: null } } } },
      },
      orderBy: { id: 'asc' },
    });
    return { data };
  }

  async findById(id: bigint) {
    const team = await this.prisma.team.findFirst({
      where: { id, deletedAt: null },
      include: {
        department: { select: { id: true, name: true } },
        leader: { select: { id: true, name: true, email: true } },
        members: {
          where: { deletedAt: null },
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });
    if (!team) throw new NotFoundException('Không tìm thấy team');
    return team;
  }

  async create(data: { name: string; departmentId: string; leaderId: string }) {
    const deptId = BigInt(data.departmentId);
    const leadId = BigInt(data.leaderId);

    // Validate leader is in same department
    const leader = await this.prisma.user.findFirst({
      where: { id: leadId, departmentId: deptId, deletedAt: null },
    });
    if (!leader) {
      throw new BadRequestException('Leader phải thuộc cùng phòng ban');
    }

    const team = await this.prisma.team.create({
      data: { name: data.name, departmentId: deptId, leaderId: leadId },
      include: {
        department: { select: { id: true, name: true } },
        leader: { select: { id: true, name: true, email: true } },
      },
    });

    // Set leader's team and isLeader flag
    await this.prisma.user.update({
      where: { id: leadId },
      data: { teamId: team.id, isLeader: true },
    });

    return team;
  }

  async update(id: bigint, data: { name?: string; leaderId?: string }) {
    const team = await this.findById(id);

    if (data.leaderId) {
      const newLeadId = BigInt(data.leaderId);
      const leader = await this.prisma.user.findFirst({
        where: { id: newLeadId, departmentId: team.department.id, deletedAt: null },
      });
      if (!leader) {
        throw new BadRequestException('Leader phải thuộc cùng phòng ban');
      }

      // Remove old leader flag
      await this.prisma.user.update({
        where: { id: team.leader.id },
        data: { isLeader: false },
      });

      // Set new leader
      await this.prisma.user.update({
        where: { id: newLeadId },
        data: { teamId: id, isLeader: true },
      });
    }

    return this.prisma.team.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.leaderId ? { leaderId: BigInt(data.leaderId) } : {}),
      },
      include: {
        department: { select: { id: true, name: true } },
        leader: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async delete(id: bigint) {
    await this.findById(id);
    const memberCount = await this.prisma.user.count({
      where: { teamId: id, deletedAt: null },
    });
    if (memberCount > 0) {
      throw new ConflictException('Không thể xóa team đang có thành viên');
    }
    return this.prisma.team.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
