import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ScoringService } from './scoring.service';

@Injectable()
export class DistributionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly scoring: ScoringService,
  ) {}

  /** Get distribution config for a department. */
  async getConfig(departmentId: bigint) {
    return this.prisma.aiDistributionConfig.findUnique({ where: { departmentId } });
  }

  /** Update distribution config. */
  async updateConfig(departmentId: bigint, data: { isActive?: boolean; weightConfig?: Record<string, number> }) {
    return this.prisma.aiDistributionConfig.upsert({
      where: { departmentId },
      update: { ...data, weightConfig: data.weightConfig as any },
      create: { departmentId, ...data, weightConfig: data.weightConfig as any },
    });
  }

  /** Auto-distribute a single lead from pool. */
  async distributeLead(leadId: bigint, departmentId: bigint, assignedBy: bigint) {
    const userId = await this.scoring.pickBestUser(departmentId);
    if (!userId) return null;

    await this.prisma.lead.update({
      where: { id: leadId },
      data: { assignedUserId: userId, departmentId, status: 'ASSIGNED' },
    });

    await this.prisma.assignmentHistory.create({
      data: {
        entityType: 'LEAD', entityId: leadId,
        toUserId: userId, toDepartmentId: departmentId,
        assignedBy, reason: 'Phân phối tự động (AI)',
      },
    });

    await this.prisma.activity.create({
      data: {
        entityType: 'LEAD', entityId: leadId, userId: assignedBy,
        type: 'ASSIGNMENT',
        content: 'Phân phối tự động',
        metadata: { auto: true, toUserId: userId.toString() },
      },
    });

    return { leadId, assignedUserId: userId };
  }

  /** Batch distribute leads from department pool. */
  async batchDistribute(departmentId: bigint, assignedBy: bigint) {
    const leads = await this.prisma.lead.findMany({
      where: { status: 'POOL', departmentId, assignedUserId: null, deletedAt: null },
      select: { id: true },
      take: 100,
    });

    const results = [];
    for (const lead of leads) {
      const result = await this.distributeLead(lead.id, departmentId, assignedBy);
      if (result) results.push(result);
    }

    return { distributed: results.length, total: leads.length };
  }

  /** Get score preview for a department. */
  async getScores(departmentId: bigint) {
    return this.scoring.scoreUsers(departmentId);
  }
}
