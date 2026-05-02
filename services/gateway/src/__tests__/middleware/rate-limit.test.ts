import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockIncr   = vi.hoisted(() => vi.fn());
const mockExpire = vi.hoisted(() => vi.fn());

vi.mock('../../redis', () => ({
  redisClient: {
    incr:    mockIncr,
    expire:  mockExpire,
    connect: vi.fn(),
    ping:    vi.fn(),
  },
}));

vi.mock('../../config', () => ({
  config: {
    PORT:                     8080,
    NODE_ENV:                 'test',
    JWT_PUBLIC_KEY:           '',
    INTERNAL_SERVICE_SECRET:  'test-secret',
    ALLOWED_ORIGINS:          'http://localhost:3000',
    REDIS_URL:                'redis://localhost:6379',
    AUTH_SERVICE_URL:         'http://auth:8081',
    INVENTORY_SERVICE_URL:    'http://inv:8082',
    FINANCE_SERVICE_URL:      'http://fin:8083',
    STAFF_SERVICE_URL:        'http://staff:8088',
    AI_SERVICE_URL:           'http://ai:8084',
    FILE_SERVICE_URL:         'http://file:8085',
    NOTIFICATION_SERVICE_URL: 'http://notif:8086',
    REPORT_SERVICE_URL:       'http://report:8087',
  },
}));

// ── The rate-limit hook extracted for direct unit testing ─────────────────────
// Rather than booting the full server, we replicate the hook logic to test it
// in isolation. This matches how auth.middleware.test.ts tests its middleware.

import { redisClient } from '../../redis';

// Route limits table — mirrors server.ts exactly
const ROUTE_LIMITS: Array<{ path: string; max: number; windowSecs: number; methods?: string[] }> = [
  { path: '/api/auth/login',           max: 10,  windowSecs: 15 * 60, methods: ['POST'] },
  { path: '/api/auth/register',        max: 5,   windowSecs: 60 * 60, methods: ['POST'] },
  { path: '/api/auth/refresh',         max: 30,  windowSecs: 15 * 60, methods: ['POST'] },
  { path: '/api/auth/forgot-password', max: 3,   windowSecs: 15 * 60, methods: ['POST'] },
  { path: '/api/ai/ocr',               max: 20,  windowSecs: 60 * 60 },
  { path: '/api/ai/voice',             max: 60,  windowSecs: 60 * 60 },
  { path: '/api/ai/query',             max: 100, windowSecs: 60 * 60 },
];

