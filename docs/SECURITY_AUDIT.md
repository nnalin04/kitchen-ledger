# KitchenLedger Security Audit Report
**Date:** 2026-04-26
**Scope:** Full OWASP audit across all 9 services
**Status:** CONDITIONAL PASS — not ready for production until blockers resolved

---

## Production Blockers (fix before any production deployment)

| # | Finding | Severity | Fixed? |
|---|---------|----------|--------|
| H-1 | Hardcoded default credentials in docker-compose + Python config defaults | High | [ ] |
| H-3 | Notification service CORS fully open (`await app.register(cors)` with no options) | High | [ ] |
| M-4 | `INTERNAL_SERVICE_SECRET` empty-string default in inventory/finance/staff — no fail-fast | Medium | [ ] |
| M-7 | `AuthController.extractUserId` falls back to raw `x-user-id` header — identity spoofing | Medium | [ ] |
| M-8 | All internal service ports bound to host in docker-compose — bypasses gateway | Medium | [ ] |

## Must Fix Before UAT

| # | Finding | Severity | Fixed? |
|---|---------|----------|--------|
| H-2 | Actuator `show-details: always` leaks JDBC URL + pool state | High | [ ] |
| H-4 | Missing `server.error.include-stacktrace: never` in Spring Boot | High | [ ] |
| H-5 | Internal secret header name inconsistency (`X-Internal-Service-Secret` vs `x-internal-secret`) | High | [ ] |
| M-1 | OCR monetary values serialized as `float` — rounding errors in financial records | Medium | [ ] |
| M-2 | FastAPI Swagger `/docs` exposed without auth on AI and Report services | Medium | [ ] |
| M-3 | File `purpose`/`context` path segment not sanitized — path traversal risk | Medium | [ ] |
| M-5 | Audit log returns raw `old_data`/`new_data` JSONB including sensitive fields (passwords, bank details) | Medium | [ ] |
| M-6 | 1-year signed URLs stored permanently — no revocation on file soft-delete | Medium | [ ] |

## Defer to Next Sprint

| # | Finding | Severity | Fixed? |
|---|---------|----------|--------|
| L-1 | `anyRequest().permitAll()` in SecurityConfig — RBAC relies only on AOP aspect | Low | [ ] |
| L-2 | AI service allows empty `internal_service_secret` — no startup guard | Low | [ ] |
| L-3 | Audit log report accessible to any role — no owner/manager check | Low | [ ] |
| L-4 | Gateway error handler leaks `error.message` including internal hostnames | Low | [ ] |
| L-5 | Logout does not write JTI to Redis revocation list | Low | [ ] |

---

## Detailed Findings

### H-1: Hardcoded Default Credentials

- **Files:** `infrastructure/docker-compose.yml` (x-spring-env, x-python-env anchors), `services/ai-service/app/core/config.py:19`, `services/report-service/app/core/config.py:15`
- **Issue:** `kl_password`, `kl_rabbit_pass` hardcoded as literal values. Python Pydantic defaults: `rabbitmq_url: str = "amqp://kl_rabbit:kl_rabbit_pass@localhost:5672"`. Any developer running `docker-compose up` without `.env` starts with known-public credentials.
- **Impact:** Attacker with repo access authenticates to RabbitMQ (port 15672) and reads/publishes all inter-service events including auth tokens and financial data.
- **Fix:** Change all credential values to `${VAR}` with no default. Remove literal strings from Python defaults. Startup fails fast when `.env` is missing.

### H-2: Actuator `show-details: always`

- **Files:** `auth-service/application.yml:64`, `inventory-service/application.yml:54`, `finance-service/application.yml:57`, `staff-service/application.yml:54`
- **Issue:** `/actuator/health` returns full JDBC connection URL, Hikari pool state, and Flyway migration status to any caller. Endpoints are `permitAll()`.
- **Fix:** Change to `show-details: when_authorized` in all four files. Add `application-prod.yml` with `never`.

### H-3: Notification Service CORS Open

- **File:** `services/notification-service/src/server.ts:22`
- **Issue:** `await app.register(cors)` with zero arguments — allows any origin.
- **Fix:** Add `{ origin: allowedOrigins, credentials: true }` reading from `ALLOWED_ORIGINS` env var.

### H-4: Missing `server.error.include-stacktrace: never`

- **Files:** All four Java `application.yml` files
- **Issue:** Spring Boot may return `trace` field in JSON error responses. Stack traces reveal internal class names, SQL errors, library versions.
- **Fix:** Add `server.error.include-stacktrace: never` and `server.error.include-message: always` to all four files.

