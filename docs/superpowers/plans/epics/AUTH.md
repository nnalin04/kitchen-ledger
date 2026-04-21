# EPIC: AUTH — Authentication & Multi-Tenancy Service

**Phase:** 1 | **Weeks:** 2–3
**Service:** `services/auth-service` (Java 21 + Spring Boot 4.0.5) | **Port:** 8081
**Goal:** Tenant registration, JWT login/refresh/logout, email verification, password reset, user invite flow, internal token verification endpoint.
**Depends on:** INFRA complete (service skeleton + DB running)
**Blocks:** GW-1 (Gateway needs public key), every service that trusts `X-User-*` headers

---

## AUTH-1: Database Schema Migration

- [ ] Write `V1__auth_schema.sql` (exact schema from TRD §2.8):
  - `tenants` — id, restaurant_name, slug UNIQUE, email UNIQUE, phone, address fields, timezone, currency, locale, subscription_tier CHECK('starter','growth','professional','enterprise'), subscription_status CHECK('trialing','active','past_due','canceled'), trial_ends_at, settings JSONB, onboarding_step, onboarding_done, created_at, updated_at, deleted_at
  - `users` — id, tenant_id FK, email, hashed_password, full_name, phone, role CHECK('owner','manager','kitchen_staff','server'), is_active, is_verified, last_login_at, avatar_url, pin_hash, language, UNIQUE(tenant_id, email)
  - `refresh_tokens` — id, user_id FK, token_hash UNIQUE, expires_at, revoked_at, user_agent, ip_address; index on user_id WHERE revoked_at IS NULL
  - `auth_tokens` — id, user_id FK, token_type CHECK('email_verify','password_reset','invite'), token_hash UNIQUE, expires_at, used_at, metadata JSONB
  - `auth_audit_logs` — id, tenant_id, user_id, event_type, ip_address, user_agent, metadata JSONB; index on (tenant_id, created_at DESC)
  - RLS enable on `tenants`, `users`, `refresh_tokens`; policy `tenant_isolation_users` on users using `current_setting('app.current_tenant_id', TRUE)::UUID`
- [ ] **Test:** Flyway migration applies cleanly to fresh DB. Cross-tenant RLS blocks row access.

---

## AUTH-2: JPA Entities & Repositories

- [ ] `model/Tenant.java` — @Entity, all fields, @Version for optimistic locking, subscription tier/status as enums
- [ ] `model/User.java` — @Entity, role as `@Enumerated(STRING)`, ManyToOne Tenant
- [ ] `model/RefreshToken.java` — @Entity, one token per row, index on non-revoked
- [ ] `model/AuthToken.java` — @Entity, token_type enum (EMAIL_VERIFY, PASSWORD_RESET, INVITE)
- [ ] `repository/TenantRepository.java` — `findByEmail(String)`, `findBySlug(String)`, `existsByEmail(String)`
- [ ] `repository/UserRepository.java` — `findByEmailIgnoreCaseAndTenantId(String, UUID)`, `existsByEmailIgnoreCaseAndTenantId(String, UUID)`, `findAllByTenantId(UUID)`
- [ ] `repository/RefreshTokenRepository.java` — `findByTokenHashAndRevokedAtIsNull(String)`
- [ ] `repository/AuthTokenRepository.java` — `findByTokenHashAndUsedAtIsNull(String)`
- [ ] **Test:** `@DataJpaTest` — save Tenant → save User linked to Tenant → retrieve by email → assert fields match

---

## AUTH-3: JWT Service (RSA-256)

- [ ] `config/JwtConfig.java` — load RSA private + public keys from env vars via `@Value`, expose as `@Bean RSAPrivateKey` and `@Bean RSAPublicKey`
- [ ] `security/JwtService.java` (exact from TRD §2.10):
  - `generateAccessToken(User user)` — JJWT builder with `jti` (UUID), `sub` (user_id), claims `tenant_id`, `role`, `email`; expiry 15 min; signed RS256
  - `generateRefreshToken()` — returns opaque `UUID.randomUUID().toString()`
  - `validateToken(String token)` — parses and verifies RS256 signature, throws `ExpiredJwtException` / `JwtException`
- [ ] `security/PasswordService.java` — BCrypt strength 12, `hashPassword(raw)`, `verifyPassword(raw, hash)`
- [ ] **Test:** Generate access token → decode and assert claims. Expired token throws. Token signed with wrong key throws. BCrypt verify round-trip passes.

---

