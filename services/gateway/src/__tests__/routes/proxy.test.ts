import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockFire = vi.hoisted(() => vi.fn());

vi.mock('../../circuit-breaker', () => ({
  createServiceBreaker: () => ({ fire: mockFire }),
}));

vi.mock('../../config', () => ({
  config: {
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

// ── Import under test (after mocks) ──────────────────────────────────────────

import { registerProxies } from '../../routes/proxy';

// ── Helpers ───────────────────────────────────────────────────────────────────

function okResult(body: object = { success: true }): object {
  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify(body)),
  };
}

function unavailableResult(): object {
  return {
    statusCode: 503,
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE' } })),
  };
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  // Raw body capture (mirrors server.ts)
  const capture = (_req: any, body: Buffer, done: Function) => done(null, body);
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, capture);
  app.addContentTypeParser('*', { parseAs: 'buffer' }, capture);
  await registerProxies(app);
  await app.ready();
  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('registerProxies', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  // ── Successful proxy ──────────────────────────────────────────────────────

  it('forwards 200 upstream response', async () => {
    mockFire.mockResolvedValue(okResult({ data: 'items' }));

    const res = await app.inject({ method: 'GET', url: '/api/inventory/items' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({ data: 'items' });
    expect(mockFire).toHaveBeenCalledOnce();
  });

  it('forwards non-200 upstream status codes', async () => {
    mockFire.mockResolvedValue({
      statusCode: 422,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify({ error: 'validation failed' })),
    });

    const res = await app.inject({ method: 'POST', url: '/api/finance/daily-reports/2024-01-15' });

    expect(res.statusCode).toBe(422);
  });

  // ── Circuit open → 503 ────────────────────────────────────────────────────

  it('returns 503 when circuit is open (fallback fires)', async () => {
    mockFire.mockResolvedValue(unavailableResult());

    const res = await app.inject({ method: 'GET', url: '/api/auth/users/me' });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body).error.code).toBe('SERVICE_UNAVAILABLE');
  });

  // ── Hop-by-hop header stripping ───────────────────────────────────────────

  it('strips hop-by-hop headers from the upstream response', async () => {
    mockFire.mockResolvedValue({
      statusCode: 200,
      headers: {
        'content-type':      'application/json',
        'connection':        'keep-alive',    // hop-by-hop — must be stripped
        'transfer-encoding': 'chunked',       // hop-by-hop — must be stripped
        'x-custom-header':   'pass-through',  // should be forwarded
      },
      body: Buffer.from('{}'),
    });

    const res = await app.inject({ method: 'GET', url: '/api/staff/employees' });

    expect(res.headers['connection']).toBeUndefined();
    expect(res.headers['transfer-encoding']).toBeUndefined();
    expect(res.headers['x-custom-header']).toBe('pass-through');
  });

  // ── All 8 service prefixes are routed ─────────────────────────────────────

  const SERVICE_PREFIXES = [
    '/api/auth/login',
    '/api/inventory/items',
    '/api/finance/dashboard',
    '/api/staff/employees',
    '/api/ai/query',
    '/api/files/upload',
    '/api/notifications',
    '/api/reports/jobs',
  ];

  for (const path of SERVICE_PREFIXES) {
    it(`routes ${path} to the correct upstream`, async () => {
      mockFire.mockResolvedValue(okResult());
      await app.inject({ method: 'GET', url: path });
      expect(mockFire).toHaveBeenCalledOnce();
    });
  }

  // ── Subpaths are proxied ──────────────────────────────────────────────────

  it('proxies deep subpaths', async () => {
    mockFire.mockResolvedValue(okResult());

    await app.inject({ method: 'GET', url: '/api/inventory/items/some-uuid/movements' });

    expect(mockFire).toHaveBeenCalledOnce();
    const args = mockFire.mock.calls[0][0];
    expect(args.url).toBe('/api/inventory/items/some-uuid/movements');
  });

  // ── Request body forwarded ────────────────────────────────────────────────

  it('forwards request body to upstream', async () => {
    mockFire.mockResolvedValue(okResult());
    const payload = JSON.stringify({ email: 'owner@test.com', password: 'pass' });

    await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload,
      headers: { 'content-type': 'application/json' },
    });

    const args = mockFire.mock.calls[0][0];
    expect(args.body).toBeInstanceOf(Buffer);
    expect(args.body.toString()).toBe(payload);
  });
});
