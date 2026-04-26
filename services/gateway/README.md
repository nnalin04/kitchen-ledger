# Gateway

The API gateway is the single entry point for all traffic in KitchenLedger. Every request from the web dashboard and mobile app passes through here before it reaches any backend service. No client ever talks directly to a backend service.

---

## What It Does

### Request Routing

The gateway maps URL prefixes to backend services and proxies requests forward with a per-service circuit breaker. If a service is down or slow, the gateway returns a structured error immediately instead of letting the caller wait for a timeout.

| URL Prefix | Routed To |
|---|---|
| `/api/auth/*` | Auth service |
| `/api/inventory/*` | Inventory service |
| `/api/finance/*` | Finance service |
| `/api/staff/*` | Staff service |
| `/api/ai/*` | AI service |
| `/api/files/*` | File service |
| `/api/notifications/*` | Notification service |
| `/api/reports/*` | Report service |

### Authentication

Every request must carry a valid `Authorization: Bearer <token>` header. The gateway verifies the token's signature and checks whether it has been revoked. Invalid or expired tokens are rejected before the request reaches any upstream service.

**Public endpoints** (no token required):
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `GET /api/auth/verify-email`
- `POST /api/auth/users/accept-invite`

Everything else requires authentication.

### Header Enrichment

Once a token is verified, the gateway extracts the user's identity and attaches it as headers before forwarding the request. Downstream services read these headers and never handle token verification themselves.

| Header | Value |
|---|---|
| `X-User-Id` | Authenticated user's ID |
| `X-Tenant-Id` | The restaurant (tenant) this user belongs to |
| `X-User-Role` | User's role (`owner`, `manager`, `kitchen_staff`, `server`) |
| `X-User-Email` | User's email address |

### Rate Limiting

Requests are rate-limited per tenant (or by IP for unauthenticated traffic). Sensitive authentication endpoints have stricter limits to slow down brute-force attempts:

| Endpoint | Limit |
|---|---|
| `POST /api/auth/login` | 10 requests per minute per IP |
| `POST /api/auth/register` | 5 requests per minute per IP |
| `POST /api/auth/forgot-password` | 3 requests per minute per IP |
| All other endpoints | 500 requests per minute per tenant |

Requests that exceed the limit receive a `429 Too Many Requests` response.

### Correlation IDs

Every request is assigned a unique correlation ID (`X-Correlation-Id` header), which is forwarded to all upstream services and echoed back in the response. This makes it possible to trace a single request across log files from multiple services.

### Circuit Breaker

Each upstream service has its own circuit breaker. If a service starts returning errors or timing out, its circuit opens and the gateway returns a `503 Service Unavailable` immediately, preventing cascading failures across the platform.

### CORS

Cross-origin requests are validated against an allowlist configured at startup. Only origins in the `ALLOWED_ORIGINS` environment variable are permitted. Server-to-server calls without an `Origin` header are always allowed.

---

## Response Format

All error responses from the gateway follow this shape:

```json
{
  "success": false,
  "error": {
    "code": "TOKEN_EXPIRED",
    "message": "Access token expired"
  }
}
```

Possible error codes:

| Code | HTTP Status | Meaning |
|---|---|---|
| `MISSING_TOKEN` | 401 | No `Authorization` header was provided |
| `TOKEN_EXPIRED` | 401 | The access token has expired — refresh it |
| `TOKEN_REVOKED` | 401 | The token was explicitly revoked (e.g. on logout) |
| `INVALID_TOKEN` | 401 | The token signature or structure is invalid |
| `RATE_LIMITED` | 429 | Too many requests from this tenant/IP |
| `GATEWAY_ERROR` | 500 | Internal gateway error |

---

## Getting Started

```bash
cd services/gateway
npm install
npm run dev
```

The gateway starts on port **8080**.

### Required Environment Variables

| Variable | Description |
|---|---|
| `JWT_PUBLIC_KEY` | RSA public key used to verify access tokens |
| `INTERNAL_SERVICE_SECRET` | Shared secret for service-to-service calls |
| `REDIS_URL` | Redis connection string (rate limiting and token revocation checks) |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |
| `AUTH_SERVICE_URL` | Base URL for the Auth service |
| `INVENTORY_SERVICE_URL` | Base URL for the Inventory service |
| `FINANCE_SERVICE_URL` | Base URL for the Finance service |
| `STAFF_SERVICE_URL` | Base URL for the Staff service |
| `AI_SERVICE_URL` | Base URL for the AI service |
| `FILE_SERVICE_URL` | Base URL for the File service |
| `NOTIFICATION_SERVICE_URL` | Base URL for the Notification service |
| `REPORT_SERVICE_URL` | Base URL for the Report service |

---

## Health Check

```bash
curl http://localhost:8080/health
```

Returns `200 OK` with basic gateway status. Does not check upstream service health.

---

## Running Tests

```bash
npm run test
```