## AUTH-4: Registration & Login Flow

- [ ] DTOs:
  - `RegisterRequest.java` — email, password (min 8 chars), restaurantName, phone
  - `LoginRequest.java` — email, password
  - `AuthResponse.java` — accessToken, refreshToken, expiresIn, user (UserResponse), tenant (TenantResponse)
  - `UserResponse.java` — id, email, fullName, role, isVerified, language, avatarUrl
  - `TenantResponse.java` — id, restaurantName, slug, timezone, currency, subscriptionTier, onboardingDone, settings
- [ ] `service/AuthService.java`:
  - `register(RegisterRequest, ip, userAgent)`:
    1. Check email uniqueness across all tenants (`tenantRepository` — no tenant_id filter here)
    2. Create `Tenant` (slug = lowercase+hyphenate restaurantName, deduplicate with suffix)
    3. Create `User` (role=OWNER, is_verified=false)
    4. Hash password BCrypt-12
    5. Generate access_token + refresh_token
    6. Store `RefreshToken` (hash of refresh_token, expires 30 days)
    7. Publish `auth.user.registered` + `auth.tenant.created` events
    8. Return `AuthResponse`
  - `login(LoginRequest, ip, userAgent)`:
    1. Find user by email (case-insensitive)
    2. Check `deleted_at IS NULL` and `is_active = true`
    3. Verify password BCrypt
    4. Update `last_login_at`
    5. Generate + return tokens
    6. Write `auth_audit_logs` entry
  - `refresh(refreshToken)`:
    1. Hash incoming token, find in DB WHERE revoked_at IS NULL
    2. Check not expired
    3. Load user, verify still active
    4. Generate new access_token
    5. Optionally rotate refresh token (sliding window — update expires_at)
  - `logout(jti, refreshToken, tokenExpiry)`:
    1. Store `revoked:{jti}` in Redis with TTL = remaining token lifetime
    2. Find refresh_token by hash, set `revoked_at = NOW()`
- [ ] `controller/AuthController.java`:
  - `POST /api/auth/register` → 201 AuthResponse
  - `POST /api/auth/login` → 200 AuthResponse
  - `POST /api/auth/refresh` → 200 `{ access_token, expires_in }`
  - `POST /api/auth/logout` → 200 `{ success: true }`
- [ ] **Test:** Register → login → use access token → refresh → logout → verify old JTI rejected in Redis

---

## AUTH-5: Email Verification & Password Reset

- [ ] `service/TokenService.java`:
  - `createEmailVerifyToken(userId)` — generate 32-byte random token, store SHA-256 hash in `auth_tokens` with 24h expiry
  - `createPasswordResetToken(userId)` — same, 1h expiry
  - `useToken(rawToken, tokenType)` — hash + find, check not used/expired, mark `used_at = NOW()`, return User
- [ ] `GET /api/auth/verify-email?token={raw}`:
  - Use token → mark `user.is_verified = true` → redirect to `{WEB_URL}/login?verified=true`
- [ ] `POST /api/auth/resend-verification` (Bearer):
  - Invalidate previous unused verify tokens for user
  - Create new → publish `auth.email.verify.requested` event (Notification Service sends email)
- [ ] `POST /api/auth/forgot-password`:
  - Accept `{ email }`, always return 200 (prevent email enumeration)
  - If user found: create reset token, publish `auth.password.reset.requested` event
- [ ] `POST /api/auth/reset-password`:
  - Accept `{ token, new_password, confirm_password }`
  - Validate passwords match, min 8 chars
  - Use token → update `hashed_password` → revoke all active refresh tokens for user
- [ ] **Test:** Full reset cycle. Expired token rejected. Already-used token rejected. Replay of same token rejected.

---

## AUTH-6: User & Tenant Management Endpoints

- [ ] `GET /api/auth/me` → `{ user: UserResponse, tenant: TenantResponse }`
- [ ] `PATCH /api/auth/me` → update `full_name`, `phone`, `language`; return updated `UserResponse`
- [ ] `POST /api/auth/me/change-password` → verify current password, hash new, revoke all refresh tokens
- [ ] `service/UserService.java` + `controller/UserController.java`:
  - `GET /api/auth/users` — [owner only] list all non-deleted users for tenant
  - `PATCH /api/auth/users/{id}` — [owner only] update `role`, `is_active`; audit log role changes
