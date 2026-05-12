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
        orders_count: bigint; products_count: bigint; untouched_leads: bigint;
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
             AND t3.created_at >= ${dateFrom} AND t3.created_at <= ${dateTo}) as tasks_completed,
          -- Số đơn NV tạo trong kỳ (alias clearer name; same data as leads_converted nhưng strong intent)
          (SELECT COUNT(*)::bigint FROM orders oc
           WHERE oc.created_by = u.id AND oc.deleted_at IS NULL
             AND oc.created_at >= ${dateFrom} AND oc.created_at <= ${dateTo}) as orders_count,
          -- Số sản phẩm: count orders có product_id (mỗi order có 1 product). Schema không có order_items.
          (SELECT COUNT(*)::bigint FROM orders op
           WHERE op.created_by = u.id AND op.deleted_at IS NULL
             AND op.product_id IS NOT NULL
             AND op.created_at >= ${dateFrom} AND op.created_at <= ${dateTo}) as products_count,
          -- Lead chưa tác nghiệp: assigned cho NV, KHÔNG có activity nào (note/call/order) trên lead đó
          (SELECT COUNT(*)::bigint FROM leads ul
           WHERE ul.assigned_user_id = u.id AND ul.deleted_at IS NULL
             AND ul.last_assigned_at >= ${dateFrom} AND ul.last_assigned_at <= ${dateTo}
             AND NOT EXISTS (
               SELECT 1 FROM activities a
               WHERE a.entity_type = 'LEAD' AND a.entity_id = ul.id
                 AND a.deleted_at IS NULL
             )) as untouched_leads
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
        ordersCount: Number(r.orders_count),
        productsCount: Number(r.products_count),
        untouchedLeads: Number(r.untouched_leads),
      }));
    });
  }

  /**
   * Manager+: per-user call aggregation (Báo cáo cuộc gọi tab).
   *
   * Counting rules:
   * - callsAnswered: OUTGOING + INCOMING với duration > 0 (cuộc thực sự nói chuyện)
   * - callsOutgoing: tất cả OUTGOING (kể cả không nghe máy)
   * - outgoingTotalSeconds: SUM(duration) where OUTGOING
   * - outgoingAvgSeconds: AVG(duration) where OUTGOING AND duration > 0
   */
  async getEmployeeCallReport(dateFrom: Date, dateTo: Date, departmentId?: bigint) {
    const key = this.cacheKey('emp-calls', dateFrom, dateTo, departmentId);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      const deptFilter = departmentId
        ? Prisma.sql`AND u.department_id = ${departmentId}`
        : Prisma.sql``;

      const rows = await this.prisma.$queryRaw<{
        user_id: bigint; name: string; dept_name: string | null;
        calls_answered: bigint; calls_outgoing: bigint;
        outgoing_total_seconds: bigint; outgoing_avg_seconds: number;
      }[]>`
        SELECT
          u.id as user_id, u.name,
          d.name as dept_name,
          COALESCE(SUM(
            CASE WHEN c.call_type IN ('OUTGOING', 'INCOMING') AND c.duration > 0
                 THEN 1 ELSE 0 END
          ), 0)::bigint as calls_answered,
          COALESCE(SUM(
            CASE WHEN c.call_type = 'OUTGOING' THEN 1 ELSE 0 END
          ), 0)::bigint as calls_outgoing,
          COALESCE(SUM(
            CASE WHEN c.call_type = 'OUTGOING' THEN c.duration ELSE 0 END
          ), 0)::bigint as outgoing_total_seconds,
          COALESCE(AVG(
            CASE WHEN c.call_type = 'OUTGOING' AND c.duration > 0 THEN c.duration END
          ), 0)::float as outgoing_avg_seconds
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN call_logs c
          ON c.matched_user_id = u.id
          AND c.deleted_at IS NULL
          AND c.call_time >= ${dateFrom} AND c.call_time <= ${dateTo}
        WHERE u.deleted_at IS NULL AND u.role = 'USER' AND u.status = 'ACTIVE'
          ${deptFilter}
        GROUP BY u.id, u.name, d.name
        ORDER BY calls_outgoing DESC
      `;

      return rows.map(r => ({
        userId: r.user_id.toString(),
        name: r.name,
        deptName: r.dept_name || 'Chưa phân phòng',
        callsAnswered: Number(r.calls_answered),
        callsOutgoing: Number(r.calls_outgoing),
        outgoingTotalSeconds: Number(r.outgoing_total_seconds),
        outgoingAvgSeconds: Math.round(Number(r.outgoing_avg_seconds)),
      }));
    });
  }

  /**
   * Manager+: per-user sales breakdown with dynamic top 7 labels.
   *
   * Logic:
   * 1. Find top 7 labels by total customer count (whole DB, not filtered by date).
   *    Filter is_active=true để loại label đã ngừng dùng. Schema KHÔNG có labels.deleted_at.
   * 2. For each user, count customers per label in top 7, plus "other" (labels ngoài top 7)
   *    và "untouched" (lead user đang giữ chưa có outgoing call duration > 0).
   *
   * Range filter áp dụng cho customer.created_at (KH tạo trong kỳ) và lead.last_assigned_at (lead đang giữ).
   */
  async getEmployeeSalesBreakdown(dateFrom: Date, dateTo: Date, departmentId?: bigint) {
    const key = this.cacheKey('emp-sales', dateFrom, dateTo, departmentId);
    return this.cacheService.getOrSet(key, CACHE_TTL.DASHBOARD, async () => {
      // Step 1: top 7 labels theo total count toàn DB (không filter time)
      const topLabelsRows = await this.prisma.$queryRaw<{
        id: bigint; name: string; color: string; text_color: string;
      }[]>`
        SELECT l.id, l.name, l.color, l.text_color
        FROM labels l
        JOIN customer_labels cl ON cl.label_id = l.id
        JOIN customers c ON c.id = cl.customer_id
        WHERE l.is_active = true
          AND c.deleted_at IS NULL
        GROUP BY l.id, l.name, l.color, l.text_color
        ORDER BY COUNT(cl.customer_id) DESC
        LIMIT 7
      `;

      const topLabels = topLabelsRows.map(l => ({
        id: l.id.toString(),
        name: l.name,
        color: l.color,
        textColor: l.text_color,
      }));
      const topLabelIds = topLabelsRows.map(l => l.id);

      const deptFilter = departmentId
        ? Prisma.sql`AND u.department_id = ${departmentId}`
        : Prisma.sql``;

      // Step 2: per-user breakdown
      // labelCounts: chỉ count customer có ≥1 label trong top 7 (assigned cho user)
      // otherCount: customer của user có label NHƯNG không có label nào trong top 7
      // untouchedCount: lead user đang giữ chưa có outgoing call > 0 trong kỳ
      const topLabelIdsArray = topLabelIds.length > 0
        ? Prisma.sql`ARRAY[${Prisma.join(topLabelIds)}]::bigint[]`
        : Prisma.sql`ARRAY[]::bigint[]`;

      const rows = await this.prisma.$queryRaw<{
        user_id: bigint; name: string; dept_name: string | null;
        label_counts: Record<string, number> | null;
        other_count: bigint; untouched_count: bigint;
      }[]>`
        WITH top_label_ids AS (
          SELECT unnest(${topLabelIdsArray}) AS label_id
        ),
        user_label_counts AS (
          SELECT
            c.assigned_user_id,
            cl.label_id,
            COUNT(DISTINCT c.id) AS cnt
          FROM customers c
          JOIN customer_labels cl ON cl.customer_id = c.id
          WHERE c.deleted_at IS NULL
            AND c.created_at >= ${dateFrom} AND c.created_at <= ${dateTo}
            AND c.assigned_user_id IS NOT NULL
          GROUP BY c.assigned_user_id, cl.label_id
        ),
        user_other_count AS (
          SELECT
            c.assigned_user_id,
            COUNT(DISTINCT c.id) AS cnt
          FROM customers c
          WHERE c.deleted_at IS NULL
            AND c.created_at >= ${dateFrom} AND c.created_at <= ${dateTo}
            AND c.assigned_user_id IS NOT NULL
            AND EXISTS (
              SELECT 1 FROM customer_labels cl
              WHERE cl.customer_id = c.id
                AND cl.label_id NOT IN (SELECT label_id FROM top_label_ids)
            )
            AND NOT EXISTS (
              SELECT 1 FROM customer_labels cl
              WHERE cl.customer_id = c.id
                AND cl.label_id IN (SELECT label_id FROM top_label_ids)
            )
          GROUP BY c.assigned_user_id
        ),
        user_untouched AS (
          SELECT
            l.assigned_user_id,
            COUNT(*) AS cnt
          FROM leads l
          WHERE l.deleted_at IS NULL
            AND l.assigned_user_id IS NOT NULL
            AND l.last_assigned_at >= ${dateFrom} AND l.last_assigned_at <= ${dateTo}
            AND NOT EXISTS (
              SELECT 1 FROM call_logs cl
              WHERE cl.matched_entity_type = 'LEAD' AND cl.matched_entity_id = l.id
                AND cl.call_type = 'OUTGOING' AND cl.duration > 0
                AND cl.deleted_at IS NULL
            )
          GROUP BY l.assigned_user_id
        )
        SELECT
          u.id as user_id, u.name, d.name as dept_name,
          (
            SELECT jsonb_object_agg(ulc.label_id::text, ulc.cnt)
            FROM user_label_counts ulc
            WHERE ulc.assigned_user_id = u.id
              AND ulc.label_id IN (SELECT label_id FROM top_label_ids)
          ) AS label_counts,
          COALESCE((SELECT cnt FROM user_other_count uoc WHERE uoc.assigned_user_id = u.id), 0)::bigint AS other_count,
          COALESCE((SELECT cnt FROM user_untouched uu WHERE uu.assigned_user_id = u.id), 0)::bigint AS untouched_count
        FROM users u
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.deleted_at IS NULL AND u.role = 'USER' AND u.status = 'ACTIVE'
          ${deptFilter}
        ORDER BY u.name
      `;

      return {
        topLabels,
        rows: rows.map(r => {
          const lc: Record<string, number> = {};
          if (r.label_counts) {
            for (const [k, v] of Object.entries(r.label_counts)) {
              lc[k] = Number(v);
            }
          }
          return {
            userId: r.user_id.toString(),
            name: r.name,
            deptName: r.dept_name || 'Chưa phân phòng',
            labelCounts: lc,
            otherCount: Number(r.other_count),
            untouchedCount: Number(r.untouched_count),
          };
        }),
      };
    });
  }

  /**
   * Drill-down: paginated customer list for a user + filter mode.
   *
   * Modes (mutually exclusive):
   * - labelId: customers của user có gắn label X
   * - untouched=true: leads của user chưa có outgoing call duration > 0
   * - other=true (cả labelId và untouched đều undefined/false): customers của user có label nhưng KHÔNG nằm trong top 7
   */
  async getEmployeeSalesBreakdownCustomers(params: {
    userId: bigint;
    labelId?: bigint;
    untouched?: boolean;
    other?: boolean;
    dateFrom: Date;
    dateTo: Date;
    cursor?: bigint;
    limit?: number;
  }) {
    const { userId, labelId, untouched, other, dateFrom, dateTo, cursor } = params;
    const limit = Math.min(params.limit ?? 50, 200);

    // Untouched mode → lead list
    if (untouched) {
      const cursorFilter = cursor ? Prisma.sql`AND l.id < ${cursor}` : Prisma.sql``;
      const rows = await this.prisma.$queryRaw<{
        id: bigint; name: string; phone: string;
        last_activity_at: Date | null;
      }[]>`
        SELECT l.id, l.name, l.phone,
          (SELECT MAX(a.created_at) FROM activities a
           WHERE a.entity_type = 'LEAD' AND a.entity_id = l.id AND a.deleted_at IS NULL) as last_activity_at
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.assigned_user_id = ${userId}
          AND l.last_assigned_at >= ${dateFrom} AND l.last_assigned_at <= ${dateTo}
          AND NOT EXISTS (
            SELECT 1 FROM call_logs cl
            WHERE cl.matched_entity_type = 'LEAD' AND cl.matched_entity_id = l.id
              AND cl.call_type = 'OUTGOING' AND cl.duration > 0
              AND cl.deleted_at IS NULL
          )
          ${cursorFilter}
        ORDER BY l.id DESC
        LIMIT ${limit + 1}
      `;

      const totalRow = await this.prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*)::bigint as total
        FROM leads l
        WHERE l.deleted_at IS NULL
          AND l.assigned_user_id = ${userId}
          AND l.last_assigned_at >= ${dateFrom} AND l.last_assigned_at <= ${dateTo}
          AND NOT EXISTS (
            SELECT 1 FROM call_logs cl
            WHERE cl.matched_entity_type = 'LEAD' AND cl.matched_entity_id = l.id
              AND cl.call_type = 'OUTGOING' AND cl.duration > 0
              AND cl.deleted_at IS NULL
          )
      `;

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;
      return {
        data: items.map(r => ({
          id: r.id.toString(),
          name: r.name,
          phone: r.phone,
          labels: [],
          lastActivityAt: r.last_activity_at?.toISOString() || null,
          ordersCount: 0,
          totalRevenue: 0,
        })),
        cursor: hasMore ? items[items.length - 1].id.toString() : null,
        total: Number(totalRow[0]?.total ?? 0),
      };
    }

    // Customer list mode (labelId or other)
    // Common filters
    const customerFilters: Prisma.Sql[] = [
      Prisma.sql`c.deleted_at IS NULL`,
      Prisma.sql`c.assigned_user_id = ${userId}`,
      Prisma.sql`c.created_at >= ${dateFrom}`,
      Prisma.sql`c.created_at <= ${dateTo}`,
    ];

    if (labelId) {
      customerFilters.push(Prisma.sql`EXISTS (
        SELECT 1 FROM customer_labels cl
        WHERE cl.customer_id = c.id AND cl.label_id = ${labelId}
      )`);
    } else if (other) {
      // "Other" mode: customer có label nhưng KHÔNG nằm trong top 7
      // Cần re-query top 7 để filter chính xác
      const topLabelsRows = await this.prisma.$queryRaw<{ id: bigint }[]>`
        SELECT l.id
        FROM labels l
        JOIN customer_labels cl ON cl.label_id = l.id
        JOIN customers c ON c.id = cl.customer_id
        WHERE l.is_active = true AND c.deleted_at IS NULL
        GROUP BY l.id
        ORDER BY COUNT(cl.customer_id) DESC
        LIMIT 7
      `;
      const topIds = topLabelsRows.map(r => r.id);
      const topIdsSql = topIds.length > 0
        ? Prisma.sql`ARRAY[${Prisma.join(topIds)}]::bigint[]`
        : Prisma.sql`ARRAY[]::bigint[]`;
      customerFilters.push(Prisma.sql`EXISTS (
        SELECT 1 FROM customer_labels cl
        WHERE cl.customer_id = c.id AND cl.label_id != ALL(${topIdsSql})
      )`);
      customerFilters.push(Prisma.sql`NOT EXISTS (
        SELECT 1 FROM customer_labels cl2
        WHERE cl2.customer_id = c.id AND cl2.label_id = ANY(${topIdsSql})
      )`);
    }

    // Cursor filter chỉ áp cho query list, KHÔNG cho count
    const baseWhereSql = Prisma.join(customerFilters, ' AND ');
    const listWhereSql = cursor
      ? Prisma.sql`${baseWhereSql} AND c.id < ${cursor}`
      : baseWhereSql;

    const rows = await this.prisma.$queryRaw<{
      id: bigint; name: string; phone: string;
      labels: { id: string; name: string; color: string }[] | null;
      last_activity_at: Date | null;
      orders_count: bigint; total_revenue: bigint;
    }[]>`
      SELECT c.id, c.name, c.phone,
        (
          SELECT jsonb_agg(jsonb_build_object('id', l.id::text, 'name', l.name, 'color', l.color))
          FROM customer_labels cl JOIN labels l ON l.id = cl.label_id
          WHERE cl.customer_id = c.id
        ) AS labels,
        (
          SELECT MAX(a.created_at)
          FROM activities a
          WHERE a.entity_type = 'CUSTOMER' AND a.entity_id = c.id AND a.deleted_at IS NULL
        ) AS last_activity_at,
        (
          SELECT COUNT(*)::bigint FROM orders o
          WHERE o.customer_id = c.id AND o.deleted_at IS NULL
        ) AS orders_count,
        (
          SELECT COALESCE(SUM(p.amount), 0)::bigint
          FROM payments p
          JOIN orders o2 ON o2.id = p.order_id
          WHERE o2.customer_id = c.id AND o2.deleted_at IS NULL AND p.status = 'VERIFIED'
        ) AS total_revenue
      FROM customers c
      WHERE ${listWhereSql}
      ORDER BY c.id DESC
      LIMIT ${limit + 1}
    `;

    const totalRow = await this.prisma.$queryRaw<{ total: bigint }[]>`
      SELECT COUNT(*)::bigint AS total
      FROM customers c
      WHERE ${baseWhereSql}
    `;

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      data: items.map(r => ({
        id: r.id.toString(),
        name: r.name,
        phone: r.phone,
        labels: r.labels || [],
        lastActivityAt: r.last_activity_at?.toISOString() || null,
        ordersCount: Number(r.orders_count),
        totalRevenue: Number(r.total_revenue),
      })),
      cursor: hasMore ? items[items.length - 1].id.toString() : null,
      total: Number(totalRow[0]?.total ?? 0),
    };
  }
}
