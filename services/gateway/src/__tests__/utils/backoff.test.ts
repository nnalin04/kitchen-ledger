import { describe, it, expect } from 'vitest';
import { computeBackoffMs } from '../../utils/backoff';

describe('computeBackoffMs', () => {
  it('attempt 0 returns 1000-1300ms range', () => {
    for (let i = 0; i < 20; i++) {
      const ms = computeBackoffMs(0);
      expect(ms).toBeGreaterThanOrEqual(1000);
      expect(ms).toBeLessThanOrEqual(1300);
    }
  });

  it('caps near 30000ms for large attempts', () => {
    const ms = computeBackoffMs(20);
    expect(ms).toBeGreaterThanOrEqual(30000);
    expect(ms).toBeLessThanOrEqual(39000); // 30% jitter on 30s
  });

  it('attempt 3 > attempt 0 on average', () => {
    const avg0 = Array.from({ length: 10 }, () => computeBackoffMs(0)).reduce((a, b) => a + b) / 10;
    const avg3 = Array.from({ length: 10 }, () => computeBackoffMs(3)).reduce((a, b) => a + b) / 10;
    expect(avg3).toBeGreaterThan(avg0);
  });
});
