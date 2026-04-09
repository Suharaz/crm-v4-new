import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, Prisma, EntityType, ActivityType } from '@prisma/client';

const ACTIVITY_SELECT = {
  id: true, entityType: true, entityId: true, userId: true,
  type: true, content: true, metadata: true, createdAt: true,
  user: { select: { id: true, name: true } },
  attachments: { select: { id: true, fileName: true, fileUrl: true, fileType: true, fileSize: true } },
} satisfies Prisma.ActivitySelect;

@Injectable()
export class ActivitiesService {
  constructor(private readonly prisma: PrismaClient) {}

  /** Validate entity exists, throw 404 if not. */
  private async validateEntityExists(entityType: EntityType, entityId: bigint) {
    if (entityType === 'LEAD') {
      const lead = await this.prisma.lead.findFirst({ where: { id: entityId, deletedAt: null } });
      if (!lead) throw new NotFoundException('Không tìm thấy lead');
    } else if (entityType === 'CUSTOMER') {
      const customer = await this.prisma.customer.findFirst({ where: { id: entityId, deletedAt: null } });
      if (!customer) throw new NotFoundException('Không tìm thấy khách hàng');
    }
  }

  /** Get paginated timeline for an entity. For CUSTOMER: aggregates from customer + all its leads. */
  async getTimeline(entityType: EntityType, entityId: bigint, limit = 20, cursor?: string) {
    await this.validateEntityExists(entityType, entityId);
    const take = limit + 1;

    // Build where clause — for customers, include activities from all related leads
    let where: Prisma.ActivityWhereInput;
    if (entityType === 'CUSTOMER') {
      const leads = await this.prisma.lead.findMany({
        where: { customerId: entityId, deletedAt: null },
        select: { id: true },
      });
      const leadIds = leads.map(l => l.id);

      where = {
        deletedAt: null,
        OR: [
          { entityType: 'CUSTOMER', entityId },
          ...(leadIds.length > 0 ? [{ entityType: 'LEAD' as EntityType, entityId: { in: leadIds } }] : []),
        ],
      };
    } else {
      where = { entityType, entityId, deletedAt: null };
    }

    const activities = await this.prisma.activity.findMany({
      where,
      select: ACTIVITY_SELECT,
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: BigInt(cursor) } } : {}),
    });

    const hasMore = activities.length > limit;
    const data = hasMore ? activities.slice(0, limit) : activities;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  /** Create a manual note. */
  async createNote(entityType: EntityType, entityId: bigint, userId: bigint, content: string) {
    await this.validateEntityExists(entityType, entityId);
    return this.prisma.activity.create({
      data: { entityType, entityId, userId, type: 'NOTE', content },
      select: ACTIVITY_SELECT,
    });
  }

  /** System auto-log activity (called by other modules). */
  async logActivity(params: {
    entityType: EntityType;
    entityId: bigint;
    userId: bigint;
    type: ActivityType;
    content?: string;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.activity.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        userId: params.userId,
        type: params.type,
        content: params.content,
        metadata: params.metadata as any,
      },
    });
  }
}
