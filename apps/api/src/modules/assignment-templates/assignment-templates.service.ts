import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

const MEMBER_SELECT = {
  userId: true,
  user: { select: { id: true, name: true } },
};

const TEMPLATE_SELECT = {
  id: true, name: true, strategy: true, isActive: true,
  createdBy: true, createdAt: true, updatedAt: true,
  creator: { select: { id: true, name: true } },
  members: { select: MEMBER_SELECT },
};

@Injectable()
export class AssignmentTemplatesService {
  constructor(private readonly prisma: PrismaClient) {}

  async list() {
    return this.prisma.assignmentTemplate.findMany({
      select: TEMPLATE_SELECT,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: bigint) {
    const template = await this.prisma.assignmentTemplate.findUnique({
      where: { id },
      select: TEMPLATE_SELECT,
    });
    if (!template) throw new NotFoundException('Không tìm thấy mẫu phân phối');
    return template;
  }

  async create(
    data: { name: string; strategy?: string; memberUserIds: bigint[] },
    createdBy: bigint,
  ) {
    return this.prisma.$transaction(async (tx) => {
      return tx.assignmentTemplate.create({
        data: {
          name: data.name,
          strategy: data.strategy ?? 'ROUND_ROBIN',
          createdBy,
          members: {
            create: data.memberUserIds.map((userId) => ({ userId })),
          },
        },
        select: TEMPLATE_SELECT,
      });
    });
  }

  async update(
    id: bigint,
    data: { name?: string; strategy?: string; isActive?: boolean; memberUserIds?: bigint[] },
  ) {
    await this.getById(id);
    return this.prisma.$transaction(async (tx) => {
      if (data.memberUserIds !== undefined) {
        await tx.assignmentTemplateMember.deleteMany({ where: { templateId: id } });
        await tx.assignmentTemplateMember.createMany({
          data: data.memberUserIds.map((userId) => ({ templateId: id, userId })),
        });
      }
      return tx.assignmentTemplate.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.strategy !== undefined && { strategy: data.strategy }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
        select: TEMPLATE_SELECT,
      });
    });
  }

  async remove(id: bigint) {
    await this.getById(id);
    await this.prisma.$transaction(async (tx) => {
      await tx.assignmentTemplateMember.deleteMany({ where: { templateId: id } });
      await tx.assignmentTemplate.delete({ where: { id } });
    });
    return { message: 'Đã xóa mẫu phân phối' };
  }

  async applyTemplate(templateId: bigint, leadIds: bigint[], assignedBy: bigint) {
    const template = await this.getById(templateId);
    const members = template.members;

    if (members.length === 0) {
      return { assigned: 0, skipped: leadIds.length };
    }

    const leads = await this.prisma.lead.findMany({
      where: { id: { in: leadIds }, deletedAt: null },
      select: { id: true, status: true },
    });

    const eligibleLeads = leads.filter(
      (l) => l.status === 'POOL' || l.status === 'FLOATING',
    );
    const skipped = leadIds.length - eligibleLeads.length;

    if (eligibleLeads.length === 0) {
      return { assigned: 0, skipped };
    }

    // Round-robin: group leads by target user, then batch updateMany + createMany
    const userLeadGroups = new Map<string, bigint[]>();
    const historyData: { entityType: 'LEAD'; entityId: bigint; toUserId: bigint; assignedBy: bigint; reason: string }[] = [];

    for (let i = 0; i < eligibleLeads.length; i++) {
      const lead = eligibleLeads[i];
      const member = members[i % members.length];
      const userId = member.userId;
      const key = userId.toString();

      if (!userLeadGroups.has(key)) userLeadGroups.set(key, []);
      userLeadGroups.get(key)!.push(lead.id);

      historyData.push({
        entityType: 'LEAD', entityId: lead.id,
        toUserId: userId, assignedBy,
        reason: `Áp dụng mẫu phân phối: ${template.name}`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      // Batch update leads grouped by userId (N groups instead of N individual updates)
      for (const [userIdStr, leadIdGroup] of userLeadGroups) {
        await tx.lead.updateMany({
          where: { id: { in: leadIdGroup } },
          data: { assignedUserId: BigInt(userIdStr), status: 'ASSIGNED' },
        });
      }
      // Batch create all history records
      await tx.assignmentHistory.createMany({ data: historyData });
    });

    return { assigned: eligibleLeads.length, skipped };
  }
}
