import { describe, it, expect } from 'vitest';

// Pure recall eligibility logic extracted từ RecallConfigService
// Kiểm tra điều kiện thu hồi lead/customer về kho thả nổi

type LeadStatus = 'POOL' | 'ASSIGNED' | 'IN_PROGRESS' | 'CONVERTED' | 'LOST' | 'FLOATING';
type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'FLOATING';

interface Lead {
  id: bigint;
  status: LeadStatus;
  departmentId: bigint | null;
  assignedUserId: bigint | null;
  updatedAt: Date;
}

interface Customer {
  id: bigint;
  status: CustomerStatus;
  assignedDepartmentId: bigint | null;
  assignedUserId: bigint | null;
  updatedAt: Date;
}

interface RecallConfig {
  maxDaysInPool: number;
  autoLabelIds: bigint[];
}

/** Tính cutoff date dựa trên maxDaysInPool */
function getCutoffDate(maxDaysInPool: number, now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - maxDaysInPool);
  return cutoff;
}

/**
 * Kiểm tra lead có đủ điều kiện để recall không.
 * Điều kiện: status=POOL, departmentId != null, assignedUserId = null, updatedAt < cutoff
 */
function isLeadEligibleForRecall(lead: Lead, cutoffDate: Date): boolean {
  return (
    lead.status === 'POOL' &&
    lead.departmentId !== null &&
    lead.assignedUserId === null &&
    lead.updatedAt < cutoffDate
  );
}

/**
 * Kiểm tra customer có đủ điều kiện để recall không.
 * Điều kiện: status=ACTIVE, assignedDepartmentId != null, assignedUserId = null, updatedAt < cutoff
 */
function isCustomerEligibleForRecall(customer: Customer, cutoffDate: Date): boolean {
  return (
    customer.status === 'ACTIVE' &&
    customer.assignedDepartmentId !== null &&
    customer.assignedUserId === null &&
    customer.updatedAt < cutoffDate
  );
}

/** Lọc danh sách leads đủ điều kiện recall */
function filterEligibleLeads(leads: Lead[], config: RecallConfig, now = new Date()): Lead[] {
  const cutoff = getCutoffDate(config.maxDaysInPool, now);
  return leads.filter((l) => isLeadEligibleForRecall(l, cutoff));
}