- [ ] `service/InviteService.java`:
  - `POST /api/auth/users/invite` — [owner only]:
    1. Create `User` with `is_verified=false`, assigned role
    2. Create `auth_tokens` entry with type=INVITE, 7-day expiry; metadata includes `role` + `inviter_id`
    3. Publish `auth.user.invited` event (carries invite token for email link)
  - `POST /api/auth/invite/accept`:
    1. Accept `{ token, password, full_name }`
    2. Use invite token → set password, mark `is_verified=true`
    3. Return `AuthResponse` (auto-login after accept)
- [ ] `service/TenantService.java` + `controller/TenantController.java`:
  - `GET /api/auth/tenant/profile` → TenantResponse with full address fields
  - `PATCH /api/auth/tenant/profile` → update restaurant name, address, timezone, currency
  - `GET /api/auth/tenant/settings` → tenant.settings JSONB (cast to typed SettingsResponse)
  - `PATCH /api/auth/tenant/settings` — [owner only] merge-update JSONB settings (cash threshold, tax rate, UPI config, food/labor cost targets, etc.)
- [ ] **Test:** Invite flow end-to-end: owner invites → accept → login as new user. Owner cannot invite to a higher role.

---

## AUTH-7: Internal Endpoints & Event Publishing

- [ ] `controller/InternalAuthController.java`:
  - `POST /internal/auth/verify-token` — validate JWT RS256, return `{ valid: true, payload: { user_id, tenant_id, role } }` or `{ valid: false, error }`; secured by `X-Internal-Secret` header check (not JWT)
  - `GET /internal/auth/users/{user_id}` — user detail lookup for other services; no tenant scoping needed (internal use)
  - Both endpoints: return 403 if `X-Internal-Secret` header ≠ `INTERNAL_SERVICE_SECRET` env var
- [ ] `event/AuthEventPublisher.java` (exact from TRD §2.14):
  - All methods use `RabbitTemplate.convertAndSend(exchange, routingKey, EventEnvelope)`
  - `publishUserRegistered(User, Tenant)` → routing key `auth.user.registered`
  - `publishUserInvited(User, inviteToken)` → `auth.user.invited`
  - `publishTenantCreated(tenantId)` → `auth.tenant.created`
  - `publishPasswordResetRequested(email, token, userId)` → `auth.password.reset.requested`
- [ ] Add Transactional Outbox pattern:
  - Write `outbox_events` DB table row in same @Transactional as the domain change
  - `@Scheduled(fixedDelay=5000)` background job reads unprocessed outbox rows → publishes to RabbitMQ → marks processed
  - Guarantees event delivery even if RabbitMQ is briefly unavailable at commit time
- [ ] **Test:** Register tenant → verify `auth.tenant.created` message in RabbitMQ finance-service queue. Outbox: simulate RabbitMQ down at registration → event published on reconnect.

---

## AUTH-8: Spring Security Configuration

- [ ] `config/SecurityConfig.java`:
  - Stateless session (no HTTP session)
  - Disable CSRF
  - Permit all: `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/forgot-password`, `/api/auth/reset-password`, `/api/auth/verify-email`, `/api/auth/invite/accept`, `/actuator/health`
  - Require authenticated: all other `/api/auth/**`
  - `GatewayTrustFilter` runs before Spring Security for `/api/**`
  - Custom filter on `/internal/**` checks `X-Internal-Secret` header
- [ ] Tenant isolation helper: `TenantContext.java` — `setTenant(UUID)` + `getTenant()` using `ThreadLocal`; called at start of every service method; sets `SET LOCAL app.current_tenant_id = ?` for PostgreSQL RLS
- [ ] **Test:** Unauthenticated request to `/api/auth/me` → 401. `/internal/auth/verify-token` without secret → 403. Internal endpoint with correct secret → 200.

---

## AUTH-9: Tests

- [ ] `AuthServiceTest.java` — unit tests with Mockito for register/login/refresh/logout, all edge cases
- [ ] `JwtServiceTest.java` — generate/validate/expired/tampered, RS256 signature verification
- [ ] `InviteServiceTest.java` — invite + accept flow, expired invite token
- [ ] `AuthIntegrationTest.java` — `@SpringBootTest` + Testcontainers (PostgreSQL + Redis + RabbitMQ):
  - Full lifecycle: register → login → use token → refresh → logout → verify revoked
  - Duplicate email → 409
  - Wrong password → 401
  - Rate limit (10 logins/15min) — mock Redis rate limiter
- [ ] Coverage gate: **≥ 80% line coverage** via JaCoCo
