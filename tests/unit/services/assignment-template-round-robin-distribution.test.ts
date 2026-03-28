import { describe, it, expect } from 'vitest';

// Pure round-robin logic extracted từ AssignmentTemplatesService
// Kiểm tra phân phối leads cho danh sách users theo vòng lặp

type LeadStatus = 'POOL' | 'ASSIGNED' | 'IN_PROGRESS' | 'CONVERTED' | 'LOST' | 'FLOATING';

interface Lead {
  id: bigint;
  status: LeadStatus;
}

interface Member {
  userId: bigint;
}

interface AssignmentResult {
  leadId: bigint;
  userId: bigint;
}

/**
 * Phân phối leads theo round-robin.
 * Chỉ phân phối leads có status POOL hoặc FLOATING.
 */
function distributeRoundRobin(
  leads: Lead[],
  members: Member[],
): { assignments: AssignmentResult[]; skipped: number } {
  if (members.length === 0) return { assignments: [], skipped: leads.length };

  const eligible = leads.filter((l) => l.status === 'POOL' || l.status === 'FLOATING');
  const skipped = leads.length - eligible.length;

  const assignments: AssignmentResult[] = eligible.map((lead, i) => ({
    leadId: lead.id,
    userId: members[i % members.length].userId,
  }));

  return { assignments, skipped };
}

/** Đếm số leads mỗi user nhận được. */
function countByUser(assignments: AssignmentResult[]): Map<bigint, number> {
  const map = new Map<bigint, number>();
  for (const a of assignments) {
    map.set(a.userId, (map.get(a.userId) ?? 0) + 1);
  }
  return map;
}

// ─── Phân phối cơ bản ─────────────────────────────────────────────────────────

describe('Round-robin phân phối cơ bản', () => {
  const members: Member[] = [
    { userId: BigInt(1) },
    { userId: BigInt(2) },
    { userId: BigInt(3) },
  ];

  it('7 leads / 3 users → phân phối 3+2+2 (không đều nhau tối đa 1)', () => {
    const leads: Lead[] = Array.from({ length: 7 }, (_, i) => ({
      id: BigInt(i + 1),
      status: 'POOL' as LeadStatus,
    }));
    const { assignments } = distributeRoundRobin(leads, members);
    const counts = countByUser(assignments);

    const values = [...counts.values()];
    const max = Math.max(...values);
    const min = Math.min(...values);
    expect(max - min).toBeLessThanOrEqual(1);
    expect(assignments).toHaveLength(7);
  });

  it('7 leads / 3 users → tổng đúng 7 assignments', () => {
    const leads: Lead[] = Array.from({ length: 7 }, (_, i) => ({
      id: BigInt(i + 1),
      status: 'POOL' as LeadStatus,
    }));
    const { assignments } = distributeRoundRobin(leads, members);
    expect(assignments).toHaveLength(7);
  });

  it('10 leads / 2 users → 5+5 phân phối đều', () => {
    const twoMembers: Member[] = [{ userId: BigInt(1) }, { userId: BigInt(2) }];
    const leads: Lead[] = Array.from({ length: 10 }, (_, i) => ({
      id: BigInt(i + 1),
      status: 'POOL' as LeadStatus,
    }));
    const { assignments } = distributeRoundRobin(leads, twoMembers);
    const counts = countByUser(assignments);
    expect(counts.get(BigInt(1))).toBe(5);
    expect(counts.get(BigInt(2))).toBe(5);
  });

  it('1 lead / 3 users → chỉ user đầu tiên nhận 1 lead', () => {
    const leads: Lead[] = [{ id: BigInt(1), status: 'POOL' }];
    const { assignments } = distributeRoundRobin(leads, members);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].userId).toBe(BigInt(1));
  });

  it('thứ tự vòng lặp đúng: lead 1→user1, lead 2→user2, lead 3→user3, lead 4→user1', () => {
    const leads: Lead[] = Array.from({ length: 4 }, (_, i) => ({
      id: BigInt(i + 1),
      status: 'POOL' as LeadStatus,
    }));
    const { assignments } = distributeRoundRobin(leads, members);
    expect(assignments[0].userId).toBe(BigInt(1));
    expect(assignments[1].userId).toBe(BigInt(2));
    expect(assignments[2].userId).toBe(BigInt(3));
    expect(assignments[3].userId).toBe(BigInt(1)); // vòng lại
  });
});

