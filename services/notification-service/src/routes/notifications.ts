import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool } from '../db';

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
}

function unauthorized() {
  return {
    success: false,
    error: { code: 'UNAUTHORIZED', message: 'Missing user context headers' },
  };
}
