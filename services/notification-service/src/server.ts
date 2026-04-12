import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { runMigrations } from './db/migrate';
import { startEventConsumer, stopEventConsumer } from './consumers/event.consumer';
import { registerNotificationRoutes } from './routes/notifications';

const app = Fastify({
  logger: {
    level: config.NODE_ENV === 'production' ? 'info' : 'debug',
    transport: config.NODE_ENV !== 'production'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
});

async function bootstrap(): Promise<void> {
  // Run DB migrations at startup (idempotent)
  await runMigrations();
  app.log.info('Database migrations complete');

  await app.register(cors);

  // Standardized error handler
  app.setErrorHandler((error, _req, reply) => {
    app.log.error(error);
    return reply.code(error.statusCode ?? 500).send({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
    });
  });

  // Health endpoint
  app.get('/health', async () => ({
    status: 'ok',
    service: 'notification-service',
  }));

  // REST API routes
  await registerNotificationRoutes(app);

  // Start RabbitMQ consumer (non-blocking — errors logged, not thrown)
  startEventConsumer().catch(err => {
    app.log.error('RabbitMQ consumer failed to start:', err);
  });

  // HTTP server
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`Notification service listening on port ${config.PORT}`);
}

// Graceful shutdown
async function shutdown(signal: string): Promise<void> {
  app.log.info(`Received ${signal}, shutting down…`);
  await stopEventConsumer();
  await app.close();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

bootstrap().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