// ─── 0 leads ─────────────────────────────────────────────────────────────────

describe('0 leads → không có assignment', () => {
  it('danh sách leads rỗng → assignments rỗng, skipped = 0', () => {
    const members: Member[] = [{ userId: BigInt(1) }, { userId: BigInt(2) }];
    const { assignments, skipped } = distributeRoundRobin([], members);
    expect(assignments).toHaveLength(0);
    expect(skipped).toBe(0);
  });
});

// ─── 0 members ────────────────────────────────────────────────────────────────

describe('0 members trong template → không assign được', () => {
  it('không có member → tất cả leads bị skip', () => {
    const leads: Lead[] = [
      { id: BigInt(1), status: 'POOL' },
      { id: BigInt(2), status: 'POOL' },
    ];
    const { assignments, skipped } = distributeRoundRobin(leads, []);
    expect(assignments).toHaveLength(0);
    expect(skipped).toBe(2);
  });
});

// ─── Chỉ phân phối POOL và FLOATING ──────────────────────────────────────────

describe('Bỏ qua leads không phải POOL hoặc FLOATING', () => {
  const members: Member[] = [{ userId: BigInt(1) }, { userId: BigInt(2) }];

  it('leads ASSIGNED bị skip', () => {
    const leads: Lead[] = [
      { id: BigInt(1), status: 'ASSIGNED' },
      { id: BigInt(2), status: 'POOL' },
    ];
    const { assignments, skipped } = distributeRoundRobin(leads, members);
    expect(assignments).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('leads IN_PROGRESS bị skip', () => {
    const leads: Lead[] = [
      { id: BigInt(1), status: 'IN_PROGRESS' },
      { id: BigInt(2), status: 'FLOATING' },
    ];
    const { assignments, skipped } = distributeRoundRobin(leads, members);
    expect(assignments).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('leads CONVERTED bị skip', () => {
    const leads: Lead[] = [{ id: BigInt(1), status: 'CONVERTED' }];
    const { assignments, skipped } = distributeRoundRobin(leads, members);
    expect(assignments).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('leads LOST bị skip', () => {
    const leads: Lead[] = [{ id: BigInt(1), status: 'LOST' }];
    const { assignments, skipped } = distributeRoundRobin(leads, members);
    expect(assignments).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('hỗn hợp POOL + FLOATING + ASSIGNED → chỉ POOL và FLOATING được assign', () => {
    const leads: Lead[] = [
      { id: BigInt(1), status: 'POOL' },
      { id: BigInt(2), status: 'ASSIGNED' },
      { id: BigInt(3), status: 'FLOATING' },
      { id: BigInt(4), status: 'IN_PROGRESS' },
    ];
    const { assignments, skipped } = distributeRoundRobin(leads, members);
    expect(assignments).toHaveLength(2);
    expect(skipped).toBe(2);
  });
});

// ─── Phân phối lớn ────────────────────────────────────────────────────────────

describe('Phân phối số lượng lớn', () => {
  it('100 leads / 7 users → phân phối gần đều (max - min <= 1)', () => {
    const members: Member[] = Array.from({ length: 7 }, (_, i) => ({
      userId: BigInt(i + 1),
    }));
    const leads: Lead[] = Array.from({ length: 100 }, (_, i) => ({
      id: BigInt(i + 1),
      status: 'POOL' as LeadStatus,
    }));
    const { assignments } = distributeRoundRobin(leads, members);
    const counts = countByUser(assignments);
    const values = [...counts.values()];
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1);
  });
});
