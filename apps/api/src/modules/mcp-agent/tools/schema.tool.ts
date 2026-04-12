import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hasPermission } from '../mcp-agent-auth.guard';

/** Register get_schema tool — returns available tools, filters, and enum values */
export function registerSchemaTools(
  server: McpServer,
  _prisma: PrismaClient,
  permissions: string[],
): void {
  server.registerTool(
    'get_schema',
    {
      title: 'Get CRM Schema',
      description:
        'Returns available MCP tools, their filters, enum values, and field descriptions. ' +
        'Call this first to understand what data you can query.',
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      if (!hasPermission(permissions, 'mcp:schema:read')) {
        return {
          content: [{ type: 'text' as const, text: 'Permission denied: mcp:schema:read required' }],
          isError: true,
        };
      }

      const schema = {
        server: { name: 'crm-v4-mcp', version: '1.0.0', mode: 'read-only' },
        tools: [
          {
            name: 'search_leads',
            permission: 'mcp:leads:read',
            description: 'Search leads with filters. Returns summary list.',
            filters: {
              search: 'string — search by name, phone, email',
              status: 'POOL | ASSIGNED | IN_PROGRESS | CONVERTED | LOST | FLOATING',
              departmentId: 'string (bigint) — filter by department',
              userId: 'string (bigint) — filter by assigned user',
              sourceId: 'string (bigint) — filter by lead source',
              labelId: 'string (bigint) — filter by label',
              dateFrom: 'ISO date — created after',
              dateTo: 'ISO date — created before',
              limit: 'number 1-100, default 20',
              cursor: 'string (bigint) — cursor for pagination',
            },
          },
          {
            name: 'get_lead_detail',
            permission: 'mcp:leads:read',
            description: 'Get full lead detail by ID, includes recent activities and notes.',
            params: { id: 'string (bigint) — lead ID' },
          },
          {
            name: 'search_customers',
            permission: 'mcp:customers:read',
            description: 'Search customers with filters. Returns summary list.',
            filters: {
              search: 'string — search by name, phone, email',
              status: 'ACTIVE | INACTIVE | FLOATING',
              departmentId: 'string (bigint)',
              userId: 'string (bigint)',
              labelId: 'string (bigint)',
              dateFrom: 'ISO date',
              dateTo: 'ISO date',
              limit: 'number 1-100, default 20',
              cursor: 'string (bigint)',
            },
          },
          {
            name: 'get_customer_detail',
            permission: 'mcp:customers:read',
            description: 'Get full customer detail by ID, includes orders, activities, AI analysis.',
            params: { id: 'string (bigint)' },
          },
          {
            name: 'search_orders',
            permission: 'mcp:orders:read',
            description: 'Search orders with filters.',
            filters: {
              search: 'string — customer name, phone, order key',
              status: 'PENDING | CONFIRMED | COMPLETED | CANCELLED | REFUNDED',
              productId: 'string (bigint)',
              createdBy: 'string (bigint)',
              dateFrom: 'ISO date',
              dateTo: 'ISO date',
              limit: 'number 1-100, default 20',
              cursor: 'string (bigint)',
            },
          },
          {
            name: 'get_order_detail',
            permission: 'mcp:orders:read',
            description: 'Get order detail by ID, includes payments.',
            params: { id: 'string (bigint)' },
          },
          {
            name: 'list_products',
            permission: 'mcp:products:read',
            description: 'List products with optional category filter.',
            filters: {
              categoryId: 'string (bigint)',
              search: 'string — product name',
              limit: 'number 1-100, default 20',
            },
          },
          {
            name: 'get_stats',
            permission: 'mcp:stats:read',
            description: 'Get dashboard KPIs. Supports date range.',
            filters: {
              dateFrom: 'ISO date',
              dateTo: 'ISO date',
              departmentId: 'string (bigint) — scope to department',
            },
          },
          {
            name: 'list_users',
            permission: 'mcp:users:read',
            description: 'List users (name, role, department only — no sensitive fields).',
            filters: {
              departmentId: 'string (bigint)',
              role: 'SUPER_ADMIN | MANAGER | USER',
              limit: 'number 1-100, default 50',
            },
          },
        ],
        enums: {
          LeadStatus: ['POOL', 'ASSIGNED', 'IN_PROGRESS', 'CONVERTED', 'LOST', 'FLOATING'],
          CustomerStatus: ['ACTIVE', 'INACTIVE', 'FLOATING'],
          OrderStatus: ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'REFUNDED'],
          UserRole: ['SUPER_ADMIN', 'MANAGER', 'USER'],
        },
        notes: [
          'All IDs are BigInt serialized as strings',
          'Dates in ISO 8601 format',
          'Vietnamese language context (field names, status labels)',
          'Default limit is 20, max 100 per request',
          'Use cursor for pagination (pass last item ID)',
        ],
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(schema, null, 2) }],
      };
    },
  );
}
