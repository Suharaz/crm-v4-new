import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async getStats(userId: bigint, role: string, dateFrom?: Date, dateTo?: Date) {
    const isAdmin = role === 'SUPER_ADMIN' || role === 'MANAGER';
    const now = new Date();
    const from = dateFrom || new Date(now.getFullYear(), now.getMonth(), 1);
    const to = dateTo || now;

    const leadFilter = isAdmin ? { deletedAt: null } : { deletedAt: null, assignedUserId: userId };
    const customerFilter = isAdmin
      ? { deletedAt: null, status: 'ACTIVE' as const }
      : { deletedAt: null, status: 'ACTIVE' as const, assignedUserId: userId };
    const orderFilter = isAdmin
      ? { deletedAt: null, createdAt: { gte: from, lte: to } }
      : { deletedAt: null, createdBy: userId, createdAt: { gte: from, lte: to } };
    const paymentFilter = isAdmin ? {} : { order: { createdBy: userId } };

    const [newLeads, inProgress, converted, monthlyRevenueAgg, totalCustomers, totalOrders, pendingPayments, overdueTask] = await Promise.all([
      this.prisma.lead.count({ where: { ...leadFilter, status: 'POOL' } }),
      this.prisma.lead.count({ where: { ...leadFilter, status: 'IN_PROGRESS' } }),
      this.prisma.lead.count({ where: { ...leadFilter, status: 'CONVERTED', updatedAt: { gte: from, lte: to } } }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { ...paymentFilter, status: 'VERIFIED', verifiedAt: { gte: from, lte: to } },
      }),
      this.prisma.customer.count({ where: customerFilter }),
      this.prisma.order.count({ where: orderFilter }),
      this.prisma.payment.count({ where: { ...paymentFilter, status: 'PENDING' } }),
      this.prisma.task.count({
        where: { deletedAt: null, status: 'PENDING', assignedTo: isAdmin ? undefined : userId, dueDate: { lt: now } },
      }),
    ]);

    return {
      newLeads, inProgress, converted,
      monthlyRevenue: Number(monthlyRevenueAgg._sum.amount ?? 0),
      totalCustomers, totalOrders, pendingPayments, overdueTask,
    };
  }

  /** Lead status breakdown for funnel chart */
  async getLeadFunnel(userId: bigint, role: string) {
    const isAdmin = role === 'SUPER_ADMIN' || role === 'MANAGER';
    const baseWhere = isAdmin ? { deletedAt: null } : { deletedAt: null, assignedUserId: userId };

    const statuses = ['POOL', 'ZOOM', 'ASSIGNED', 'IN_PROGRESS', 'CONVERTED', 'LOST', 'FLOATING'] as const;
    const counts = await Promise.all(
      statuses.map(status => this.prisma.lead.count({ where: { ...baseWhere, status } })),
    );

    return statuses.map((status, i) => ({ status, count: counts[i] }));
  }

  /** Daily revenue trend for a date range */
  async getRevenueTrend(userId: bigint, role: string, dateFrom: Date, dateTo: Date) {
    const isAdmin = role === 'SUPER_ADMIN' || role === 'MANAGER';
    const userFilter = isAdmin ? Prisma.sql`` : Prisma.sql`AND o.created_by = ${userId}`;

    const rows = await this.prisma.$queryRaw<{ day: Date; revenue: bigint }[]>`
      SELECT DATE(p.verified_at) as day, COALESCE(SUM(p.amount), 0)::bigint as revenue
      FROM payments p
      JOIN orders o ON o.id = p.order_id
      WHERE p.status = 'VERIFIED'
        AND p.verified_at >= ${dateFrom}
        AND p.verified_at <= ${dateTo}
        ${userFilter}
      GROUP BY DATE(p.verified_at)
      ORDER BY day
    `;

    return rows.map(r => ({ day: r.day, revenue: Number(r.revenue) }));
  }
}
