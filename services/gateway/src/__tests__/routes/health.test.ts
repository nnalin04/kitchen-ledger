import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

// ── Mocks (hoisted so vi.mock factories can reference them) ───────────────────

const mockPing = vi.hoisted(() => vi.fn());

vi.mock('../../redis', () => ({
  redisClient: { ping: mockPing },
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

import { registerHealthRoutes } from '../../routes/health';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a fresh Fastify instance with health routes registered.
 * We call this inside each test so mocked `fetch`/redis state is isolated.
 */
async function buildApp() {
  const app = Fastify({ logger: false });
  await registerHealthRoutes(app);
  await app.ready();
  return app;
}

/** Make global.fetch return ok:true for every URL. */
function mockFetchAllOk() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true })
  );
}

/** Make global.fetch return ok:true for all URLs except the specified host. */
function mockFetchOneDown(failHost: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (url.startsWith(failHost)) {
        return Promise.reject(new Error('ECONNREFUSED'));
      }
      return Promise.resolve({ ok: true });
    })
  );
}

/** Make global.fetch fail for multiple hosts. */
function mockFetchMultipleDown(failHosts: string[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (failHosts.some(h => url.startsWith(h))) {
        return Promise.reject(new Error('ECONNREFUSED'));
      }
      return Promise.resolve({ ok: true });
    })
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /health
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status ok when all services and Redis are healthy', async () => {
    mockFetchAllOk();
    mockPing.mockResolvedValue('PONG');

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');
    expect(body.services.auth.status).toBe('ok');
    expect(body.services.inventory.status).toBe('ok');
    expect(body.services.finance.status).toBe('ok');
    expect(body.services.staff.status).toBe('ok');
    expect(body.services.ai.status).toBe('ok');
    expect(body.services.file.status).toBe('ok');
    expect(body.services.notification.status).toBe('ok');
    expect(body.services.report.status).toBe('ok');
    expect(body.infrastructure.redis.status).toBe('ok');
  });

  it('includes a valid ISO-8601 timestamp', async () => {
    mockFetchAllOk();
    mockPing.mockResolvedValue('PONG');

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    const body = JSON.parse(res.payload);
    expect(body.timestamp).toBeDefined();
    expect(() => new Date(body.timestamp).toISOString()).not.toThrow();
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it('returns 503 with status degraded when one service is down', async () => {
    mockFetchOneDown('http://inv:8082');
    mockPing.mockResolvedValue('PONG');

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(503);

    const body = JSON.parse(res.payload);
    expect(body.status).toBe('degraded');
    expect(body.services.inventory.status).toBe('error');
    // Other services must still be ok
    expect(body.services.auth.status).toBe('ok');
  });

  it('returns 503 with redis error when Redis ping rejects', async () => {
    mockFetchAllOk();
    mockPing.mockRejectedValue(new Error('Redis connection refused'));

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(503);

    const body = JSON.parse(res.payload);
    expect(body.status).toBe('degraded');
    expect(body.infrastructure.redis.status).toBe('error');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /health/services
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /health/services', () => {
  it('returns 200 with all 8 service entries when everything is healthy', async () => {
    mockFetchAllOk();
    mockPing.mockResolvedValue('PONG');

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health/services' });

    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.payload);
    expect(body.status).toBe('ok');

    const serviceKeys = Object.keys(body.services);
    expect(serviceKeys).toHaveLength(8);
    expect(serviceKeys).toEqual(
      expect.arrayContaining([
        'auth', 'inventory', 'finance', 'staff', 'ai', 'file', 'notification', 'report',
      ])
    );
  });

  it('does NOT include an infrastructure key (services-only endpoint)', async () => {
    mockFetchAllOk();
    mockPing.mockResolvedValue('PONG');

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health/services' });

    const body = JSON.parse(res.payload);
    expect(body).not.toHaveProperty('infrastructure');
  });

  it('returns 503 and marks exactly the two failed services as error', async () => {
    mockFetchMultipleDown(['http://fin:8083', 'http://ai:8084']);
    mockPing.mockResolvedValue('PONG');

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/health/services' });

    expect(res.statusCode).toBe(503);

    const body = JSON.parse(res.payload);
    expect(body.status).toBe('degraded');
    expect(body.services.finance.status).toBe('error');
    expect(body.services.ai.status).toBe('error');

    // All other services must still be ok
    for (const name of ['auth', 'inventory', 'staff', 'file', 'notification', 'report']) {
      expect(body.services[name].status).toBe('ok');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ready
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /ready', () => {
  it('returns 200 with ready:true when Redis and auth are healthy', async () => {
    mockPing.mockResolvedValue('PONG');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ready' });

    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.payload);
    expect(body.ready).toBe(true);
    expect(body.checks.redis).toBe('ok');
    expect(body.checks.auth).toBe('ok');
  });

  it('returns 503 with ready:false and checks.redis=error when Redis ping rejects', async () => {
    mockPing.mockRejectedValue(new Error('Connection refused'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ready' });

    expect(res.statusCode).toBe(503);

    const body = JSON.parse(res.payload);
    expect(body.ready).toBe(false);
    expect(body.checks.redis).toBe('error');
  });

  it('returns 503 with ready:false and checks.auth=error when auth service is down', async () => {
    mockPing.mockResolvedValue('PONG');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    );

    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: '/ready' });

    expect(res.statusCode).toBe(503);

    const body = JSON.parse(res.payload);
    expect(body.ready).toBe(false);
    expect(body.checks.redis).toBe('ok');
    expect(body.checks.auth).toBe('error');
  });
});
