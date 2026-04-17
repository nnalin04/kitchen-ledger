import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// ── Mock the DB pool before importing routes ──────────────────────────────────

const mockQuery = vi.fn();

vi.mock('../../db', () => ({
  pool: { query: mockQuery },
}));

import { registerNotificationRoutes } from '../../routes/notifications';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const TENANT_ID = '550e8400-e29b-41d4-a716-446655440001';
const USER_ID   = '550e8400-e29b-41d4-a716-446655440002';
const NOTIF_ID  = '550e8400-e29b-41d4-a716-446655440003';

const sampleNotification = {
  id:         NOTIF_ID,
  type:       'inventory.stock.low',
  priority:   'important',
  title:      'Low Stock',
  body:       'Onions running low',
  data:       { item_name: 'Onions' },
  channels:   ['push'],
  read_at:    null,
  created_at: new Date().toISOString(),
};

// ── Build a test Fastify app ──────────────────────────────────────────────────

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify({ logger: false });
  await registerNotificationRoutes(app);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Authenticated request helper ──────────────────────────────────────────────

function withAuth(headers?: Record<string, string>) {
  return {
    'x-user-id':   USER_ID,
    'x-tenant-id': TENANT_ID,
    ...headers,
  };
}

// ── GET /api/notifications ────────────────────────────────────────────────────

describe('GET /api/notifications', () => {
  it('returns paginated notifications for the authenticated user', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [sampleNotification] })    // notifications
      .mockResolvedValueOnce({ rows: [{ total: '1' }] });        // count

    const res = await app.inject({
      method:  'GET',
      url:     '/api/notifications',
      headers: withAuth(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0].id).toBe(NOTIF_ID);
    expect(body.meta.total).toBe(1);
  });

  it('returns 401 when x-user-id header is missing', async () => {
    const res = await app.inject({
      method:  'GET',
      url:     '/api/notifications',
      headers: { 'x-tenant-id': TENANT_ID }, // missing x-user-id
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe('UNAUTHORIZED');
  });

  it('applies pagination parameters', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: '50' }] });

    const res = await app.inject({
      method:  'GET',
      url:     '/api/notifications?page=2&limit=10',
      headers: withAuth(),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta.page).toBe(2);
    expect(body.meta.limit).toBe(10);

    // Verify OFFSET was passed (page=2 limit=10 → offset=10)
    const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(params[2]).toBe(10);  // LIMIT
    expect(params[3]).toBe(10);  // OFFSET
  });
});

// ── GET /api/notifications/unread-count ──────────────────────────────────────

describe('GET /api/notifications/unread-count', () => {
  it('returns the unread count for the user', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: '7' }] });

    const res = await app.inject({
      method:  'GET',
      url:     '/api/notifications/unread-count',
      headers: withAuth(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.count).toBe(7);
  });

  it('returns 401 without auth headers', async () => {
    const res = await app.inject({
      method: 'GET',
      url:    '/api/notifications/unread-count',
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────

describe('PATCH /api/notifications/:id/read', () => {
  it('marks a notification as read and returns 200', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const res = await app.inject({
      method:  'PATCH',
      url:     `/api/notifications/${NOTIF_ID}/read`,
      headers: withAuth(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE notifications');
    expect(sql).toContain('read_at = NOW()');
    expect(params[0]).toBe(NOTIF_ID);
    expect(params[1]).toBe(TENANT_ID);
  });

  it('returns 404 when notification is not found or already read', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });

    const res = await app.inject({
      method:  'PATCH',
      url:     `/api/notifications/${NOTIF_ID}/read`,
      headers: withAuth(),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });

  it('returns 401 without auth headers', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url:    `/api/notifications/${NOTIF_ID}/read`,
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── PATCH /api/notifications/read-all ────────────────────────────────────────

describe('PATCH /api/notifications/read-all', () => {
  it('marks all unread notifications as read', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 5 });

    const res = await app.inject({
      method:  'PATCH',
      url:     '/api/notifications/read-all',
      headers: withAuth(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE notifications');
    expect(params[0]).toBe(TENANT_ID);
    expect(params[1]).toBe(USER_ID);
  });

  it('returns 401 without auth headers', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url:    '/api/notifications/read-all',
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── POST /api/notifications/devices ──────────────────────────────────────────

describe('POST /api/notifications/devices', () => {
  it('registers a push token and returns 201', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const res = await app.inject({
      method:  'POST',
      url:     '/api/notifications/devices',
      headers: { ...withAuth(), 'content-type': 'application/json' },
      payload: JSON.stringify({ token: 'ExponentPushToken[abc123]', platform: 'ios' }),
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO device_tokens');
    expect(sql).toContain('ON CONFLICT (token)');
    expect(params[0]).toBe(USER_ID);
    expect(params[1]).toBe(TENANT_ID);
    expect(params[2]).toBe('ExponentPushToken[abc123]');
    expect(params[3]).toBe('ios');
  });

  it('returns 400 for invalid platform', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/notifications/devices',
      headers: { ...withAuth(), 'content-type': 'application/json' },
      payload: JSON.stringify({ token: 'ExponentPushToken[abc]', platform: 'blackberry' }),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 for empty token', async () => {
    const res = await app.inject({
      method:  'POST',
      url:     '/api/notifications/devices',
      headers: { ...withAuth(), 'content-type': 'application/json' },
      payload: JSON.stringify({ token: '', platform: 'android' }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without auth headers', async () => {
    const res = await app.inject({
      method:   'POST',
      url:      '/api/notifications/devices',
      headers:  { 'content-type': 'application/json' },
      payload:  JSON.stringify({ token: 'tok', platform: 'ios' }),
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── DELETE /api/notifications/devices/:token ──────────────────────────────────

describe('DELETE /api/notifications/devices/:token', () => {
  it('deactivates the push token', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const token = 'ExponentPushToken[abc123]';
    const res = await app.inject({
      method:  'DELETE',
      url:     `/api/notifications/devices/${encodeURIComponent(token)}`,
      headers: withAuth(),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE device_tokens');
    expect(sql).toContain('is_active = FALSE');
    expect(params[1]).toBe(USER_ID);
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url:    '/api/notifications/devices/some-token',
    });
    expect(res.statusCode).toBe(401);
  });
});
