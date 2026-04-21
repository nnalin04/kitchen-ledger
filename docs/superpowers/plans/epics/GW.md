# EPIC: GW — API Gateway

**Phase:** 1 | **Weeks:** 2–3
**Service:** `services/gateway` (Node.js 22 + Fastify 4 + TypeScript) | **Port:** 8080
**Goal:** Single public entry point. JWT verification, rate limiting, request routing, health aggregation. Zero business logic.
**Depends on:** INFRA-5 (skeleton), AUTH-3 (public key), Redis running
**Blocks:** All frontend work — nothing can talk to backend without the Gateway

---

## GW-1: JWT Middleware & Rate Limiting

- [ ] Complete `src/middleware/auth.middleware.ts` (exact from TRD §2.3):
  - Public route list: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/health`
  - Extract `Authorization: Bearer {token}` header → missing = 401 `MISSING_TOKEN`
  - Verify RS256 with `JWT_PUBLIC_KEY` env var using `jsonwebtoken`
  - On `TokenExpiredError` → 401 `TOKEN_EXPIRED`
  - On other `JsonWebTokenError` → 401 `INVALID_TOKEN`
  - Redis check: `GET revoked:{jti}` → exists = 401 `TOKEN_REVOKED`
  - Inject downstream headers: `X-User-Id`, `X-Tenant-Id`, `X-User-Role`, `X-User-Email`
- [ ] Complete `src/config/rate-limit.ts` with per-route windows from TRD §2.4:
  - `/api/auth/login` → 10 req / 15 min
  - `/api/auth/register` → 5 req / 1 hour
  - `/api/auth/refresh` → 30 req / 15 min
  - `/api/ai/ocr` → 20 req / 1 hour
  - `/api/ai/voice` → 60 req / 1 hour
  - `/api/ai/query` → 100 req / 1 hour
  - Default → 500 req / 1 min
- [ ] Key generator: `tenant_id` header for authenticated requests, `request.ip` for unauthenticated
- [ ] Register `@fastify/rate-limit` with Redis as backing store (shared across instances)
- [ ] **Test:** Login 11 times from same IP → 12th returns 429 with `Retry-After` header. Tampered JWT → 401. Expired JWT → 401 `TOKEN_EXPIRED`.

---

## GW-2: Proxy Routes, Circuit Breaker & Health

- [ ] Register all 8 upstream proxies via `@fastify/http-proxy` (exact route map from TRD §2.2):
  ```
  /api/auth         → AUTH_SERVICE_URL   (http://auth-service:8081)
  /api/inventory    → INVENTORY_SERVICE_URL
  /api/finance      → FINANCE_SERVICE_URL
  /api/staff        → STAFF_SERVICE_URL
  /api/ai           → AI_SERVICE_URL
  /api/files        → FILE_SERVICE_URL
  /api/notifications→ NOTIFICATION_SERVICE_URL
  /api/reports      → REPORT_SERVICE_URL
  ```
- [ ] Circuit breaker via `opossum`: open after 5 consecutive failures in 30s per upstream; half-open probe every 10s
- [ ] Add `@fastify/cors` for web app origin (`ALLOWED_ORIGIN` env var), credentials: true
- [ ] Structured request logging with `pino`: log `tenant_id`, `user_id`, `method`, `path`, `status`, `duration_ms` for every request
- [ ] `GET /health` — exact response shape from TRD §2.6:
  ```json
  {
    "status": "ok",
    "timestamp": "ISO-8601",
    "services": { "auth": { "status": "ok", "latency_ms": 4 }, ... },
    "infrastructure": { "redis": { "status": "ok" }, "rabbitmq": { "status": "ok" } }
  }
  ```
- [ ] `GET /health/services` — same but expanded per-service details
- [ ] **Test:** GET `/api/inventory/items` proxied with injected `X-User-Id` header. Mock upstream returning 500 5× → circuit opens → subsequent requests return 503 without hitting upstream.

---

## GW-3: Gateway Tests

- [ ] Unit tests for `auth.middleware.ts`:
  - Valid token → headers injected correctly
  - Missing token → 401 MISSING_TOKEN
  - Expired token → 401 TOKEN_EXPIRED
  - Revoked token (Redis mock) → 401 TOKEN_REVOKED
  - Tampered signature → 401 INVALID_TOKEN
  - Public route → passes through without token
- [ ] Integration tests (Vitest + supertest) with mocked upstream services (nock or mock Fastify servers)
- [ ] Rate limit test: burst 11 login attempts → verify 12th is 429
- [ ] Coverage gate: **≥ 80% line coverage**