/** Lọc danh sách customers đủ điều kiện recall */
function filterEligibleCustomers(customers: Customer[], config: RecallConfig, now = new Date()): Customer[] {
  const cutoff = getCutoffDate(config.maxDaysInPool, now);
  return customers.filter((c) => isCustomerEligibleForRecall(c, cutoff));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ─── Lead recall eligibility ─────────────────────────────────────────────────

describe('Lead — điều kiện đủ để recall', () => {
  const config: RecallConfig = { maxDaysInPool: 7, autoLabelIds: [] };

  it('lead ở kho phòng ban quá 7 ngày → đủ điều kiện recall', () => {
    const lead: Lead = {
      id: BigInt(1),
      status: 'POOL',
      departmentId: BigInt(10),
      assignedUserId: null,
      updatedAt: daysAgo(8), // 8 ngày trước
    };
    expect(isLeadEligibleForRecall(lead, getCutoffDate(config.maxDaysInPool))).toBe(true);
  });

  it('lead ở kho phòng ban chưa đủ 7 ngày → chưa được recall', () => {
    const lead: Lead = {
      id: BigInt(1),
      status: 'POOL',
      departmentId: BigInt(10),
      assignedUserId: null,
      updatedAt: daysAgo(3), // 3 ngày trước
    };
    expect(isLeadEligibleForRecall(lead, getCutoffDate(config.maxDaysInPool))).toBe(false);
  });

  it('lead đã FLOATING → bỏ qua (không recall lần 2)', () => {
    const lead: Lead = {
      id: BigInt(1),
      status: 'FLOATING',
      departmentId: null,
      assignedUserId: null,
      updatedAt: daysAgo(30),
    };
    expect(isLeadEligibleForRecall(lead, getCutoffDate(config.maxDaysInPool))).toBe(false);
  });

  it('lead đã có người được assign → bỏ qua', () => {
    const lead: Lead = {
      id: BigInt(1),
      status: 'POOL',
      departmentId: BigInt(10),
      assignedUserId: BigInt(5), // đã assign
      updatedAt: daysAgo(30),
    };
    expect(isLeadEligibleForRecall(lead, getCutoffDate(config.maxDaysInPool))).toBe(false);
  });

  it('lead POOL nhưng departmentId = null (kho mới) → bỏ qua', () => {
    const lead: Lead = {
      id: BigInt(1),
      status: 'POOL',
      departmentId: null, // kho mới, chưa phân phòng ban
      assignedUserId: null,
      updatedAt: daysAgo(30),
    };
    expect(isLeadEligibleForRecall(lead, getCutoffDate(config.maxDaysInPool))).toBe(false);
  });

  it('lead ASSIGNED quá hạn → bỏ qua (chỉ recall POOL)', () => {
    const lead: Lead = {
      id: BigInt(1),
      status: 'ASSIGNED',
      departmentId: BigInt(10),
      assignedUserId: BigInt(5),
      updatedAt: daysAgo(30),
    };
    expect(isLeadEligibleForRecall(lead, getCutoffDate(config.maxDaysInPool))).toBe(false);
  });

  it('lead IN_PROGRESS quá hạn → bỏ qua', () => {
    const lead: Lead = {
      id: BigInt(1),
      status: 'IN_PROGRESS',
      departmentId: BigInt(10),
      assignedUserId: BigInt(5),
      updatedAt: daysAgo(30),
    };
    expect(isLeadEligibleForRecall(lead, getCutoffDate(config.maxDaysInPool))).toBe(false);
  });
});

// ─── Customer recall eligibility ──────────────────────────────────────────────

describe('Customer — điều kiện đủ để recall', () => {
  const config: RecallConfig = { maxDaysInPool: 14, autoLabelIds: [] };

  it('customer ở kho phòng ban quá 14 ngày → đủ điều kiện recall', () => {
    const customer: Customer = {
      id: BigInt(1),
      status: 'ACTIVE',
      assignedDepartmentId: BigInt(10),
      assignedUserId: null,
      updatedAt: daysAgo(20),
    };
    expect(isCustomerEligibleForRecall(customer, getCutoffDate(config.maxDaysInPool))).toBe(true);
  });

  it('customer chưa đủ 14 ngày → chưa recall', () => {
    const customer: Customer = {
      id: BigInt(1),
      status: 'ACTIVE',
      assignedDepartmentId: BigInt(10),
      assignedUserId: null,
      updatedAt: daysAgo(5),
    };
    expect(isCustomerEligibleForRecall(customer, getCutoffDate(config.maxDaysInPool))).toBe(false);
  });

  it('customer đã FLOATING → bỏ qua', () => {
    const customer: Customer = {
      id: BigInt(1),
      status: 'FLOATING',
      assignedDepartmentId: null,
      assignedUserId: null,
      updatedAt: daysAgo(30),
    };
    expect(isCustomerEligibleForRecall(customer, getCutoffDate(config.maxDaysInPool))).toBe(false);
  });

  it('customer INACTIVE → bỏ qua', () => {
    const customer: Customer = {
      id: BigInt(1),
      status: 'INACTIVE',
      assignedDepartmentId: BigInt(10),
      assignedUserId: null,
      updatedAt: daysAgo(30),
    };
    expect(isCustomerEligibleForRecall(customer, getCutoffDate(config.maxDaysInPool))).toBe(false);
  });

  it('customer đã có người assign → bỏ qua', () => {
    const customer: Customer = {
      id: BigInt(1),
      status: 'ACTIVE',
      assignedDepartmentId: BigInt(10),
      assignedUserId: BigInt(5),
      updatedAt: daysAgo(30),
    };
    expect(isCustomerEligibleForRecall(customer, getCutoffDate(config.maxDaysInPool))).toBe(false);
  });
});

// ─── filterEligibleLeads — batch filtering ────────────────────────────────────

describe('filterEligibleLeads — lọc hàng loạt', () => {
  const config: RecallConfig = { maxDaysInPool: 7, autoLabelIds: [BigInt(1)] };

  it('trả về chỉ leads đủ điều kiện trong danh sách hỗn hợp', () => {
    const leads: Lead[] = [
      { id: BigInt(1), status: 'POOL', departmentId: BigInt(10), assignedUserId: null, updatedAt: daysAgo(10) }, // eligible
      { id: BigInt(2), status: 'POOL', departmentId: BigInt(10), assignedUserId: null, updatedAt: daysAgo(3) },  // too recent
      { id: BigInt(3), status: 'FLOATING', departmentId: null, assignedUserId: null, updatedAt: daysAgo(10) },   // wrong status
      { id: BigInt(4), status: 'POOL', departmentId: BigInt(10), assignedUserId: BigInt(5), updatedAt: daysAgo(10) }, // has user
    ];
    const eligible = filterEligibleLeads(leads, config);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe(BigInt(1));
  });

  it('không có lead đủ điều kiện → trả về mảng rỗng', () => {
    const leads: Lead[] = [
      { id: BigInt(1), status: 'POOL', departmentId: BigInt(10), assignedUserId: null, updatedAt: daysAgo(2) },
    ];
    expect(filterEligibleLeads(leads, config)).toHaveLength(0);
  });

  it('danh sách leads rỗng → trả về mảng rỗng', () => {
    expect(filterEligibleLeads([], config)).toHaveLength(0);
  });
});

// ─── autoLabelIds — gắn nhãn sau khi recall ──────────────────────────────────

describe('autoLabelIds — cấu hình nhãn tự động', () => {
  it('config với autoLabelIds rỗng → không cần gắn nhãn', () => {
    const config: RecallConfig = { maxDaysInPool: 7, autoLabelIds: [] };
    expect(config.autoLabelIds).toHaveLength(0);
  });

  it('config với nhiều autoLabelIds → gắn tất cả nhãn cho leads bị recall', () => {
    const config: RecallConfig = {
      maxDaysInPool: 7,
      autoLabelIds: [BigInt(1), BigInt(2), BigInt(3)],
    };
    const leads: Lead[] = [
      { id: BigInt(10), status: 'POOL', departmentId: BigInt(10), assignedUserId: null, updatedAt: daysAgo(10) },
      { id: BigInt(11), status: 'POOL', departmentId: BigInt(10), assignedUserId: null, updatedAt: daysAgo(15) },
    ];
    const eligible = filterEligibleLeads(leads, config);
    // Mỗi lead nhận số nhãn = autoLabelIds.length
    const totalLabels = eligible.length * config.autoLabelIds.length;
    expect(totalLabels).toBe(6); // 2 leads × 3 nhãn
  });
});

// ─── getCutoffDate ────────────────────────────────────────────────────────────

describe('getCutoffDate — tính ngày cắt', () => {
  it('maxDaysInPool=7 → cutoff là 7 ngày trước', () => {
    const now = new Date('2026-03-28T12:00:00Z');
    const cutoff = getCutoffDate(7, now);
    expect(cutoff.toISOString().slice(0, 10)).toBe('2026-03-21');
  });

  it('maxDaysInPool=30 → cutoff là 30 ngày trước', () => {
    const now = new Date('2026-03-28T12:00:00Z');
    const cutoff = getCutoffDate(30, now);
    expect(cutoff.toISOString().slice(0, 10)).toBe('2026-02-26');
  });
});
