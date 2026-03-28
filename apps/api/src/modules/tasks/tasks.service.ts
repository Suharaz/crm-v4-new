import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaClient, Prisma, TaskStatus } from '@prisma/client';
import { Cron } from '@nestjs/schedule';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

const TASK_SELECT = {
  id: true, title: true, description: true,
  entityType: true, entityId: true,
  assignedTo: true, createdBy: true,
  dueDate: true, remindAt: true, remindedAt: true,
  status: true, priority: true, completedAt: true,
  createdAt: true, updatedAt: true,
  assignee: { select: { id: true, name: true } },
  creator: { select: { id: true, name: true } },
} satisfies Prisma.TaskSelect;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: bigint, query: PaginationQueryDto & { status?: TaskStatus }) {
    const limit = query.limit ?? 20;
    const where: Prisma.TaskWhereInput = { assignedTo: userId, deletedAt: null };
    if (query.status) where.status = query.status;

    const tasks = await this.prisma.task.findMany({
      where, select: TASK_SELECT,
      orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
      take: limit + 1,
      ...(query.cursor ? { skip: 1, cursor: { id: BigInt(query.cursor) } } : {}),
    });

    const hasMore = tasks.length > limit;
    const data = hasMore ? tasks.slice(0, limit) : tasks;
    return { data, meta: { nextCursor: hasMore ? data[data.length - 1].id?.toString() : undefined } };
  }

  async create(data: {
    title: string; description?: string; assignedTo: string; dueDate?: string;
    remindAt?: string; priority?: string; entityType?: string; entityId?: string;
  }, createdBy: bigint) {
    return this.prisma.task.create({
      data: {
        title: data.title,
        description: data.description,
        assignedTo: BigInt(data.assignedTo),
        createdBy,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        remindAt: data.remindAt ? new Date(data.remindAt) : null,
        priority: (data.priority as any) || 'MEDIUM',
        entityType: data.entityType as any,
        entityId: data.entityId ? BigInt(data.entityId) : null,
      },
      select: TASK_SELECT,
    });
  }

  async complete(id: bigint) {
    const task = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) throw new NotFoundException('Không tìm thấy công việc');
    return this.prisma.task.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
      select: TASK_SELECT,
    });
  }

  async cancel(id: bigint) {
    return this.prisma.task.update({
      where: { id },
      data: { status: 'CANCELLED' },
      select: TASK_SELECT,
    });
  }

  /** Cron: check reminders every 5 minutes. */
  @Cron('*/5 * * * *')
  async processReminders() {
    const now = new Date();

    // Find tasks due for reminder (remindAt <= now AND remindedAt IS NULL AND PENDING)
    const dueTasks = await this.prisma.task.findMany({
      where: {
        remindAt: { lte: now },
        remindedAt: null,
        status: 'PENDING',
        deletedAt: null,
      },
      select: { id: true, title: true, assignedTo: true },
      take: 100,
    });

    for (const task of dueTasks) {
      // Create notification
      await this.prisma.notification.create({
        data: {
          userId: task.assignedTo,
          title: 'Nhắc nhở công việc',
          content: task.title,
          type: 'TASK_REMINDER',
        },
      });

      // Mark as reminded
      await this.prisma.task.update({
        where: { id: task.id },
        data: { remindedAt: now },
      });
    }
  }
}
