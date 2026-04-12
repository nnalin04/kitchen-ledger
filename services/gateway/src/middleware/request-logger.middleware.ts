import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import crypto from 'node:crypto';

/**
 * Registers structured access logging hooks on the Fastify instance.
 *
 * Each request gets a unique X-Request-Id header injected before it
 * reaches any upstream service. The onResponse hook emits a structured
 * log entry with: requestId, method, path, status, durationMs, tenantId.
 */
export function registerRequestLogger(app: FastifyInstance): void {

  // Attach a unique request ID to every incoming request
  app.addHook('onRequest', async (request: FastifyRequest) => {
    const requestId = (request.headers['x-request-id'] as string)
      ?? crypto.randomUUID();
    request.headers['x-request-id'] = requestId;
  });

  // Structured access log after each response is sent
  app.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId  = request.headers['x-tenant-id']  ?? 'anon';
    const requestId = request.headers['x-request-id'] ?? '-';
    const durationMs = Math.round(reply.elapsedTime);

    const level = reply.statusCode >= 500 ? 'error'
                : reply.statusCode >= 400 ? 'warn'
                : 'info';

    request.log[level]({
      requestId,
      tenantId,
      method: request.method,
      path: request.routerPath ?? request.url.split('?')[0],
      status: reply.statusCode,
      durationMs,
    }, 'request completed');
  });
}
