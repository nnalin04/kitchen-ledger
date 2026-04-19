// gateway/src/routes/proxy.ts
//
// Registers one wildcard route per upstream service.
// Every inbound request is forwarded through a per-service CircuitBreaker
// backed by an undici connection pool.  If the upstream is unavailable
// (circuit OPEN or connection failure) the caller receives a structured
// 503 immediately instead of waiting for the 30-second timeout.
//
// Body forwarding:
//   All request bodies are captured as raw Buffer by the '*' content-type
//   parser registered in server.ts and forwarded verbatim to upstream.
//   This preserves binary payloads (multipart uploads, etc.) without
//   re-serialisation.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config';
import { createServiceBreaker } from '../circuit-breaker';
import type { ProxyArgs } from '../circuit-breaker';
import type CircuitBreaker from 'opossum';
import type { ProxyResult } from '../circuit-breaker';

// ── Service routing table ─────────────────────────────────────────────────────

const SERVICE_PREFIXES: Array<{ prefix: string; upstream: string }> = [
  { prefix: '/api/auth',          upstream: config.AUTH_SERVICE_URL },
  { prefix: '/api/inventory',     upstream: config.INVENTORY_SERVICE_URL },
  { prefix: '/api/finance',       upstream: config.FINANCE_SERVICE_URL },
  { prefix: '/api/staff',         upstream: config.STAFF_SERVICE_URL },
  { prefix: '/api/ai',            upstream: config.AI_SERVICE_URL },
  { prefix: '/api/files',         upstream: config.FILE_SERVICE_URL },
  { prefix: '/api/notifications', upstream: config.NOTIFICATION_SERVICE_URL },
  { prefix: '/api/reports',       upstream: config.REPORT_SERVICE_URL },
];

// ── Hop-by-hop headers (must not be forwarded) ────────────────────────────────

const HOP_BY_HOP_REQUEST = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'te',
  'trailer',
  'proxy-authorization',
  'proxy-authenticate',
  'upgrade',
  'host',
]);

const HOP_BY_HOP_RESPONSE = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
]);

// ── Route registration ────────────────────────────────────────────────────────

export async function registerProxies(app: FastifyInstance): Promise<void> {
  // Build one circuit breaker per upstream service at startup
  const breakers = new Map<string, CircuitBreaker<[ProxyArgs], ProxyResult>>();
  for (const { prefix, upstream } of SERVICE_PREFIXES) {
    breakers.set(prefix, createServiceBreaker(upstream));
  }

  for (const { prefix } of SERVICE_PREFIXES) {
    const breaker = breakers.get(prefix)!;

    const handler = async (
      req: FastifyRequest,
      reply: FastifyReply
    ): Promise<void> => {
      // Strip hop-by-hop headers before forwarding
      const forwardHeaders: Record<string, string | string[] | undefined> = {};
      for (const [key, value] of Object.entries(req.headers)) {
        if (!HOP_BY_HOP_REQUEST.has(key.toLowerCase())) {
          forwardHeaders[key] = value;
        }
      }

      const args: ProxyArgs = {
        method:  req.method,
        url:     req.url,
        headers: forwardHeaders,
        body:    req.body as Buffer | null,
      };

      // fire() either returns the upstream response or the 503 fallback
      const result = await breaker.fire(args);

      // Forward upstream response headers, excluding hop-by-hop
      for (const [key, value] of Object.entries(result.headers)) {
        if (!HOP_BY_HOP_RESPONSE.has(key.toLowerCase())) {
          reply.header(key, value as string);
        }
      }

      reply.code(result.statusCode).send(result.body);
    };

    // Register for exact prefix (e.g. /api/auth) and all sub-paths (/api/auth/*)
    app.all(prefix, handler);
    app.all(`${prefix}/*`, handler);
  }
}
