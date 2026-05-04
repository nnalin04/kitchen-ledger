import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db';
import { config } from '../config';
import { sendPush } from '../providers/expo-push.provider';
import { buildDailyDigest, buildWeeklySummary } from '../scheduler/digest.scheduler';

export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {

  // ── Notifications ────────────────────────────────────────────

  // GET /api/notifications — list for current user (paginated)
  app.get('/api/notifications', async (req, reply) => {
    const userId   = req.headers['x-user-id']   as string;
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!userId || !tenantId) return reply.code(401).send(unauthorized());

    const page  = Number((req.query as Record<string, string>).page)  || 1;
    const limit = Number((req.query as Record<string, string>).limit) || 20;
    const offset = (page - 1) * limit;

    const { rows } = await pool.query(
      `SELECT id, type, priority, title, body, data, channels, read_at, created_at
       FROM notifications
       WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL)
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [tenantId, userId, limit, offset]
    );

    const { rows: [count] } = await pool.query<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM notifications
       WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL)`,
      [tenantId, userId]
    );

    return reply.send({
      success: true,
      data: rows,
      meta: { page, limit, total: Number(count.total) },
    });
  });

  // GET /api/notifications/unread-count
  app.get('/api/notifications/unread-count', async (req, reply) => {
    const userId   = req.headers['x-user-id']   as string;
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!userId || !tenantId) return reply.code(401).send(unauthorized());

    const { rows: [row] } = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM notifications
       WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL) AND read_at IS NULL`,
      [tenantId, userId]
    );

    return reply.send({ success: true, data: { count: Number(row.count) } });
  });

  // PATCH /api/notifications/:id/read
  app.patch('/api/notifications/:id/read', async (req, reply) => {
    const { id } = req.params as { id: string };
    const userId   = req.headers['x-user-id']   as string;
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!userId || !tenantId) return reply.code(401).send(unauthorized());

    const { rowCount } = await pool.query(
      `UPDATE notifications SET read_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND read_at IS NULL`,
      [id, tenantId]
    );

    if (rowCount === 0) {
      return reply.code(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Notification not found' },
      });
    }
    return reply.send({ success: true });
  });

  // PATCH /api/notifications/read-all
  app.patch('/api/notifications/read-all', async (req, reply) => {
    const userId   = req.headers['x-user-id']   as string;
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!userId || !tenantId) return reply.code(401).send(unauthorized());

    await pool.query(
      `UPDATE notifications SET read_at = NOW()
       WHERE tenant_id = $1 AND (user_id = $2 OR user_id IS NULL) AND read_at IS NULL`,
      [tenantId, userId]
    );

    return reply.send({ success: true });
  });

  // GET /api/notifications/digest — daily digest for tenant
  app.get('/api/notifications/digest', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return reply.code(401).send(unauthorized());

    const digest = await buildDailyDigest(tenantId);
    const { rows } = await pool.query(
      `SELECT id, title, body, created_at FROM notifications
       WHERE tenant_id = $1 AND type = 'digest'
       ORDER BY created_at DESC LIMIT 10`,
      [tenantId]
    );

    return reply.send({ success: true, data: { ...digest, recent: rows } });
  });

  // GET /api/notifications/weekly-summary — weekly summary for tenant
  app.get('/api/notifications/weekly-summary', async (req, reply) => {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return reply.code(401).send(unauthorized());

    const summary = await buildWeeklySummary(tenantId);
    const { rows } = await pool.query(
      `SELECT type, priority, COUNT(*) AS count
       FROM notifications
       WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '7 days'
       GROUP BY type, priority
       ORDER BY count DESC`,
      [tenantId]
    );

    return reply.send({ success: true, data: { ...summary, breakdown: rows } });
  });

  // ── Device tokens ─────────────────────────────────────────────

  const registerTokenSchema = z.object({
    token:    z.string().min(1),
    platform: z.enum(['ios', 'android', 'web']),
  });

  // POST /api/notifications/devices — register push token
  app.post('/api/notifications/devices', async (req, reply) => {
    const userId   = req.headers['x-user-id']   as string;
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!userId || !tenantId) return reply.code(401).send(unauthorized());

    const parsed = registerTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body' },
      });
    }

    const { token, platform } = parsed.data;

    // Upsert: update last_used_at if token already exists, else insert
    await pool.query(
      `INSERT INTO device_tokens (user_id, tenant_id, token, platform)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (token) DO UPDATE
         SET user_id      = EXCLUDED.user_id,
             tenant_id    = EXCLUDED.tenant_id,
             is_active    = TRUE,
             last_used_at = NOW()`,
      [userId, tenantId, token, platform]
    );

    return reply.code(201).send({ success: true });
  });

  // DELETE /api/notifications/devices/:token — unregister push token
  app.delete('/api/notifications/devices/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const userId = req.headers['x-user-id'] as string;
    if (!userId) return reply.code(401).send(unauthorized());

    await pool.query(
      `UPDATE device_tokens SET is_active = FALSE
       WHERE token = $1 AND user_id = $2`,
      [token, userId]
    );

    return reply.send({ success: true });
  });

  // ── Internal: direct send (service-to-service) ───────────────────────
  // Protected by INTERNAL_SERVICE_SECRET header, not gateway JWT.

  const internalSendSchema = z.object({
    user_id:   z.string().uuid(),
    title:     z.string().min(1),
    body:      z.string().min(1),
    priority:  z.enum(['critical', 'important', 'informational']).default('informational'),
    channels:  z.array(z.enum(['push', 'email'])).default(['push']),
    data:      z.record(z.unknown()).optional(),
    tenant_id: z.string().uuid(),
  });

  app.post('/internal/notifications/send', async (req, reply) => {
    const secret = req.headers['x-internal-secret'] as string;
    if (!secret || secret !== config.INTERNAL_SERVICE_SECRET) {
      return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED' } });
    }

    const parsed = internalSendSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: parsed.error.message },
      });
    }

    const { user_id, title, body, priority, channels, data, tenant_id } = parsed.data;

    // Persist to DB
    const { rows: [row] } = await pool.query(
      `INSERT INTO notifications (tenant_id, user_id, type, priority, title, body, data, channels)
       VALUES ($1, $2, 'direct', $3, $4, $5, $6, $7)
       RETURNING id`,
      [tenant_id, user_id, priority, title, body, JSON.stringify(data ?? {}), JSON.stringify(channels)]
    );

    // Dispatch push
    if (channels.includes('push')) {
      await sendPush({ userId: user_id, title, body, data, priority });
    }

    return reply.code(201).send({ success: true, data: { id: row.id } });
  });
}

function unauthorized() {
  return {
    success: false,
    error: { code: 'UNAUTHORIZED', message: 'Missing user context headers' },
  };
}
