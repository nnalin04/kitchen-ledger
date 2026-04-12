import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';

const app = Fastify({
  logger: { level: config.NODE_ENV === 'production' ? 'info' : 'debug' },
});

async function bootstrap(): Promise<void> {
  await app.register(cors);

  // Error handler — standardized {success, error} format
  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    return reply.code(error.statusCode ?? 500).send({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
    });
  });

  // Health endpoint (required by Docker healthcheck)
  app.get('/health', async () => ({
    status: 'ok',
    service: 'file-service',
  }));

  // TODO Phase 2: register multipart upload routes under /api/v1/files
  // TODO Phase 2: integrate Supabase Storage for pre-signed URL generation

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`File service listening on port ${config.PORT}`);
}

bootstrap().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
