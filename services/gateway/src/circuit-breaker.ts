// gateway/src/circuit-breaker.ts
//
// Per-service circuit breakers using opossum + undici.
// Each upstream gets its own CircuitBreaker instance so a single slow
// service cannot exhaust the gateway's connection pool or block all traffic.
//
// State transitions:
//   CLOSED   → normal operation; failures are counted
//   OPEN     → fail-fast; requests return 503 immediately
//   HALF-OPEN → one probe request allowed; success re-CLOSEs the circuit
//
// Tuning (environment-independent defaults):
//   timeout                 5 s   — max time to wait for upstream response
//   errorThresholdPercentage 50%  — open circuit when error rate exceeds this
//   volumeThreshold          5    — minimum calls before tripping
//   resetTimeout            30 s  — wait before attempting HALF-OPEN probe

import CircuitBreaker from 'opossum';
import { request as undiciRequest, Agent } from 'undici';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ProxyArgs {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer | null;
}

export interface ProxyResult {
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: Buffer;
}

// ── Static 503 fallback response ──────────────────────────────────────────────

const SERVICE_UNAVAILABLE: ProxyResult = {
  statusCode: 503,
  headers: { 'content-type': 'application/json' },
  body: Buffer.from(
    JSON.stringify({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'This service is temporarily unavailable. Please try again in a moment.',
      },
    })
  ),
};

// ── Circuit breaker options ────────────────────────────────────────────────────

const CB_OPTIONS = {
  timeout: 5_000,
  errorThresholdPercentage: 50,
  resetTimeout: 30_000,
  volumeThreshold: 5,
} as const;

// ── Factory ───────────────────────────────────────────────────────────────────

export function createServiceBreaker(
  serviceUrl: string
): CircuitBreaker<[ProxyArgs], ProxyResult> {
  // One undici connection pool per upstream service
  const agent = new Agent({
    connections: 100,
    bodyTimeout: 30_000,
    headersTimeout: 5_000,
  });

  // ── The function opossum wraps ─────────────────────────────────────────────
  async function callUpstream(args: ProxyArgs): Promise<ProxyResult> {
    const response = await undiciRequest(`${serviceUrl}${args.url}`, {
      method: args.method as
        | 'GET'
        | 'POST'
        | 'PUT'
        | 'PATCH'
        | 'DELETE'
        | 'HEAD'
        | 'OPTIONS'
        | 'CONNECT'
        | 'TRACE',
      headers: args.headers as Record<string, string>,
      body: args.body ?? undefined,
      dispatcher: agent,
    });

    const chunks: Buffer[] = [];
    for await (const chunk of response.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return {
      statusCode: response.statusCode,
      headers: response.headers as Record<string, string | string[]>,
      body: Buffer.concat(chunks),
    };
  }

  const breaker = new CircuitBreaker(callUpstream, CB_OPTIONS);

  // ── Fallback: returned when circuit is OPEN or the call fails ─────────────
  breaker.fallback(() => SERVICE_UNAVAILABLE);

  // ── State transition logging ──────────────────────────────────────────────
  breaker.on('open', () =>
    console.error(`[circuit-breaker] OPEN — ${serviceUrl} is unavailable`)
  );
  breaker.on('halfOpen', () =>
    console.warn(`[circuit-breaker] HALF-OPEN — probing ${serviceUrl}`)
  );
  breaker.on('close', () =>
    console.info(`[circuit-breaker] CLOSED — ${serviceUrl} recovered`)
  );
  breaker.on('fallback', () =>
    console.warn(`[circuit-breaker] fallback fired for ${serviceUrl}`)
  );

  return breaker;
}
