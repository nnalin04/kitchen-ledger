import { FastifyInstance } from 'fastify';
import proxy from '@fastify/http-proxy';
import { config } from '../config';

export async function registerProxies(app: FastifyInstance): Promise<void> {
  const routes: Record<string, string> = {
    '/api/auth':          config.AUTH_SERVICE_URL,
    '/api/inventory':     config.INVENTORY_SERVICE_URL,
    '/api/finance':       config.FINANCE_SERVICE_URL,
    '/api/staff':         config.STAFF_SERVICE_URL,
    '/api/ai':            config.AI_SERVICE_URL,
    '/api/files':         config.FILE_SERVICE_URL,
    '/api/notifications': config.NOTIFICATION_SERVICE_URL,
    '/api/reports':       config.REPORT_SERVICE_URL,
  };

  for (const [prefix, upstream] of Object.entries(routes)) {
    await app.register(proxy, {
      upstream,
      prefix,
      rewritePrefix: prefix,
      httpMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      undici: {
        connections: 100,
        pipelining: 10,
        headersTimeout: 30_000,
        bodyTimeout: 30_000,
      },
    });
  }
}
