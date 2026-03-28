import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma, EntityType } from '@prisma/client';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: bigint, limit = 20, cursor?: string) {
    const take = limit + 1;
    const notifications = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take,
      ...(cursor ? { skip: 1, cursor: { id: BigInt(cursor) } } : {}),
    });

    const hasMore = notifications.length > limit;
    const data = hasMore ? notifications.slice(0, limit) : notifications;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async unreadCount(userId: bigint) {
    return this.prisma.notification.count({ where: { userId, isRead: false } });
  }

  async markAsRead(id: bigint, userId: bigint) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: bigint) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  /** Create notification (called by other services). */
  async create(userId: bigint, title: string, content?: string, type = 'SYSTEM', entityType?: EntityType, entityId?: bigint) {
    return this.prisma.notification.create({
      data: { userId, title, content, type, entityType, entityId },
    });
  }
}
