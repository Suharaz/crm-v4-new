import { Injectable, NotFoundException, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(TasksService.name);

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

  async update(id: bigint, data: {
    title?: string; description?: string; dueDate?: string;
    remindAt?: string; priority?: string; assignedTo?: string;
  }, userId: bigint) {
    const task = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) throw new NotFoundException('Không tìm thấy công việc');

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.dueDate !== undefined) updateData.dueDate = data.dueDate ? new Date(data.dueDate) : null;
    if (data.remindAt !== undefined) {
      updateData.remindAt = data.remindAt ? new Date(data.remindAt) : null;
      updateData.remindedAt = null; // reset reminder flag when remindAt changes
    }
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.assignedTo !== undefined) updateData.assignedTo = BigInt(data.assignedTo);

    return this.prisma.task.update({
      where: { id },
      data: updateData,
      select: TASK_SELECT,
    });
  }

  async remove(id: bigint) {
    const task = await this.prisma.task.findFirst({ where: { id, deletedAt: null } });
    if (!task) throw new NotFoundException('Không tìm thấy công việc');
    return this.prisma.task.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Cron: check reminders every 5 minutes. */
  @Cron('*/5 * * * *')
  async processReminders() {
    try {
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

    // Escalation level 1: overdue > 1 hour, escalation1At IS NULL, PENDING
    const overdue1h = new Date(now.getTime() - 60 * 60 * 1000);
    const escalation1Tasks = await this.prisma.task.findMany({
      where: {
        dueDate: { lte: overdue1h },
        escalation1At: null,
        status: 'PENDING',
        deletedAt: null,
      },
      select: { id: true, title: true, assignedTo: true },
      take: 100,
    });

    for (const task of escalation1Tasks) {
      await this.prisma.notification.create({
        data: {
          userId: task.assignedTo,
          title: 'Công việc quá hạn',
          content: `"${task.title}" đã quá hạn hơn 1 giờ`,
          type: 'TASK_OVERDUE',
        },
      });
      await this.prisma.task.update({
        where: { id: task.id },
        data: { escalation1At: now },
      });
    }

    // Escalation level 2: overdue > 24 hours, escalation2At IS NULL, PENDING → notify manager
    const overdue24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const escalation2Tasks = await this.prisma.task.findMany({
      where: {
        dueDate: { lte: overdue24h },
        escalation2At: null,
        status: 'PENDING',
        deletedAt: null,
      },
      select: { id: true, title: true, assignedTo: true, assignee: { select: { departmentId: true, name: true } } },
      take: 100,
    });

    for (const task of escalation2Tasks) {
      if (task.assignee?.departmentId) {
        const managers = await this.prisma.user.findMany({
          where: {
            departmentId: task.assignee.departmentId,
            role: { in: ['MANAGER', 'SUPER_ADMIN'] },
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        for (const manager of managers) {
          await this.prisma.notification.create({
            data: {
              userId: manager.id,
              title: 'Công việc nhân viên quá hạn',
              content: `"${task.title}" của ${task.assignee.name} đã quá hạn hơn 24 giờ`,
              type: 'TASK_ESCALATION',
            },
          });
        }
      }
      await this.prisma.task.update({
        where: { id: task.id },
        data: { escalation2At: now },
      });
    }
    } catch (error) {
      this.logger.error('Lỗi khi xử lý reminders/escalations', error instanceof Error ? error.stack : error);
    }
  }
}
