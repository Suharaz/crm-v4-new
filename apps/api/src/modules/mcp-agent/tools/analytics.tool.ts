import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { DashboardService } from '../../dashboard/dashboard.service';
import { hasPermission } from '../mcp-agent-auth.guard';

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/** Fake admin user for DashboardService calls (MCP has no user context) */
const ADMIN_USER_ID = BigInt(1);
const ADMIN_ROLE = 'SUPER_ADMIN';

const dateRangeSchema = z.object({
  dateFrom: z.string().describe('Period start (ISO date, e.g. 2026-04-01)'),
  dateTo: z.string().describe('Period end (ISO date, e.g. 2026-04-12)'),
});

type DateRangeParams = z.infer<typeof dateRangeSchema>;

export function registerAnalyticsTools(
  server: McpServer,
  prisma: PrismaClient,
  dashboard: DashboardService,
  permissions: string[],
): void {
  // ── 1. Revenue Trend ─────────────────────────────────────────
  server.registerTool(
    'get_revenue_trend',
    {
      title: 'Revenue Trend',
      description:
        'Daily revenue breakdown for a date range. ' +
        'Shows verified payment totals per day — use for line/bar charts.',
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: DateRangeParams) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const data = await dashboard.getRevenueTrend(
          ADMIN_USER_ID, ADMIN_ROLE,
          new Date(params.dateFrom), new Date(params.dateTo + 'T23:59:59Z'),
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify({ data }, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 2. Top Performers ────────────────────────────────────────
  server.registerTool(
    'get_top_performers',
    {
      title: 'Top Sales Performers',
      description:
        'Ranking of sales users by converted leads and revenue in a date range. ' +
        'Top 10 performers. Use for leaderboard.',
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: DateRangeParams) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const data = await dashboard.getTopPerformers(
          new Date(params.dateFrom), new Date(params.dateTo + 'T23:59:59Z'),
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify({ data }, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 3. Department Performance ────────────────────────────────
  server.registerTool(
    'get_dept_performance',
    {
      title: 'Department Performance',
      description:
        'Revenue, leads, and conversions per department in a date range. ' +
        'Compare departments side by side.',
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: DateRangeParams) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const data = await dashboard.getDeptPerformance(
          new Date(params.dateFrom), new Date(params.dateTo + 'T23:59:59Z'),
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify({ data }, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 4. Team Performance ──────────────────────────────────────
  server.registerTool(
    'get_team_performance',
    {
      title: 'Team Performance',
      description:
        'Revenue, leads, conversions, and member count per team. ' +
        'Drill down within departments to compare teams.',
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: DateRangeParams) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const data = await dashboard.getTeamPerformance(
          new Date(params.dateFrom), new Date(params.dateTo + 'T23:59:59Z'),
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify({ data }, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 5. Leads by Source ───────────────────────────────────────
  server.registerTool(
    'get_leads_by_source',
    {
      title: 'Leads by Source',
      description:
        'Lead count, converted count, and conversion rate per lead source. ' +
        'Shows which acquisition channels perform best.',
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: DateRangeParams) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const data = await dashboard.getLeadsBySource(
          new Date(params.dateFrom), new Date(params.dateTo + 'T23:59:59Z'),
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify({ data }, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 6. Conversion Trend ──────────────────────────────────────
  server.registerTool(
    'get_conversion_trend',
    {
      title: 'Conversion Trend',
      description:
        'Daily new leads vs converted leads trend. ' +
        'Shows if conversion rate is improving or declining over time.',
      inputSchema: dateRangeSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: DateRangeParams) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const data = await dashboard.getConversionTrend(
          new Date(params.dateFrom), new Date(params.dateTo + 'T23:59:59Z'),
        );
        return { content: [{ type: 'text' as const, text: JSON.stringify({ data }, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 7. Lead Aging ────────────────────────────────────────────
  server.registerTool(
    'get_lead_aging',
    {
      title: 'Lead Aging',
      description:
        'How many active leads (IN_PROGRESS/ASSIGNED) have not been interacted with. ' +
        'Buckets: 0-1 day, 1-3 days, 3-7 days, 7+ days. Identifies stale leads.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const data = await dashboard.getLeadAging(ADMIN_USER_ID, ADMIN_ROLE);
        return { content: [{ type: 'text' as const, text: JSON.stringify({ data }, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );

  // ── 8. Lead Quality / ROI Analysis ───────────────────────────
  server.registerTool(
    'analyze_lead_quality',
    {
      title: 'Lead Quality & ROI Analysis',
      description:
        'Analyze lead quality with optional ads spend for ROI calculation. ' +
        'Returns: total leads, converted, conversion rate, revenue. ' +
        'If adSpend provided: CPL (cost per lead), CPA (cost per acquisition), ROAS. ' +
        'Breakdown by source included.',
      inputSchema: z.object({
        dateFrom: z.string().describe('Period start (ISO date)'),
        dateTo: z.string().describe('Period end (ISO date)'),
        adSpend: z.number().optional().describe('Total advertising spend in VND for the period'),
        sourceId: z.string().optional().describe('Filter to specific lead source ID'),
      }),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (params: { dateFrom: string; dateTo: string; adSpend?: number; sourceId?: string }) => {
      if (!hasPermission(permissions, 'mcp:stats:read')) {
        return { content: [{ type: 'text' as const, text: 'Permission denied: mcp:stats:read required' }], isError: true };
      }
      try {
        const from = new Date(params.dateFrom);
        const to = new Date(params.dateTo + 'T23:59:59Z');

        // Get source breakdown from existing method
        const sourceData = await dashboard.getLeadsBySource(from, to);

        // If sourceId filter, narrow down
        const filtered = params.sourceId
          ? sourceData.filter((s: { source: string }) => s.source !== 'Không rõ') // filter known sources
          : sourceData;

        // Aggregate totals
        const totalLeads = filtered.reduce((sum: number, s: { total: number }) => sum + s.total, 0);
        const totalConverted = filtered.reduce((sum: number, s: { converted: number }) => sum + s.converted, 0);
        const conversionRate = totalLeads > 0 ? Math.round((totalConverted / totalLeads) * 100 * 10) / 10 : 0;

        // Get revenue for the period
        const revenueAgg = await prisma.payment.aggregate({
          _sum: { amount: true },
          where: { status: 'VERIFIED', verifiedAt: { gte: from, lte: to } },
        });
        const revenue = Number(revenueAgg._sum.amount ?? 0);

        // ROI calculations (only if adSpend provided)
        const roi = params.adSpend && params.adSpend > 0 ? {
          adSpend: params.adSpend,
          costPerLead: Math.round(params.adSpend / Math.max(totalLeads, 1)),
          costPerAcquisition: totalConverted > 0 ? Math.round(params.adSpend / totalConverted) : null,
          roas: Math.round((revenue / params.adSpend) * 100) / 100,
          roasPercent: `${Math.round((revenue / params.adSpend) * 100)}%`,
        } : null;

        const result = {
          period: { from: from.toISOString(), to: to.toISOString() },
          summary: { totalLeads, totalConverted, conversionRate: `${conversionRate}%`, revenue },
          roi,
          bySource: filtered,
        };

        return { content: [{ type: 'text' as const, text: JSON.stringify(result, bigIntReplacer, 2) }] };
      } catch (err) {
        return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true };
      }
    },
  );
}
