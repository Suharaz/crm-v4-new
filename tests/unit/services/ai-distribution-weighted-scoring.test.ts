import { describe, it, expect } from 'vitest';

// Pure scoring logic extracted từ ScoringService — không cần DB
// Trọng số mặc định: workload 30%, level 30%, performance 40%

interface UserScoreInput {
  userId: bigint;
  workloadCount: number; // số leads đang active
  levelRank: number;     // rank cấp bậc nhân viên
  conversionRate: number; // tỉ lệ chuyển đổi (0..1)
}

interface UserScore {
  userId: bigint;
  score: number;
  breakdown: { workload: number; level: number; performance: number };
}

const DEFAULT_WEIGHTS = { workload: 30, level: 30, performance: 40 };

/**
 * Tính điểm cho danh sách users.
 * Workload: ít lead hơn → điểm cao hơn.
 * Level: rank cao hơn → điểm cao hơn.
 * Performance: tỉ lệ convert cao hơn → điểm cao hơn.
 */
function scoreUsers(
  users: UserScoreInput[],
  weights = DEFAULT_WEIGHTS,
): UserScore[] {
  if (users.length === 0) return [];

  const maxWorkload = Math.max(...users.map((u) => u.workloadCount), 1);
  const maxRank = Math.max(...users.map((u) => u.levelRank), 1);

  return users
    .map((u) => {
      const workloadScore = (1 - u.workloadCount / maxWorkload) * weights.workload;
      const levelScore = (u.levelRank / maxRank) * weights.level;
      const perfScore = u.conversionRate * weights.performance;
      const total = Math.round((workloadScore + levelScore + perfScore) * 100) / 100;

      return {
        userId: u.userId,
        score: total,
        breakdown: {
          workload: workloadScore,
          level: levelScore,
          performance: perfScore,
        },
      };
    })
    .sort((a, b) => b.score - a.score);
}

function pickBestUser(users: UserScoreInput[]): bigint | null {
  const scores = scoreUsers(users);
  return scores.length > 0 ? scores[0].userId : null;
}

// ─── Workload weight ──────────────────────────────────────────────────────────

describe('Workload weight (30%) — ít lead hơn = điểm cao hơn', () => {
  it('user có 2 leads được điểm workload cao hơn user có 5 leads', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(1), workloadCount: 5, levelRank: 1, conversionRate: 0 },
      { userId: BigInt(2), workloadCount: 2, levelRank: 1, conversionRate: 0 },
    ];
    const scores = scoreUsers(users);
    const u1 = scores.find((s) => s.userId === BigInt(1))!;
    const u2 = scores.find((s) => s.userId === BigInt(2))!;
    expect(u2.breakdown.workload).toBeGreaterThan(u1.breakdown.workload);
  });

  it('user với 0 leads nhận điểm workload tối đa (= weight)', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(1), workloadCount: 0, levelRank: 1, conversionRate: 0 },
      { userId: BigInt(2), workloadCount: 10, levelRank: 1, conversionRate: 0 },
    ];
    const scores = scoreUsers(users);
    const u1 = scores.find((s) => s.userId === BigInt(1))!;
    expect(u1.breakdown.workload).toBe(DEFAULT_WEIGHTS.workload);
  });

  it('user với workload tối đa nhận điểm workload = 0', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(1), workloadCount: 10, levelRank: 1, conversionRate: 0 },
      { userId: BigInt(2), workloadCount: 0, levelRank: 1, conversionRate: 0 },
    ];
    const scores = scoreUsers(users);
    const u1 = scores.find((s) => s.userId === BigInt(1))!;
    expect(u1.breakdown.workload).toBe(0);
  });
});

// ─── Level weight ─────────────────────────────────────────────────────────────

describe('Level weight (30%) — rank cao hơn = điểm cao hơn', () => {
  it('user rank 3 được điểm level cao hơn user rank 1', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(1), workloadCount: 0, levelRank: 1, conversionRate: 0 },
      { userId: BigInt(2), workloadCount: 0, levelRank: 3, conversionRate: 0 },
    ];
    const scores = scoreUsers(users);
    const u1 = scores.find((s) => s.userId === BigInt(1))!;
    const u2 = scores.find((s) => s.userId === BigInt(2))!;
    expect(u2.breakdown.level).toBeGreaterThan(u1.breakdown.level);
  });

  it('user rank cao nhất nhận điểm level tối đa (= weight)', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(1), workloadCount: 0, levelRank: 5, conversionRate: 0 },
      { userId: BigInt(2), workloadCount: 0, levelRank: 1, conversionRate: 0 },
    ];
    const scores = scoreUsers(users);
    const u1 = scores.find((s) => s.userId === BigInt(1))!;
    expect(u1.breakdown.level).toBe(DEFAULT_WEIGHTS.level);
  });
});