### H-5: Internal Secret Header Name Inconsistency

- **Issue:** Auth service reads `X-Internal-Service-Secret`; all others read `x-internal-secret`. Callers sending `x-internal-secret` get 403 from auth service.
- **Fix:** Standardize on `x-internal-secret` across all internal controllers and outbound calls.

### M-1: Monetary Float in OCR Pipeline

- **File:** `services/ai-service/app/workers/tasks.py:160-190`
- **Issue:** `float(pred.total_amount.value)` introduces binary floating-point rounding errors. Penny discrepancies in expense records.
- **Fix:** Use `str(pred.total_amount.value)` for all monetary fields. Let consumer parse as `Decimal`/`BigDecimal`.

### M-2: FastAPI Swagger Exposed

- **Files:** `services/ai-service/app/main.py:13`, `services/report-service/app/main.py:33`
- **Issue:** `/docs` accessible without authentication, reveals all internal endpoint schemas and required headers.
- **Fix:** `docs_url="/docs" if settings.debug else None`

### M-3: File Path Traversal via `purpose` Field

- **File:** `services/file-service/src/routes/files.ts:109,157`
- **Issue:** `purpose`/`context` field used directly in storage path without allowlist validation. `../../other-tenant` escapes tenant prefix.
- **Fix:** Validate `purpose` against allowlist `['receipt','invoice','import','general','avatar']`. Validate extension against MIME-derived allowlist.

### M-4: Empty INTERNAL_SERVICE_SECRET Default

- **Files:** All three `application.yml` files (inventory, finance, staff): `service-secret: ${INTERNAL_SERVICE_SECRET:}`
- **Issue:** Empty default means `MessageDigest.isEqual("".getBytes(), "".getBytes())` returns `true` — all `/internal/` endpoints open when env var not set.
- **Fix:** Change to `${INTERNAL_SERVICE_SECRET}` (no colon-default). Add startup fail-fast check identical to auth service.

### M-5: Audit Log Returns Raw Sensitive JSONB

- **Files:** `InternalInventoryController.java:182-201`, `InternalFinanceController.java:88-103`
- **Issue:** `old_data`/`new_data` JSONB columns contain full row diffs including hashed passwords, bank details, salary fields. Returned to report service and surfaced publicly.
- **Fix:** Strip sensitive fields via SQL: `old_data - 'hashed_password' - 'bank_account' - 'tax_id'`.

### M-6: 1-Year Signed URLs Stored Permanently

- **File:** `services/file-service/src/routes/files.ts:114,188`
- **Issue:** `expiresIn = 60 * 60 * 24 * 365` signed URL stored as `public_url`. No revocation on soft-delete or tenant cancellation.
- **Fix:** Remove `public_url` from uploads. Generate short-lived (15min) signed URLs on-demand via `GET /api/v1/files/:id/url`.

### M-7: AuthController Identity Spoofing via Header Fallback

- **File:** `services/auth-service/src/main/java/com/kitchenledger/auth/controller/AuthController.java:108-116`
- **Issue:** Falls back to raw `x-user-id` header if attribute not set. Direct calls to port 8081 bypass gateway — attacker can impersonate any user.
- **Fix:** Remove header fallback. Return 401 if `getAttribute("kl.userId")` is null.

### M-8: Docker Compose Host Port Bindings

- **File:** `infrastructure/docker-compose.yml`
- **Issue:** All internal services (AI:8084, Report:8087, Notification:8086, Staff:8088, etc.) bound to `0.0.0.0` on host.
- **Fix:** Create `docker-compose.prod.yml` override with `ports:` removed from all services except gateway.

### L-1 through L-5
See full findings from security agent (summarized in tables above).

---

## What Is Secure ✅

- RS256 JWT with no `alg:none` bypass
- JWT revocation via Redis JTI (gateway checks on every request)
- Constant-time secret comparison (`MessageDigest.isEqual`) — no timing attacks
- Parameterized queries everywhere (JPA, SQLAlchemy, JDBC `?` placeholders)
- Tenant isolation via `TenantRlsAspect` on every `@Transactional` call
- Auth service has fail-fast for empty `INTERNAL_SERVICE_SECRET`
- File service MIME type allowlist + size limits
- Login brute-force protection (progressive lockout via Redis)
- Refresh token rotation with SHA-256 storage
- Generic error messages in global exception handlers
- Password reset enumeration prevention (always returns 200)
- Gateway CORS uses allowlist from `ALLOWED_ORIGINS` env var
- Rate limiting on all auth endpoints (Redis-backed)
