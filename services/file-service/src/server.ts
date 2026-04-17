import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config';
import { runMigrations } from './db/migrate';
import { fileRoutes } from './routes/files';
import { internalFileRoutes } from './routes/internal';

const app = Fastify({
  logger: { level: config.NODE_ENV === 'production' ? 'info' : 'debug' },
});

async function bootstrap(): Promise<void> {
  await app.register(cors);
  await app.register(multipart, {
    limits: { fileSize: config.MAX_FILE_SIZE_MB * 1024 * 1024 },
  });

  // Error handler — standardized {success, error} format
  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    return reply.code(statusCode).send({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  });

  // Health endpoint (required by Docker healthcheck)
  app.get('/health', async () => ({
    status: 'ok',
    service: 'file-service',
  }));

  // Public routes (authenticated via gateway headers)
  await app.register(fileRoutes, { prefix: '/api/v1/files' });

  // Internal routes (authenticated via service secret)
  await app.register(internalFileRoutes, { prefix: '/internal/files' });

  // Run DB migrations before accepting traffic
  await runMigrations();

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`File service listening on port ${config.PORT}`);
}

bootstrap().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