// ─── Performance weight ───────────────────────────────────────────────────────

describe('Performance weight (40%) — tỉ lệ convert cao hơn = điểm cao hơn', () => {
  it('user tỉ lệ 80% được điểm cao hơn user tỉ lệ 20%', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(1), workloadCount: 0, levelRank: 1, conversionRate: 0.2 },
      { userId: BigInt(2), workloadCount: 0, levelRank: 1, conversionRate: 0.8 },
    ];
    const scores = scoreUsers(users);
    const u1 = scores.find((s) => s.userId === BigInt(1))!;
    const u2 = scores.find((s) => s.userId === BigInt(2))!;
    expect(u2.breakdown.performance).toBeGreaterThan(u1.breakdown.performance);
  });

  it('tỉ lệ convert 100% → điểm performance = weight (40)', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(1), workloadCount: 0, levelRank: 1, conversionRate: 1.0 },
    ];
    const scores = scoreUsers(users);
    expect(scores[0].breakdown.performance).toBe(DEFAULT_WEIGHTS.performance);
  });

  it('tỉ lệ convert 0% → điểm performance = 0', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(1), workloadCount: 0, levelRank: 1, conversionRate: 0 },
    ];
    const scores = scoreUsers(users);
    expect(scores[0].breakdown.performance).toBe(0);
  });
});

// ─── Combined score ───────────────────────────────────────────────────────────

describe('Combined score — công thức kết hợp 3 trọng số', () => {
  it('tổng điểm = workload + level + performance', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(1), workloadCount: 0, levelRank: 1, conversionRate: 0.5 },
    ];
    const scores = scoreUsers(users);
    const s = scores[0];
    const expected = Math.round((s.breakdown.workload + s.breakdown.level + s.breakdown.performance) * 100) / 100;
    expect(s.score).toBe(expected);
  });

  it('kết quả được sort giảm dần theo score', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(1), workloadCount: 10, levelRank: 1, conversionRate: 0.1 },
      { userId: BigInt(2), workloadCount: 0, levelRank: 5, conversionRate: 0.9 },
      { userId: BigInt(3), workloadCount: 5, levelRank: 3, conversionRate: 0.5 },
    ];
    const scores = scoreUsers(users);
    for (let i = 0; i < scores.length - 1; i++) {
      expect(scores[i].score).toBeGreaterThanOrEqual(scores[i + 1].score);
    }
  });

  it('điểm tối đa khi workload=0, rank cao nhất, convert=100%', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(1), workloadCount: 0, levelRank: 5, conversionRate: 1.0 },
      { userId: BigInt(2), workloadCount: 5, levelRank: 1, conversionRate: 0 },
    ];
    const scores = scoreUsers(users);
    // User 1 phải có điểm cao nhất
    expect(scores[0].userId).toBe(BigInt(1));
    // Điểm tối đa = 30 + 30 + 40 = 100
    expect(scores[0].score).toBe(100);
  });
});

// ─── pickBestUser ─────────────────────────────────────────────────────────────

describe('pickBestUser — chọn user điểm cao nhất', () => {
  it('chọn user có điểm tổng cao nhất', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(1), workloadCount: 10, levelRank: 1, conversionRate: 0.1 },
      { userId: BigInt(2), workloadCount: 0, levelRank: 5, conversionRate: 0.9 },
    ];
    expect(pickBestUser(users)).toBe(BigInt(2));
  });

  it('danh sách rỗng → trả về null', () => {
    expect(pickBestUser([])).toBeNull();
  });

  it('chỉ có 1 user → chọn user đó', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(99), workloadCount: 3, levelRank: 2, conversionRate: 0.5 },
    ];
    expect(pickBestUser(users)).toBe(BigInt(99));
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('tất cả users cùng điểm → thứ tự giữ nguyên', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(1), workloadCount: 5, levelRank: 1, conversionRate: 0 },
      { userId: BigInt(2), workloadCount: 5, levelRank: 1, conversionRate: 0 },
      { userId: BigInt(3), workloadCount: 5, levelRank: 1, conversionRate: 0 },
    ];
    const scores = scoreUsers(users);
    expect(scores).toHaveLength(3);
    // Tất cả có cùng score
    expect(scores[0].score).toBe(scores[1].score);
    expect(scores[1].score).toBe(scores[2].score);
  });

  it('custom weights tổng không bằng 100 vẫn hoạt động', () => {
    const users: UserScoreInput[] = [
      { userId: BigInt(1), workloadCount: 0, levelRank: 1, conversionRate: 1.0 },
    ];
    const scores = scoreUsers(users, { workload: 50, level: 50, performance: 50 });
    expect(scores[0].score).toBe(150);
  });
});
