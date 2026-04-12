import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { redisClient } from './redis';
import { authMiddleware } from './middleware/auth.middleware';
import { registerRequestLogger } from './middleware/request-logger.middleware';
import { registerProxies } from './routes/proxy';
import { registerHealthRoutes } from './routes/health';

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: config.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

async function bootstrap(): Promise<void> {
  // CORS
  await app.register(cors, {
    origin: config.NODE_ENV === 'production' ? false : true,
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

  // Error handler — standardized API response format
  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    if (error.statusCode === 429) {
      return reply.code(429).send({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many requests' },
      });
    }
    return reply.code(error.statusCode ?? 500).send({
      success: false,
      error: { code: 'GATEWAY_ERROR', message: error.message },
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
