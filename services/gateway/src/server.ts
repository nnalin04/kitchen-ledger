import Fastify, { FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { redisClient } from './redis';
import { authMiddleware } from './middleware/auth.middleware';
import { registerRequestLogger } from './middleware/request-logger.middleware';
import { registerProxies } from './routes/proxy';
import { registerHealthRoutes } from './routes/health';

const app = Fastify({
  // trustProxy: true reads X-Forwarded-For from Google Cloud Load Balancer,
  // so req.ip resolves to the real client IP. Without this, all clients share
  // the load-balancer IP as rate-limit key, making brute-force protection useless.
  trustProxy: true,
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: config.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

async function bootstrap(): Promise<void> {
  // ── Raw body capture ───────────────────────────────────────────────────────
  // Captures ALL request bodies as raw Buffer so they can be forwarded to
  // upstream services verbatim (JSON, multipart, binary — all preserved).
  // Registered before any plugins or routes that might consume the body.
  const captureRawBody = (
    _req: FastifyRequest,
    body: Buffer,
    done: (err: Error | null, body: Buffer) => void
  ) => done(null, body);

  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, captureRawBody);
  app.addContentTypeParser('text/plain', { parseAs: 'buffer' }, captureRawBody);
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'buffer' }, captureRawBody);
  app.addContentTypeParser('*', { parseAs: 'buffer' }, captureRawBody);

  // ── CORS — allowlist-based (H-11) ─────────────────────────────────────────
  // Reads allowed origins from ALLOWED_ORIGINS env var (comma-separated).
  // Server-to-server calls (no Origin header) are always allowed.
  const allowedOrigins = config.ALLOWED_ORIGINS
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  await app.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no Origin header (server-to-server / curl / Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('CORS: Origin not allowed'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Rate limiting (Redis-backed, keyed by tenant or IP)
  await app.register(rateLimit, {
    global: true,
    max: 500,
    timeWindow: '1 minute',
    redis: redisClient as any,
    keyGenerator: (req) => {
      const tenantId = req.headers['x-tenant-id'];
      return tenantId ? `tenant:${tenantId}` : `ip:${req.ip}`;
    },
  });

  // Per-route rate limits from TRD §2.4.
  // Runs BEFORE the global limit; return 429 immediately on breach.
  // Window in seconds, max requests per window.
  const ROUTE_LIMITS: Array<{ path: string; max: number; windowSecs: number; methods?: string[] }> = [
    { path: '/api/auth/login',           max: 10,  windowSecs: 15 * 60, methods: ['POST'] },
    { path: '/api/auth/register',        max: 5,   windowSecs: 60 * 60, methods: ['POST'] },
    { path: '/api/auth/refresh',         max: 30,  windowSecs: 15 * 60, methods: ['POST'] },
    { path: '/api/auth/forgot-password', max: 3,   windowSecs: 15 * 60, methods: ['POST'] },
    { path: '/api/ai/ocr',               max: 20,  windowSecs: 60 * 60 },
    { path: '/api/ai/voice',             max: 60,  windowSecs: 60 * 60 },
    { path: '/api/ai/query',             max: 100, windowSecs: 60 * 60 },
  ];

  // ── Correlation ID propagation ────────────────────────────────────────────
  app.addHook('onRequest', async (req, reply) => {
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ||
      `kl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    (req.headers as Record<string, string>)['x-correlation-id'] = correlationId;
    reply.header('x-correlation-id', correlationId);
  });

  // ── Per-route rate limit enforcement ─────────────────────────────────────
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url?.split('?')[0] ?? '';
    const method = req.method?.toUpperCase() ?? 'GET';

    for (const rule of ROUTE_LIMITS) {
      if (!path.startsWith(rule.path)) continue;
      if (rule.methods && !rule.methods.includes(method)) continue;

      const key = `rl:${rule.path.replaceAll('/', ':')}:${req.ip}`;
      try {
        const count = await redisClient.incr(key);
        if (count === 1) await redisClient.expire(key, rule.windowSecs);

        if (count > rule.max) {
          return reply.code(429).send({
            success: false,
            error: {
              code: 'TOO_MANY_REQUESTS',
              message: `Rate limit exceeded. Try again in ${rule.windowSecs / 60} minute(s).`,
            },
          });
        }
      } catch {
        // Redis unavailable → fail open (allow request) to avoid blocking
        // legitimate traffic during a cache outage. Global rate limit also
        // fails open (default @fastify/rate-limit behaviour), so this is consistent.
        app.log.warn({ path: rule.path }, 'Per-route rate limit: Redis unavailable, failing open');
      }
      break; // first matching rule wins
    }
  });

  // Error handler — standardized API response format
  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    if (error.statusCode === 429) {
      return reply.code(429).send({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      });
    }
    const isAppError = typeof (error as any).statusCode === 'number' && (error as any).statusCode < 500;
    return reply.code((error as any).statusCode ?? 500).send({
      success: false,
      error: {
        code: (error as any).code ?? 'INTERNAL_ERROR',
        message: isAppError ? error.message : 'An unexpected error occurred',
      },
    });
  });

  // Structured access logging (request ID injection + onResponse log)
  registerRequestLogger(app);

  // JWT auth hook — runs before every request
  app.addHook('preHandler', authMiddleware);

  // Health routes (before proxies so they are matched first)
  await registerHealthRoutes(app);

  // Proxy routes to all upstream services
  await registerProxies(app);

  // Connect Redis
  await redisClient.connect();

  // Start server
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`Gateway listening on port ${config.PORT}`);
}

bootstrap().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
