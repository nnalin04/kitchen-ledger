import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// ── Mocks ─────────────────────────────────────────────────────────

const mockQuery = vi.hoisted(() => vi.fn());
vi.mock('../../db', () => ({ pool: { query: mockQuery } }));

const mockSendPush = vi.hoisted(() => vi.fn());
vi.mock('../../providers/expo-push.provider', () => ({ sendPush: mockSendPush }));

vi.mock('../../config', () => ({
  config: {
    INTERNAL_SERVICE_SECRET: 'test-internal-secret',
    RESEND_API_KEY:          'test-key',
    EXPO_ACCESS_TOKEN:       '',
    APP_URL:                 'https://app.test.com',
    RESEND_FROM_EMAIL:       'noreply@kitchenledger.app',
  },
}));

import { registerNotificationRoutes } from '../../routes/notifications';

// ── Helpers ───────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await registerNotificationRoutes(app);
  await app.ready();
  return app;
}

const VALID_BODY = {
  user_id:   '00000000-0000-0000-0000-000000000001',
  tenant_id: '00000000-0000-0000-0000-000000000002',
  title:     'Test Alert',
  body:      'This is a test',
  priority:  'important',
  channels:  ['push'],
  data:      { key: 'value' },
};

// ── Tests ─────────────────────────────────────────────────────────

describe('POST /internal/notifications/send', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [{ id: 'notif-uuid-1' }] });
    mockSendPush.mockResolvedValue(undefined);
    app = await buildApp();
  });

  // ── Auth ──────────────────────────────────────────────────────

  it('returns 401 when internal secret missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/notifications/send',
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when internal secret wrong', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/notifications/send',
      headers: { 'x-internal-service-secret': 'wrong-secret' },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(401);
  });

  // ── Success ───────────────────────────────────────────────────

  it('returns 201 and notification id on success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/notifications/send',
      headers: { 'x-internal-service-secret': 'test-internal-secret' },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toMatchObject({ success: true, data: { id: 'notif-uuid-1' } });
  });

  it('inserts notification into DB', async () => {
    await app.inject({
      method: 'POST',
      url: '/internal/notifications/send',
      headers: { 'x-internal-service-secret': 'test-internal-secret' },
      payload: VALID_BODY,
    });
    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO notifications');
    expect(params).toContain(VALID_BODY.user_id);
    expect(params).toContain(VALID_BODY.title);
  });

  it('calls sendPush when channels includes push', async () => {
    await app.inject({
      method: 'POST',
      url: '/internal/notifications/send',
      headers: { 'x-internal-service-secret': 'test-internal-secret' },
      payload: { ...VALID_BODY, channels: ['push'] },
    });
    expect(mockSendPush).toHaveBeenCalledOnce();
    expect(mockSendPush).toHaveBeenCalledWith(
      expect.objectContaining({ userId: VALID_BODY.user_id, title: VALID_BODY.title })
    );
  });

  it('does NOT call sendPush when channels is email only', async () => {
    await app.inject({
      method: 'POST',
      url: '/internal/notifications/send',
      headers: { 'x-internal-service-secret': 'test-internal-secret' },
      payload: { ...VALID_BODY, channels: ['email'] },
    });
    expect(mockSendPush).not.toHaveBeenCalled();
  });

  // ── Validation ────────────────────────────────────────────────

  it('returns 400 when user_id is missing', async () => {
    const { user_id, ...body } = VALID_BODY;
    const res = await app.inject({
      method: 'POST',
      url: '/internal/notifications/send',
      headers: { 'x-internal-service-secret': 'test-internal-secret' },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when title is empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/internal/notifications/send',
      headers: { 'x-internal-service-secret': 'test-internal-secret' },
      payload: { ...VALID_BODY, title: '' },
    });
    expect(res.statusCode).toBe(400);
  });
});
