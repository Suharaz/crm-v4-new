import { Injectable } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
import { CacheService } from '../../common/cache/cache.service';
import { CACHE_TTL } from '../../common/cache/cache.constants';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cacheService: CacheService,
  ) {}

  /** Deterministic cache key from parts */
  private cacheKey(method: string, ...parts: (string | number | bigint | Date | undefined)[]): string {
    const raw = parts.map(p => {
      if (p instanceof Date) return p.toISOString().slice(0, 10);
      return String(p ?? 'null');
    }).join(':');
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
    }
    return `dashboard:${method}:${Math.abs(hash).toString(36)}`;
  }

  async getStats(userId: bigint, role: string, dateFrom?: Date, dateTo?: Date) {
    const key = this.cacheKey('stats', userId, role, dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const isAdmin = role === 'SUPER_ADMIN' || role === 'MANAGER';
      const now = new Date();
      const from = dateFrom || new Date(now.getFullYear(), now.getMonth(), 1);
      const to = dateTo || now;

      const userLead = isAdmin ? {} : { assignedUserId: userId };
      const userOrder = isAdmin ? {} : { createdBy: userId };
      const userPayment = isAdmin ? {} : { order: { createdBy: userId } };
      const dateRange = { gte: from, lte: to };

      const [newLeads, inProgress, converted, revenueAgg, newCustomers, totalOrders, pendingPayments, overdueTask] = await Promise.all([
        this.prisma.lead.count({ where: { deletedAt: null, ...userLead, status: 'POOL', createdAt: dateRange } }),
        this.prisma.lead.count({ where: { deletedAt: null, ...userLead, status: 'IN_PROGRESS' } }),
        this.prisma.lead.count({ where: { deletedAt: null, ...userLead, status: 'CONVERTED', updatedAt: dateRange } }),
        this.prisma.payment.aggregate({
          _sum: { amount: true },
          where: { ...userPayment, status: 'VERIFIED', verifiedAt: dateRange },
        }),
        this.prisma.customer.count({ where: { deletedAt: null, ...(isAdmin ? {} : { assignedUserId: userId }), createdAt: dateRange } }),
        this.prisma.order.count({ where: { deletedAt: null, ...userOrder, createdAt: dateRange } }),
        this.prisma.payment.count({ where: { ...userPayment, status: 'PENDING' } }),
        this.prisma.task.count({
          where: { deletedAt: null, status: 'PENDING', assignedTo: isAdmin ? undefined : userId, dueDate: { lt: now } },
        }),
      ]);

      return {
        newLeads, inProgress, converted,
        revenue: Number(revenueAgg._sum.amount ?? 0),
        newCustomers, totalOrders, pendingPayments, overdueTask,
      };
    });
  }

  /** Lead status breakdown for funnel chart — single groupBy instead of 7 COUNTs */
  async getLeadFunnel(userId: bigint, role: string) {
    const key = this.cacheKey('funnel', userId, role);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const isAdmin = role === 'SUPER_ADMIN' || role === 'MANAGER';
      const baseWhere = isAdmin ? { deletedAt: null } : { deletedAt: null, assignedUserId: userId };

      const groups = await this.prisma.lead.groupBy({
        by: ['status'],
        where: baseWhere,
        _count: true,
      });

      const countMap = new Map(groups.map(g => [g.status, g._count]));
      const statuses = ['POOL', 'ZOOM', 'ASSIGNED', 'IN_PROGRESS', 'CONVERTED', 'LOST', 'FLOATING'] as const;
      return statuses.map(status => ({ status, count: countMap.get(status) || 0 }));
    });
  }

  /** Daily revenue trend for a date range */
  async getRevenueTrend(userId: bigint, role: string, dateFrom: Date, dateTo: Date) {
    const key = this.cacheKey('revenue', userId, role, dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
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
    });
  }

  /** Manager+: top performers by converted leads in period */
  async getTopPerformers(dateFrom: Date, dateTo: Date) {
    const key = this.cacheKey('top', dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
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
    });
  }

  /** Manager+: leads per source in period */
  async getLeadsBySource(dateFrom: Date, dateTo: Date) {
    const key = this.cacheKey('sources', dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
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
      return rows.map(r => ({
        source: r.source_name, total: Number(r.total), converted: Number(r.converted),
        rate: Number(r.total) > 0 ? Math.round(Number(r.converted) / Number(r.total) * 100) : 0,
      }));
    });
  }

  /** Manager+: daily conversion rate trend (new leads vs converted) */
  async getConversionTrend(dateFrom: Date, dateTo: Date) {
    const key = this.cacheKey('conv', dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ day: Date; new_leads: bigint; converted: bigint }[]>`
        SELECT d.day,
          COALESCE(SUM(CASE WHEN l.created_at::date = d.day THEN 1 ELSE 0 END), 0)::bigint as new_leads,
          COALESCE(SUM(CASE WHEN l.status = 'CONVERTED' AND l.updated_at::date = d.day THEN 1 ELSE 0 END), 0)::bigint as converted
        FROM generate_series(${dateFrom}::date, ${dateTo}::date, '1 day'::interval) d(day)
        LEFT JOIN leads l ON l.deleted_at IS NULL AND (l.created_at::date = d.day OR (l.status = 'CONVERTED' AND l.updated_at::date = d.day))
        GROUP BY d.day ORDER BY d.day
      `;
      return rows.map(r => ({
        day: r.day,
        newLeads: Number(r.new_leads),
        converted: Number(r.converted),
      }));
    });
  }

  /** Manager+: lead aging — how many leads haven't been interacted with */
  async getLeadAging(userId: bigint, role: string) {
    const key = this.cacheKey('aging', userId, role);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const isAdmin = role === 'SUPER_ADMIN' || role === 'MANAGER';
      const userFilter = isAdmin ? Prisma.sql`` : Prisma.sql`AND l.assigned_user_id = ${userId}`;

      const rows = await this.prisma.$queryRaw<{ bucket: string; count: bigint }[]>`
        SELECT
          CASE
            WHEN age <= 1 THEN '0-1 ngày'
            WHEN age <= 3 THEN '1-3 ngày'
            WHEN age <= 7 THEN '3-7 ngày'
            ELSE '7+ ngày'
          END as bucket,
          COUNT(*)::bigint as count
        FROM (
          SELECT EXTRACT(DAY FROM NOW() - GREATEST(l.updated_at, COALESCE(la.last_activity, l.updated_at))) as age
          FROM leads l
          LEFT JOIN LATERAL (
            SELECT MAX(a.created_at) as last_activity
            FROM activities a
            WHERE a.entity_type = 'LEAD' AND a.entity_id = l.id AND a.deleted_at IS NULL
          ) la ON true
          WHERE l.deleted_at IS NULL AND l.status IN ('IN_PROGRESS', 'ASSIGNED')
          ${userFilter}
        ) sub
        GROUP BY bucket
        ORDER BY MIN(age)
      `;
      const countMap = new Map(rows.map(r => [r.bucket, Number(r.count)]));
      const buckets = ['0-1 ngày', '1-3 ngày', '3-7 ngày', '7+ ngày'];
      return buckets.map(b => ({ bucket: b, count: countMap.get(b) || 0 }));
    });
  }

  /** Manager+: revenue + leads per department */
  async getDeptPerformance(dateFrom: Date, dateTo: Date) {
    const key = this.cacheKey('dept', dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ dept_id: bigint; dept_name: string; revenue: bigint; leads: bigint; converted: bigint }[]>`
        SELECT d.id as dept_id, d.name as dept_name,
          COALESCE(SUM(CASE WHEN p.status = 'VERIFIED' AND p.verified_at >= ${dateFrom} AND p.verified_at <= ${dateTo} THEN p.amount ELSE 0 END), 0)::bigint as revenue,
          COUNT(DISTINCT CASE WHEN l.created_at >= ${dateFrom} AND l.created_at <= ${dateTo} THEN l.id END)::bigint as leads,
          COUNT(DISTINCT CASE WHEN l.status = 'CONVERTED' AND l.updated_at >= ${dateFrom} AND l.updated_at <= ${dateTo} THEN l.id END)::bigint as converted
        FROM departments d
        LEFT JOIN users u ON u.department_id = d.id AND u.deleted_at IS NULL
        LEFT JOIN leads l ON l.assigned_user_id = u.id AND l.deleted_at IS NULL
        LEFT JOIN orders o ON o.created_by = u.id AND o.deleted_at IS NULL
        LEFT JOIN payments p ON p.order_id = o.id
        WHERE d.deleted_at IS NULL
        GROUP BY d.id, d.name
        ORDER BY revenue DESC
      `;
      return rows.map(r => ({
        deptId: r.dept_id.toString(), name: r.dept_name,
        revenue: Number(r.revenue), leads: Number(r.leads), converted: Number(r.converted),
      }));
    });
  }

  /** Manager+: revenue + leads per team within a department (or all) */
  async getTeamPerformance(dateFrom: Date, dateTo: Date) {
    const key = this.cacheKey('team', dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ team_id: bigint; team_name: string; dept_name: string; revenue: bigint; leads: bigint; converted: bigint; members: bigint }[]>`
        SELECT t.id as team_id, t.name as team_name, d.name as dept_name,
          COALESCE(SUM(CASE WHEN p.status = 'VERIFIED' AND p.verified_at >= ${dateFrom} AND p.verified_at <= ${dateTo} THEN p.amount ELSE 0 END), 0)::bigint as revenue,
          COUNT(DISTINCT CASE WHEN l.created_at >= ${dateFrom} AND l.created_at <= ${dateTo} THEN l.id END)::bigint as leads,
          COUNT(DISTINCT CASE WHEN l.status = 'CONVERTED' AND l.updated_at >= ${dateFrom} AND l.updated_at <= ${dateTo} THEN l.id END)::bigint as converted,
          COUNT(DISTINCT u.id)::bigint as members
        FROM teams t
        JOIN departments d ON d.id = t.department_id
        LEFT JOIN users u ON u.team_id = t.id AND u.deleted_at IS NULL
        LEFT JOIN leads l ON l.assigned_user_id = u.id AND l.deleted_at IS NULL
        LEFT JOIN orders o ON o.created_by = u.id AND o.deleted_at IS NULL
        LEFT JOIN payments p ON p.order_id = o.id
        WHERE t.deleted_at IS NULL
        GROUP BY t.id, t.name, d.name
        ORDER BY revenue DESC
      `;
      return rows.map(r => ({
        teamId: r.team_id.toString(), name: r.team_name, dept: r.dept_name,
        revenue: Number(r.revenue), leads: Number(r.leads), converted: Number(r.converted), members: Number(r.members),
      }));
    });
  }
}
