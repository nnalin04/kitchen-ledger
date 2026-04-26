import { describe, it, expect } from 'vitest';
import { Colors, KPIBenchmarks } from '../constants/theme';

describe('theme constants', () => {
  it('Colors has all required keys', () => {
    expect(Colors.primary).toBeDefined();
    expect(Colors.danger).toBeDefined();
    expect(Colors.success).toBeDefined();
    expect(Colors.warning).toBeDefined();
    expect(Colors.offline).toBeDefined();
  });

  it('KPI benchmarks have green ranges', () => {
    expect(KPIBenchmarks.foodCostPct.green).toEqual([28, 35]);
    expect(KPIBenchmarks.laborCostPct.green).toEqual([25, 35]);
    expect(KPIBenchmarks.primeCostPct.green).toEqual([55, 65]);
    expect(KPIBenchmarks.netProfitPct.green).toEqual([3, 10]);
  });

  it('KPI benchmark green range is within yellow range', () => {
    for (const [key, val] of Object.entries(KPIBenchmarks)) {
      const { green, yellow } = val as { green: [number, number]; yellow: [number, number] };
      expect(green[0]).toBeGreaterThanOrEqual(yellow[0]);
      expect(green[1]).toBeLessThanOrEqual(yellow[1]);
    }
  });
});
