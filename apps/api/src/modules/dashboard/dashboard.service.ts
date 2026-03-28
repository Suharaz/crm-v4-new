import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async getStats(userId: bigint, role: string, departmentId?: bigint) {
    const isAdmin = role === 'SUPER_ADMIN' || role === 'MANAGER';
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Role-based filter for leads
    const leadFilter = isAdmin ? { deletedAt: null } : {
      deletedAt: null,
      assignedUserId: userId,
    };

    // Role-based filter for customers
    const customerFilter = isAdmin ? { deletedAt: null, status: 'ACTIVE' as const } : {
      deletedAt: null,
      status: 'ACTIVE' as const,
      assignedUserId: userId,
    };

    // Role-based filter for orders this month
    const orderFilter = isAdmin
      ? { deletedAt: null, createdAt: { gte: startOfMonth } }
      : { deletedAt: null, createdBy: userId, createdAt: { gte: startOfMonth } };

    // Role-based filter for payments
    const paymentFilter = isAdmin ? {} : {
      order: { createdBy: userId },
    };

    const [
      newLeads,
      inProgress,
      converted,
      monthlyRevenueAgg,
      totalCustomers,
      totalOrders,
      pendingPayments,
      overdueTask,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { ...leadFilter, status: 'POOL' } }),
      this.prisma.lead.count({ where: { ...leadFilter, status: 'IN_PROGRESS' } }),
      this.prisma.lead.count({
        where: { ...leadFilter, status: 'CONVERTED', updatedAt: { gte: startOfMonth } },
      }),
      this.prisma.payment.aggregate({
        _sum: { amount: true },
        where: {
          ...paymentFilter,
          status: 'VERIFIED',
          verifiedAt: { gte: startOfMonth },
        },
      }),
      this.prisma.customer.count({ where: customerFilter }),
      this.prisma.order.count({ where: orderFilter }),
      this.prisma.payment.count({
        where: { ...paymentFilter, status: 'PENDING' },
      }),
      this.prisma.task.count({
        where: {
          deletedAt: null,
          status: 'PENDING',
          assignedTo: isAdmin ? undefined : userId,
          dueDate: { lt: now },
        },
      }),
    ]);

    return {
      newLeads,
      inProgress,
      converted,
      monthlyRevenue: Number(monthlyRevenueAgg._sum.amount ?? 0),
      totalCustomers,
      totalOrders,
      pendingPayments,
      overdueTask,
    };
  }
}