// Simulates the per-route rate limit hook from server.ts
async function applyRateLimit(
  path: string,
  method: string,
  ip = '1.2.3.4'
): Promise<{ limited: boolean; windowSecs?: number }> {
  for (const rule of ROUTE_LIMITS) {
    if (!path.startsWith(rule.path)) continue;
    if (rule.methods && !rule.methods.includes(method.toUpperCase())) continue;

    const key = `rl:${rule.path.replaceAll('/', ':')}:${ip}`;
    const count = await (redisClient as any).incr(key);
    if (count === 1) await (redisClient as any).expire(key, rule.windowSecs);

    if (count > rule.max) return { limited: true, windowSecs: rule.windowSecs };
    return { limited: false };
  }
  return { limited: false }; // no rule matched
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('per-route rate limit hook', () => {

  beforeEach(() => { vi.clearAllMocks(); });

  // ── Login (10 / 15 min) ───────────────────────────────────────────────────

  it('allows login when under limit (count=1)', async () => {
    mockIncr.mockResolvedValue(1);
    const result = await applyRateLimit('/api/auth/login', 'POST');
    expect(result.limited).toBe(false);
  });

  it('allows login at the limit (count=10)', async () => {
    mockIncr.mockResolvedValue(10);
    const result = await applyRateLimit('/api/auth/login', 'POST');
    expect(result.limited).toBe(false);
  });

  it('blocks login over the limit (count=11)', async () => {
    mockIncr.mockResolvedValue(11);
    const result = await applyRateLimit('/api/auth/login', 'POST');
    expect(result.limited).toBe(true);
  });

  it('sets 15-minute window for login', async () => {
    mockIncr.mockResolvedValue(1);
    await applyRateLimit('/api/auth/login', 'POST');
    expect(mockExpire).toHaveBeenCalledWith(expect.any(String), 15 * 60);
  });

  it('does not rate-limit GET to /api/auth/login (no method match)', async () => {
    const result = await applyRateLimit('/api/auth/login', 'GET');
    expect(result.limited).toBe(false);
    expect(mockIncr).not.toHaveBeenCalled();
  });

  // ── Register (5 / 1 hour) ─────────────────────────────────────────────────

  it('blocks register over the limit (count=6)', async () => {
    mockIncr.mockResolvedValue(6);
    const result = await applyRateLimit('/api/auth/register', 'POST');
    expect(result.limited).toBe(true);
  });

  it('sets 1-hour window for register', async () => {
    mockIncr.mockResolvedValue(1);
    await applyRateLimit('/api/auth/register', 'POST');
    expect(mockExpire).toHaveBeenCalledWith(expect.any(String), 60 * 60);
  });

  // ── Refresh (30 / 15 min) ─────────────────────────────────────────────────

  it('blocks refresh over the limit (count=31)', async () => {
    mockIncr.mockResolvedValue(31);
    const result = await applyRateLimit('/api/auth/refresh', 'POST');
    expect(result.limited).toBe(true);
  });

  it('sets 15-minute window for refresh', async () => {
    mockIncr.mockResolvedValue(1);
    await applyRateLimit('/api/auth/refresh', 'POST');
    expect(mockExpire).toHaveBeenCalledWith(expect.any(String), 15 * 60);
  });

  // ── AI endpoints (per-hour limits) ───────────────────────────────────────

  it('blocks AI OCR over the limit (count=21)', async () => {
    mockIncr.mockResolvedValue(21);
    const result = await applyRateLimit('/api/ai/ocr/receipt', 'POST');
    expect(result.limited).toBe(true);
  });

  it('sets 1-hour window for AI OCR', async () => {
    mockIncr.mockResolvedValue(1);
    await applyRateLimit('/api/ai/ocr/receipt', 'POST');
    expect(mockExpire).toHaveBeenCalledWith(expect.any(String), 60 * 60);
  });

  it('blocks AI voice over the limit (count=61)', async () => {
    mockIncr.mockResolvedValue(61);
    const result = await applyRateLimit('/api/ai/voice/transcribe', 'POST');
    expect(result.limited).toBe(true);
  });

  it('blocks AI query over the limit (count=101)', async () => {
    mockIncr.mockResolvedValue(101);
    const result = await applyRateLimit('/api/ai/query', 'POST');
    expect(result.limited).toBe(true);
  });

  // ── Non-rate-limited route → no Redis calls ───────────────────────────────

  it('does not touch Redis for routes not in ROUTE_LIMITS', async () => {
    await applyRateLimit('/api/finance/dashboard', 'GET');
    await applyRateLimit('/api/inventory/items', 'GET');
    await applyRateLimit('/api/staff/employees', 'GET');

    expect(mockIncr).not.toHaveBeenCalled();
    expect(mockExpire).not.toHaveBeenCalled();
  });

  // ── Key scoped to IP (different IPs don't share limit) ───────────────────

  it('uses different Redis keys for different IPs', async () => {
    mockIncr.mockResolvedValue(1);

    await applyRateLimit('/api/auth/login', 'POST', '10.0.0.1');
    await applyRateLimit('/api/auth/login', 'POST', '10.0.0.2');

    const keys = mockIncr.mock.calls.map(c => c[0] as string);
    expect(keys[0]).not.toBe(keys[1]);
    expect(keys[0]).toContain('10.0.0.1');
    expect(keys[1]).toContain('10.0.0.2');
  });

  // ── Window only set on first request (count=1) ────────────────────────────

  it('only calls expire on the first request (count=1)', async () => {
    mockIncr.mockResolvedValue(5); // not the first request
    await applyRateLimit('/api/auth/login', 'POST');
    expect(mockExpire).not.toHaveBeenCalled();
  });
});
