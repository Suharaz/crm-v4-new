import { describe, it, expect } from 'vitest';

// Logic chuyển trạng thái lead — pure, không cần DB
// Dựa theo CLAUDE.md: Lead Status Flow

type LeadStatus = 'POOL' | 'ASSIGNED' | 'IN_PROGRESS' | 'CONVERTED' | 'LOST' | 'FLOATING';

const ALLOWED_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  POOL: ['ASSIGNED', 'FLOATING'],
  ASSIGNED: ['IN_PROGRESS', 'POOL', 'FLOATING'],
  IN_PROGRESS: ['CONVERTED', 'LOST', 'POOL', 'FLOATING'],
  CONVERTED: [], // terminal — không thể chuyển ra
  LOST: ['FLOATING'],
  FLOATING: ['ASSIGNED'],
};

function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

function assertTransition(from: LeadStatus, to: LeadStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Không thể chuyển từ ${from} sang ${to}`);
  }
}

// ─── Các chuyển trạng thái hợp lệ ────────────────────────────────────────────

describe('Chuyển trạng thái hợp lệ', () => {
  it('POOL → ASSIGNED', () => {
    expect(canTransition('POOL', 'ASSIGNED')).toBe(true);
  });

  it('POOL → FLOATING', () => {
    expect(canTransition('POOL', 'FLOATING')).toBe(true);
  });

  it('ASSIGNED → IN_PROGRESS', () => {
    expect(canTransition('ASSIGNED', 'IN_PROGRESS')).toBe(true);
  });

  it('ASSIGNED → POOL (trả về kho)', () => {
    expect(canTransition('ASSIGNED', 'POOL')).toBe(true);
  });

  it('ASSIGNED → FLOATING (thả nổi)', () => {
    expect(canTransition('ASSIGNED', 'FLOATING')).toBe(true);
  });

  it('IN_PROGRESS → CONVERTED', () => {
    expect(canTransition('IN_PROGRESS', 'CONVERTED')).toBe(true);
  });

  it('IN_PROGRESS → LOST', () => {
    expect(canTransition('IN_PROGRESS', 'LOST')).toBe(true);
  });

  it('IN_PROGRESS → POOL', () => {
    expect(canTransition('IN_PROGRESS', 'POOL')).toBe(true);
  });

  it('IN_PROGRESS → FLOATING', () => {
    expect(canTransition('IN_PROGRESS', 'FLOATING')).toBe(true);
  });

  it('LOST → FLOATING (kho thả nổi sau khi thua)', () => {
    expect(canTransition('LOST', 'FLOATING')).toBe(true);
  });

  it('FLOATING → ASSIGNED (claim về cá nhân)', () => {
    expect(canTransition('FLOATING', 'ASSIGNED')).toBe(true);
  });
});

// ─── Các chuyển trạng thái không hợp lệ ──────────────────────────────────────

describe('Chuyển trạng thái không hợp lệ', () => {
  it('POOL → IN_PROGRESS (bỏ qua ASSIGNED)', () => {
    expect(canTransition('POOL', 'IN_PROGRESS')).toBe(false);
  });

  it('POOL → CONVERTED (không thể bỏ qua các bước)', () => {
    expect(canTransition('POOL', 'CONVERTED')).toBe(false);
  });

  it('POOL → LOST', () => {
    expect(canTransition('POOL', 'LOST')).toBe(false);
  });

  it('ASSIGNED → CONVERTED (bỏ qua IN_PROGRESS)', () => {
    expect(canTransition('ASSIGNED', 'CONVERTED')).toBe(false);
  });

  it('ASSIGNED → LOST', () => {
    expect(canTransition('ASSIGNED', 'LOST')).toBe(false);
  });

  it('FLOATING → IN_PROGRESS (bỏ qua ASSIGNED)', () => {
    expect(canTransition('FLOATING', 'IN_PROGRESS')).toBe(false);
  });

  it('FLOATING → POOL', () => {
    expect(canTransition('FLOATING', 'POOL')).toBe(false);
  });

  it('LOST → ASSIGNED (phải qua FLOATING trước)', () => {
    expect(canTransition('LOST', 'ASSIGNED')).toBe(false);
  });

  it('LOST → POOL', () => {
    expect(canTransition('LOST', 'POOL')).toBe(false);
  });
});

// ─── CONVERTED là trạng thái terminal ────────────────────────────────────────

describe('CONVERTED — trạng thái terminal (không thể chuyển ra)', () => {
  const allStatuses: LeadStatus[] = ['POOL', 'ASSIGNED', 'IN_PROGRESS', 'CONVERTED', 'LOST', 'FLOATING'];

  allStatuses.forEach((target) => {
    it(`CONVERTED → ${target} bị chặn`, () => {
      expect(canTransition('CONVERTED', target)).toBe(false);
    });
  });

  it('assertTransition từ CONVERTED ném lỗi', () => {
    expect(() => assertTransition('CONVERTED', 'POOL')).toThrow();
  });
});

// ─── assertTransition ────────────────────────────────────────────────────────

describe('assertTransition', () => {
  it('không ném lỗi khi chuyển hợp lệ', () => {
    expect(() => assertTransition('POOL', 'ASSIGNED')).not.toThrow();
  });

  it('ném lỗi khi chuyển không hợp lệ', () => {
    expect(() => assertTransition('POOL', 'CONVERTED')).toThrow(/CONVERTED/);
  });

  it('thông báo lỗi chứa tên trạng thái nguồn và đích', () => {
    expect(() => assertTransition('LOST', 'POOL')).toThrow(/LOST/);
  });
});
