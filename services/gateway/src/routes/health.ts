import { FastifyInstance } from 'fastify';
import { redisClient } from '../redis';
import { config } from '../config';

interface ServiceStatus {
  status: 'ok' | 'error';
  latency_ms?: number;
  error?: string;
}

async function pingService(url: string, name: string): Promise<ServiceStatus> {
  const start = Date.now();
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { status: 'ok', latency_ms: Date.now() - start };
  } catch (err) {
    return { status: 'error', error: (err as Error).message };
  }
}

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Readiness probe — 200 when this gateway can accept traffic.
   * Checks Redis (session store) and auth service (JWT verification dependency).
   * Distinct from /health: /health is liveness, /ready is readiness.
   */
  app.get('/ready', async (_req, reply) => {
    let redisOk = false;
    try {
      await redisClient.ping();
      redisOk = true;
    } catch { /* not ready */ }

    const authStatus = await pingService(config.AUTH_SERVICE_URL, 'auth');
    const ready = redisOk && authStatus.status === 'ok';

    return reply.code(ready ? 200 : 503).send({
      ready,
      checks: {
        redis: redisOk ? 'ok' : 'error',
        auth:  authStatus.status,
      },
    });
  });

  app.get('/health', async (_req, reply) => {
    const [auth, inventory, finance, staff, ai, file, notification, report] =
      await Promise.all([
        pingService(config.AUTH_SERVICE_URL, 'auth'),
        pingService(config.INVENTORY_SERVICE_URL, 'inventory'),
        pingService(config.FINANCE_SERVICE_URL, 'finance'),
        pingService(config.STAFF_SERVICE_URL, 'staff'),
        pingService(config.AI_SERVICE_URL, 'ai'),
        pingService(config.FILE_SERVICE_URL, 'file'),
        pingService(config.NOTIFICATION_SERVICE_URL, 'notification'),
        pingService(config.REPORT_SERVICE_URL, 'report'),
      ]);

    let redisStatus: ServiceStatus;
    try {
      await redisClient.ping();
      redisStatus = { status: 'ok' };
    } catch {
      redisStatus = { status: 'error' };
    }

    const allOk = [auth, inventory, finance, staff, ai, file, notification, report, redisStatus]
      .every(s => s.status === 'ok');

    return reply.code(allOk ? 200 : 503).send({
      status: allOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: { auth, inventory, finance, staff, ai, file, notification, report },
      infrastructure: { redis: redisStatus },
    });
  });
}
