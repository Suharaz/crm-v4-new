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

  /** Lead status breakdown for funnel chart - single groupBy instead of 7 COUNTs */
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

  /**
   * Manager+: top performers by orders + revenue in period.
   * Converted = orders created by user (last-touch). Cartesian-product fixed.
   */
  async getTopPerformers(dateFrom: Date, dateTo: Date) {
    const key = this.cacheKey('top', dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ user_id: bigint; name: string; converted: bigint; revenue: bigint }[]>`
        SELECT u.id as user_id, u.name,
          (SELECT COUNT(*)::bigint FROM orders o
           WHERE o.created_by = u.id AND o.deleted_at IS NULL
             AND o.created_at >= ${dateFrom} AND o.created_at <= ${dateTo}) as converted,
          (SELECT COALESCE(SUM(p.amount), 0)::bigint
           FROM payments p
           JOIN orders o2 ON o2.id = p.order_id AND o2.deleted_at IS NULL
           WHERE o2.created_by = u.id
             AND p.status = 'VERIFIED'
             AND p.verified_at >= ${dateFrom} AND p.verified_at <= ${dateTo}) as revenue
        FROM users u
        WHERE u.deleted_at IS NULL AND u.role = 'USER'
        ORDER BY revenue DESC
        LIMIT 10
      `;
      // Filter out zero-activity users (HAVING-equivalent)
      return rows
        .filter(r => Number(r.converted) > 0 || Number(r.revenue) > 0)
        .map(r => ({ userId: r.user_id.toString(), name: r.name, converted: Number(r.converted), revenue: Number(r.revenue) }));
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

  /** Manager+: lead aging - how many leads haven't been interacted with */
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

  /**
   * Manager+: revenue + leads per department.
   *
   * Uses correlated subqueries to avoid Cartesian product (previous version
   * had `JOIN leads + JOIN orders + JOIN payments` which inflated revenue
   * by the number of leads per user).
   */
  async getDeptPerformance(dateFrom: Date, dateTo: Date) {
    const key = this.cacheKey('dept', dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ dept_id: bigint; dept_name: string; revenue: bigint; leads: bigint; converted: bigint }[]>`
        SELECT d.id as dept_id, d.name as dept_name,
          (SELECT COALESCE(SUM(p.amount), 0)::bigint
           FROM payments p
           JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
           JOIN users u ON u.id = o.created_by AND u.department_id = d.id AND u.deleted_at IS NULL
           WHERE p.status = 'VERIFIED'
             AND p.verified_at >= ${dateFrom} AND p.verified_at <= ${dateTo}) as revenue,
          (SELECT COUNT(*)::bigint
           FROM leads l
           JOIN users u2 ON u2.id = l.assigned_user_id AND u2.department_id = d.id AND u2.deleted_at IS NULL
           WHERE l.deleted_at IS NULL
             AND l.created_at >= ${dateFrom} AND l.created_at <= ${dateTo}) as leads,
          (SELECT COUNT(*)::bigint
           FROM orders o3
           JOIN users u3 ON u3.id = o3.created_by AND u3.department_id = d.id AND u3.deleted_at IS NULL
           WHERE o3.deleted_at IS NULL
             AND o3.created_at >= ${dateFrom} AND o3.created_at <= ${dateTo}) as converted
        FROM departments d
        WHERE d.deleted_at IS NULL
        ORDER BY revenue DESC
      `;
      return rows.map(r => ({
        deptId: r.dept_id.toString(), name: r.dept_name,
        revenue: Number(r.revenue), leads: Number(r.leads), converted: Number(r.converted),
      }));
    });
  }

  /**
   * Manager+: revenue + leads per team within a department (or all).
   * Same Cartesian-product fix as getDeptPerformance - uses correlated subqueries.
   */
  async getTeamPerformance(dateFrom: Date, dateTo: Date) {
    const key = this.cacheKey('team', dateFrom, dateTo);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const rows = await this.prisma.$queryRaw<{ team_id: bigint; team_name: string; dept_name: string; revenue: bigint; leads: bigint; converted: bigint; members: bigint }[]>`
        SELECT t.id as team_id, t.name as team_name, d.name as dept_name,
          (SELECT COUNT(*)::bigint FROM users u
           WHERE u.team_id = t.id AND u.deleted_at IS NULL) as members,
          (SELECT COALESCE(SUM(p.amount), 0)::bigint
           FROM payments p
           JOIN orders o ON o.id = p.order_id AND o.deleted_at IS NULL
           JOIN users u ON u.id = o.created_by AND u.team_id = t.id AND u.deleted_at IS NULL
           WHERE p.status = 'VERIFIED'
             AND p.verified_at >= ${dateFrom} AND p.verified_at <= ${dateTo}) as revenue,
          (SELECT COUNT(*)::bigint
           FROM leads l
           JOIN users u2 ON u2.id = l.assigned_user_id AND u2.team_id = t.id AND u2.deleted_at IS NULL
           WHERE l.deleted_at IS NULL
             AND l.created_at >= ${dateFrom} AND l.created_at <= ${dateTo}) as leads,
          (SELECT COUNT(*)::bigint
           FROM orders o3
           JOIN users u3 ON u3.id = o3.created_by AND u3.team_id = t.id AND u3.deleted_at IS NULL
           WHERE o3.deleted_at IS NULL
             AND o3.created_at >= ${dateFrom} AND o3.created_at <= ${dateTo}) as converted
        FROM teams t
        JOIN departments d ON d.id = t.department_id
        WHERE t.deleted_at IS NULL
        ORDER BY revenue DESC
      `;
      return rows.map(r => ({
        teamId: r.team_id.toString(), name: r.team_name, dept: r.dept_name,
        revenue: Number(r.revenue), leads: Number(r.leads), converted: Number(r.converted), members: Number(r.members),
      }));
    });
  }

  /**
   * Manager+: employee scorecard - all metrics needed for score calculation.
   *
   * Counting rules (agreed with PM):
   * - leads_assigned: COUNT of assignment_history records where to_user_id = NV in period.
   *   → If lead transferred A→B, both A and B get +1 (counts each receive event).
   * - leads_converted: COUNT of orders NV created in period (created_by + created_at).
   * - revenue: SUM of VERIFIED payments verified in period, from orders NV created.
   * - overdue_tasks: PENDING tasks past due (current state, not period-bound).
   * - aging_leads_7d: leads currently held by NV, untouched 7+ days (current state).
   * - tasks_total / tasks_completed: tasks created in period.
   */
  async getEmployeeScores(dateFrom: Date, dateTo: Date, departmentId?: bigint) {
    const key = this.cacheKey('emp-scores', dateFrom, dateTo, departmentId);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const deptFilter = departmentId
        ? Prisma.sql`AND u.department_id = ${departmentId}`
        : Prisma.sql``;

      const rows = await this.prisma.$queryRaw<{
        user_id: bigint; name: string; dept_name: string | null; dept_id: bigint | null;
        leads_assigned: bigint; leads_converted: bigint; revenue: bigint;
        overdue_tasks: bigint; aging_leads_7d: bigint;
        tasks_total: bigint; tasks_completed: bigint;
      }[]>`
        SELECT
          u.id as user_id, u.name,
          d.name as dept_name, d.id as dept_id,
          -- Leads nhận trong kỳ: mỗi lần nhận = 1 count (transfer A→B → cả A và B đều +1)
          (SELECT COUNT(*)::bigint FROM assignment_history ah
           WHERE ah.entity_type = 'LEAD' AND ah.to_user_id = u.id
             AND ah.created_at >= ${dateFrom} AND ah.created_at <= ${dateTo}) as leads_assigned,
          -- Convert trong kỳ: orders NV tạo trong kỳ (last-touch attribution)
          (SELECT COUNT(*)::bigint FROM orders o
           WHERE o.created_by = u.id AND o.deleted_at IS NULL
             AND o.created_at >= ${dateFrom} AND o.created_at <= ${dateTo}) as leads_converted,
          -- Revenue: payments VERIFIED trong kỳ từ orders NV tạo
          (SELECT COALESCE(SUM(p.amount), 0)::bigint FROM payments p
           JOIN orders o2 ON o2.id = p.order_id
           WHERE o2.created_by = u.id AND o2.deleted_at IS NULL
             AND p.status = 'VERIFIED'
             AND p.verified_at >= ${dateFrom} AND p.verified_at <= ${dateTo}) as revenue,
          -- Tasks quá hạn (current state, không filter period)
          (SELECT COUNT(*)::bigint FROM tasks t
           WHERE t.assigned_to = u.id AND t.deleted_at IS NULL
             AND t.status = 'PENDING' AND t.due_date < NOW()) as overdue_tasks,
          -- Leads aging: đang giữ + IN_PROGRESS/ASSIGNED + 7+ ngày không tương tác
          (SELECT COUNT(*)::bigint FROM leads al
           WHERE al.assigned_user_id = u.id AND al.deleted_at IS NULL
             AND al.status IN ('IN_PROGRESS', 'ASSIGNED')
             AND al.updated_at < NOW() - INTERVAL '7 days') as aging_leads_7d,
          -- Tasks total/completed trong kỳ (cho task completion rate)
          (SELECT COUNT(*)::bigint FROM tasks t2
           WHERE t2.assigned_to = u.id AND t2.deleted_at IS NULL
             AND t2.created_at >= ${dateFrom} AND t2.created_at <= ${dateTo}) as tasks_total,
          (SELECT COUNT(*)::bigint FROM tasks t3
           WHERE t3.assigned_to = u.id AND t3.deleted_at IS NULL
             AND t3.status = 'COMPLETED'
             AND t3.created_at >= ${dateFrom} AND t3.created_at <= ${dateTo}) as tasks_completed
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.deleted_at IS NULL AND u.role = 'USER' AND u.status = 'ACTIVE'
          ${deptFilter}
        ORDER BY revenue DESC
      `;

      return rows.map(r => ({
        userId: r.user_id.toString(),
        name: r.name,
        deptName: r.dept_name || 'Chưa phân phòng',
        deptId: r.dept_id?.toString() || null,
        leadsAssigned: Number(r.leads_assigned),
        leadsConverted: Number(r.leads_converted),
        revenue: Number(r.revenue),
        overdueTasks: Number(r.overdue_tasks),
        agingLeads7d: Number(r.aging_leads_7d),
        tasksTotal: Number(r.tasks_total),
        tasksCompleted: Number(r.tasks_completed),
      }));
    });
  }
}
