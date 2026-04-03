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

    const userLead = isAdmin ? {} : { assignedUserId: userId };
    const userOrder = isAdmin ? {} : { createdBy: userId };
    const userPayment = isAdmin ? {} : { order: { createdBy: userId } };
    const dateRange = { gte: from, lte: to };

    const [newLeads, inProgress, converted, revenueAgg, newCustomers, totalOrders, pendingPayments, overdueTask] = await Promise.all([
      // Leads created in period with POOL status
      this.prisma.lead.count({ where: { deletedAt: null, ...userLead, status: 'POOL', createdAt: dateRange } }),
      // Leads currently IN_PROGRESS (snapshot, not time-filtered)
      this.prisma.lead.count({ where: { deletedAt: null, ...userLead, status: 'IN_PROGRESS' } }),
      // Leads converted in period
      this.prisma.lead.count({ where: { deletedAt: null, ...userLead, status: 'CONVERTED', updatedAt: dateRange } }),
      // Revenue verified in period
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: { ...userPayment, status: 'VERIFIED', verifiedAt: dateRange },
      }),
      // Customers created in period
      this.prisma.customer.count({ where: { deletedAt: null, ...(isAdmin ? {} : { assignedUserId: userId }), createdAt: dateRange } }),
      // Orders created in period
      this.prisma.order.count({ where: { deletedAt: null, ...userOrder, createdAt: dateRange } }),
      // Pending payments (snapshot)
      this.prisma.payment.count({ where: { ...userPayment, status: 'PENDING' } }),
      // Overdue tasks (snapshot)
      this.prisma.task.count({
        where: { deletedAt: null, status: 'PENDING', assignedTo: isAdmin ? undefined : userId, dueDate: { lt: now } },
      }),
    ]);

    return {
      newLeads, inProgress, converted,
      revenue: Number(revenueAgg._sum.amount ?? 0),
      newCustomers, totalOrders, pendingPayments, overdueTask,
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

  /** Manager+: top performers by converted leads in period */
  async getTopPerformers(dateFrom: Date, dateTo: Date) {
    const rows = await this.prisma.$queryRaw<{ user_id: bigint; name: string; converted: bigint; revenue: bigint }[]>`
      SELECT u.id as user_id, u.name,
        COUNT(DISTINCT CASE WHEN l.status = 'CONVERTED' THEN l.id END)::bigint as converted,
        COALESCE(SUM(CASE WHEN p.status = 'VERIFIED' THEN p.amount ELSE 0 END), 0)::bigint as revenue
      FROM users u
      LEFT JOIN leads l ON l.assigned_user_id = u.id AND l.deleted_at IS NULL AND l.updated_at >= ${dateFrom} AND l.updated_at <= ${dateTo}
      LEFT JOIN orders o ON o.created_by = u.id AND o.deleted_at IS NULL
      LEFT JOIN payments p ON p.order_id = o.id AND p.verified_at >= ${dateFrom} AND p.verified_at <= ${dateTo}
      WHERE u.deleted_at IS NULL AND u.role = 'USER'
      GROUP BY u.id, u.name
      HAVING COUNT(DISTINCT CASE WHEN l.status = 'CONVERTED' THEN l.id END) > 0 OR COALESCE(SUM(CASE WHEN p.status = 'VERIFIED' THEN p.amount ELSE 0 END), 0) > 0
      ORDER BY revenue DESC
      LIMIT 10
    `;
    return rows.map(r => ({ userId: r.user_id.toString(), name: r.name, converted: Number(r.converted), revenue: Number(r.revenue) }));
  }

  /** Manager+: leads per source in period */
  async getLeadsBySource(dateFrom: Date, dateTo: Date) {
    const rows = await this.prisma.$queryRaw<{ source_name: string; total: bigint; converted: bigint }[]>`
      SELECT COALESCE(ls.name, 'Không rõ') as source_name,
        COUNT(l.id)::bigint as total,
        COUNT(CASE WHEN l.status = 'CONVERTED' THEN 1 END)::bigint as converted
      FROM leads l
      LEFT JOIN lead_sources ls ON ls.id = l.source_id
      WHERE l.deleted_at IS NULL AND l.created_at >= ${dateFrom} AND l.created_at <= ${dateTo}
      GROUP BY ls.name
      ORDER BY total DESC
    `;
    return rows.map(r => ({ source: r.source_name, total: Number(r.total), converted: Number(r.converted) }));
  }
}
