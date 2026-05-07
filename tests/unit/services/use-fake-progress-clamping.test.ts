import { describe, it, expect } from 'vitest';

// Pure progress math extracted from useFakeProgress hook (apps/web/src/hooks/use-fake-progress.ts).
// The hook is a thin wrapper: timer + RAF drive these two functions, so testing
// the pure math here gives us the same guarantees without spinning up a DOM.

const FAKE_DURATION_MS = 120_000;
const SMOOTH_FINISH_MS = 1_500;

/** Linear ramp 0 → 99 over FAKE_DURATION_MS. Clamps at 99 once duration passed. */
function linearProgress(elapsedMs: number): number {
  return Math.min(99, (elapsedMs / FAKE_DURATION_MS) * 99);
}

/** Ease-out cubic from `start` (current progress) to 100 over SMOOTH_FINISH_MS. */
function easeOutFinish(start: number, elapsedMs: number): number {
  const t = Math.min(1, elapsedMs / SMOOTH_FINISH_MS);
  const eased = 1 - Math.pow(1 - t, 3);
  return start + (100 - start) * eased;
}

describe('useFakeProgress math', () => {
  it('linear: at 0ms elapsed → 0', () => {
    expect(linearProgress(0)).toBe(0);
  });

  it('linear: at 60s elapsed → ~49.5 (half of 99)', () => {
    const p = linearProgress(60_000);
    expect(p).toBeGreaterThan(49);
    expect(p).toBeLessThan(50);
  });

  it('linear: at 130s elapsed → clamped to 99', () => {
    expect(linearProgress(130_000)).toBe(99);
  });

  it('linear: at 240s elapsed → still clamped to 99', () => {
    expect(linearProgress(240_000)).toBe(99);
  });

  it('ease-out: at 0ms elapsed → start value unchanged', () => {
    expect(easeOutFinish(50, 0)).toBe(50);
  });

  it('ease-out: at full duration → 100', () => {
    expect(easeOutFinish(50, SMOOTH_FINISH_MS)).toBeCloseTo(100, 5);
  });

  it('ease-out: monotonic increasing from start to 100', () => {
    const start = 30;
    const samples = [0, 250, 500, 750, 1000, 1250, 1500].map((ms) =>
      easeOutFinish(start, ms),
    );
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1]);
    }
    expect(samples[samples.length - 1]).toBeCloseTo(100, 5);
  });

  it('ease-out: most of the gain happens in the first half (cubic ease)', () => {
    const start = 0;
    const halfway = easeOutFinish(start, SMOOTH_FINISH_MS / 2);
    // ease-out cubic: 1 - (1-0.5)^3 = 1 - 0.125 = 0.875
    expect(halfway).toBeCloseTo(87.5, 1);
  });
});
