import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

interface UserScore {
  userId: bigint;
  score: number;
  breakdown: { workload: number; level: number; performance: number };
}

/**
 * Weighted scoring algorithm for auto lead distribution.
 * Factors: workload (30%), employee level (30%), conversion rate (40%).
 */
@Injectable()
export class ScoringService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Score all active users in a department for lead assignment. */
  async scoreUsers(departmentId: bigint, weights?: { workload: number; level: number; performance: number }): Promise<UserScore[]> {
    const w = weights || { workload: 30, level: 30, performance: 40 };

    // Get active users in department
    const users = await this.prisma.user.findMany({
      where: { departmentId, status: 'ACTIVE', deletedAt: null, role: 'USER' },
      select: { id: true, employeeLevelId: true },
    });

    if (users.length === 0) return [];

    // Get employee levels for rank
    const levels = await this.prisma.employeeLevel.findMany({ select: { id: true, rank: true } });
    const levelMap = new Map(levels.map((l) => [l.id.toString(), l.rank]));
    const maxRank = Math.max(...levels.map((l) => l.rank), 1);

    // Calculate workload (fewer active leads = higher score)
    const workloads = await Promise.all(
      users.map(async (u) => {
        const count = await this.prisma.lead.count({
          where: { assignedUserId: u.id, status: { in: ['ASSIGNED', 'IN_PROGRESS'] }, deletedAt: null },
        });
        return { userId: u.id, count };
      }),
    );
    const maxWorkload = Math.max(...workloads.map((w) => w.count), 1);

    // Calculate conversion rates (last 90 days) — based on assignment history, not current assignedUserId
    // This ensures leads that were converted then unassigned still count for the user who converted them
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const conversions = await Promise.all(
      users.map(async (u) => {
        // Count distinct leads ever assigned to this user (via history)
        const historyLeads = await this.prisma.assignmentHistory.findMany({
          where: { toUserId: u.id, entityType: 'LEAD', createdAt: { gte: since } },
          select: { entityId: true },
          distinct: ['entityId'],
        });
        const totalAssigned = historyLeads.length;

        if (totalAssigned === 0) {
          // Fallback: count current leads if no history
          const currentTotal = await this.prisma.lead.count({
            where: { assignedUserId: u.id, deletedAt: null, createdAt: { gte: since } },
          });
          const currentConverted = await this.prisma.lead.count({
            where: { assignedUserId: u.id, status: 'CONVERTED', deletedAt: null, createdAt: { gte: since } },
          });
          return { userId: u.id, rate: currentTotal > 0 ? currentConverted / currentTotal : 0 };
        }

        // Count how many of those distinct leads are now CONVERTED
        const convertedCount = await this.prisma.lead.count({
          where: {
            id: { in: historyLeads.map(h => h.entityId) },
            status: 'CONVERTED',
            deletedAt: null,
          },
        });

        return { userId: u.id, rate: convertedCount / totalAssigned };
      }),
    );

    // Calculate scores
    return users.map((u) => {
      const workload = workloads.find((wl) => wl.userId === u.id)!;
      const conversion = conversions.find((c) => c.userId === u.id)!;
      const levelRank = u.employeeLevelId ? (levelMap.get(u.employeeLevelId.toString()) || 1) : 1;

      // Normalize: higher = better
      const workloadScore = (1 - workload.count / maxWorkload) * w.workload;
      const levelScore = (levelRank / maxRank) * w.level;
      const perfScore = conversion.rate * w.performance;
      const total = workloadScore + levelScore + perfScore;

      return {
        userId: u.id,
        score: Math.round(total * 100) / 100,
        breakdown: { workload: workloadScore, level: levelScore, performance: perfScore },
      };
    }).sort((a, b) => b.score - a.score);
  }

  /** Pick best user for assignment. */
  async pickBestUser(departmentId: bigint): Promise<bigint | null> {
    // Load config
    const config = await this.prisma.aiDistributionConfig.findUnique({
      where: { departmentId },
    });
    if (!config?.isActive) return null;

    const weights = config.weightConfig as any;
    const scores = await this.scoreUsers(departmentId, weights);
    return scores.length > 0 ? scores[0].userId : null;
  }
}
