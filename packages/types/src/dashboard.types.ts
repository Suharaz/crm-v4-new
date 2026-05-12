/**
 * Shared dashboard types between API and Web apps.
 * Note: All BigInt IDs are serialized as string via BigIntSerializerInterceptor.
 */

import type { BigIntString } from './index';

// ── Employee scores (Báo cáo tổng) ──────────────────────────────────────────

export interface EmployeeScoreRaw {
  userId: BigIntString;
  name: string;
  deptName: string;
  deptId: BigIntString | null;
  leadsAssigned: number;
  leadsConverted: number;
  revenue: number;
  overdueTasks: number;
  agingLeads7d: number;
  tasksTotal: number;
  tasksCompleted: number;
  /** Số đơn user tạo trong kỳ (deleted_at IS NULL) */
  ordersCount: number;
  /** Số sản phẩm (count orders có product_id IS NOT NULL) */
  productsCount: number;
  /** Lead assigned cho user nhưng chưa có activity nào (note/call/order) */
  untouchedLeads: number;
}

// ── Call report (Báo cáo cuộc gọi) ──────────────────────────────────────────

export interface EmployeeCallReportRow {
  userId: BigIntString;
  name: string;
  deptName: string;
  /** OUTGOING + INCOMING với duration > 0 */
  callsAnswered: number;
  /** Tổng OUTGOING (kể cả không nghe máy) */
  callsOutgoing: number;
  /** SUM(duration) where call_type = OUTGOING (giây) */
  outgoingTotalSeconds: number;
  /** AVG(duration) where call_type = OUTGOING AND duration > 0 (giây) */
  outgoingAvgSeconds: number;
}

// ── Sales breakdown (Bán hàng - dynamic columns) ────────────────────────────

export interface TopLabel {
  id: BigIntString;
  name: string;
  color: string;
  textColor: string;
}

export interface SalesBreakdownRow {
  userId: BigIntString;
  name: string;
  deptName: string;
  /** Map labelId → count, chỉ chứa top 7 label */
  labelCounts: Record<string, number>;
  /** Tổng customer có label ngoài top 7 (chỉ thuộc về user này) */
  otherCount: number;
  /** Lead user đang giữ chưa có outgoing call duration > 0 */
  untouchedCount: number;
}

export interface EmployeeSalesBreakdownResponse {
  topLabels: TopLabel[];
  rows: SalesBreakdownRow[];
}

// ── Drill-down customers (side-panel) ───────────────────────────────────────

export interface DrillDownCustomerLabel {
  id: BigIntString;
  name: string;
  color: string;
}

export interface DrillDownCustomerItem {
  id: BigIntString;
  name: string;
  phone: string;
  labels: DrillDownCustomerLabel[];
  lastActivityAt: string | null;
  ordersCount: number;
  totalRevenue: number;
}

export interface DrillDownCustomersResponse {
  data: DrillDownCustomerItem[];
  cursor: string | null;
  total: number;
}
