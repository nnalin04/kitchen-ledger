# EPIC-01: Authentication & Multi-Tenancy — Deep Test Specification

> **Scope:** Tenant registration, login, JWT lifecycle, RBAC enforcement, multi-tenant data isolation, session management, security hardening.
> **Services:** Gateway (:8080), Auth Service (:8081), PostgreSQL (tenants, users, refresh_tokens, auth_audit_logs)
> **Base URL:** `http://localhost:8080`
> **Reference:** OWASP Testing Guide v4.2 — Authentication, Authorization sections

---

## Table of Contents

1. [Tenant Registration](#1-tenant-registration)
2. [Login & Credential Validation](#2-login--credential-validation)
3. [JWT Token Validation](#3-jwt-token-validation)
4. [Token Refresh & Rotation](#4-token-refresh--rotation)
5. [RBAC — Permission Matrix](#5-rbac--permission-matrix)
6. [User Management & Invitations](#6-user-management--invitations)
7. [Multi-Tenant Data Isolation](#7-multi-tenant-data-isolation)
8. [Brute Force & Rate Limiting](#8-brute-force--rate-limiting)
9. [Security Headers & Error Safety](#9-security-headers--error-safety)
10. [Session Concurrency](#10-session-concurrency)
11. [Audit Logging for Auth Events](#11-audit-logging-for-auth-events)

---

## Test Data Setup

```
TENANT_A_ID       = <uuid set after TC-AUTH-01>
OWNER_TOKEN       = <jwt set after TC-AUTH-02>
MANAGER_TOKEN     = <jwt set after TC-AUTH-10>
STAFF_TOKEN       = <jwt set after TC-AUTH-11>
TENANT_B_ID       = <uuid set after TC-AUTH-50>
TENANT_B_TOKEN    = <jwt set after TC-AUTH-50>
```

---

## 1. Tenant Registration

### TC-AUTH-01 — Happy Path: Full Tenant Registration

**What it tests:** Complete new restaurant onboarding creates tenant + owner user + RLS policies

**Request:**
```http
POST /api/auth/register
Content-Type: application/json

{
  "restaurantName": "Dosa Palace",
  "ownerName": "Priya Sharma",
  "email": "priya@dosapalace.com",
  "password": "TestPass@123",
  "phone": "+91-9876543210",
  "region": "IN",
  "timezone": "Asia/Kolkata",
  "currency": "INR",
  "restaurantType": "full-service"
}
```

**Expected Response: `HTTP 201`**
```json
{
  "tenantId": "<uuid-v4>",
  "userId": "<uuid-v4>",
  "accessToken": "<jwt>",
  "refreshToken": "<uuid>",
  "expiresIn": 3600,
  "restaurant": {
    "name": "Dosa Palace",
    "region": "IN",
    "currency": "INR",
    "timezone": "Asia/Kolkata",
    "subscriptionTier": "starter"
  }
}
```

**Database Verification:**
```sql
-- Tenant created
SELECT id, restaurant_name, region, currency, timezone, subscription_tier, deleted_at
FROM tenants WHERE restaurant_name = 'Dosa Palace';
-- Expect: 1 row, deleted_at IS NULL, subscription_tier = 'starter'

-- Owner user created with correct role
SELECT id, email, role, tenant_id, status
FROM users WHERE email = 'priya@dosapalace.com';
-- Expect: role = 'OWNER', status = 'ACTIVE'

-- Refresh token stored
SELECT id, user_id, expires_at, revoked_at
FROM refresh_tokens WHERE user_id = '<userId>';
-- Expect: 1 row, expires_at > NOW(), revoked_at IS NULL

-- RLS enabled on all tenant tables
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('inventory_items','expenses','employees','shifts','tasks','waste_logs','daily_sales_reports');
-- Expect: ALL rows have rowsecurity = true
```

**JWT Decode Verification:**
```json
{
  "sub": "<userId>",
  "tenantId": "<TENANT_A_ID>",
  "role": "OWNER",
  "iat": <now>,
  "exp": <now + 3600>
}
```

---

### TC-AUTH-02 — Duplicate Email Registration

**What it tests:** Same email cannot register twice

**Precondition:** TC-AUTH-01 completed

**Request:**
```http
POST /api/auth/register
Content-Type: application/json

{
  "restaurantName": "Another Palace",
  "email": "priya@dosapalace.com",
  "password": "TestPass@123"
}
```

**Expected Response: `HTTP 409`**
```json
{
  "error": "EMAIL_ALREADY_REGISTERED",
  "message": "An account with this email already exists"
}
```

**Must NOT contain:** tenant_id, userId, stack trace, SQL error text

---

### TC-AUTH-03 — Weak Password: Too Short

```http
POST /api/auth/register

{
  "restaurantName": "Test Restaurant",
  "email": "new@test.com",
  "password": "abc"
}
```

**Expected Response: `HTTP 400`**
```json
{
  "error": "VALIDATION_ERROR",
  "fields": [
    { "field": "password", "message": "Password must be at least 8 characters" }
  ]
}
```

---

### TC-AUTH-04 — Weak Password: No Special Character

```http
{ "password": "TestPass123" }
```

**Expected: `HTTP 400`** — message about special character requirement

---

### TC-AUTH-05 — Weak Password: No Number

```http
{ "password": "TestPass@@@" }
```

**Expected: `HTTP 400`** — message about numeric digit requirement

---

### TC-AUTH-06 — Missing Required Fields (Each Independently)

Test each field missing separately:

| Missing Field | Expected Error Field |
|---|---|
| `restaurantName` | `"restaurantName"` |
| `email` | `"email"` |
| `password` | `"password"` |
| `ownerName` | `"ownerName"` |

Each: **`HTTP 400`** with `VALIDATION_ERROR` and specific field in `fields[]`

---

### TC-AUTH-07 — Invalid Email Format

```http
{ "email": "not-an-email" }
{ "email": "missing@" }
{ "email": "@nodomain.com" }
{ "email": "spaces in@email.com" }
```

**Expected:** `HTTP 400` for each, `"field": "email"`

---

### TC-AUTH-08 — SQL Injection in Restaurant Name

```http
{
  "restaurantName": "'; DROP TABLE tenants; --",
  "email": "inject@test.com",
  "password": "TestPass@123"
}
```

**Expected: `HTTP 201`** — Registration succeeds, payload stored safely as literal string

**Database Verification:**
```sql
SELECT restaurant_name FROM tenants WHERE email_domain = 'test.com';
-- Expect: restaurant_name = "'; DROP TABLE tenants; --" (literal, not executed)
-- tenants table still exists and has all rows intact
```

---

### TC-AUTH-09 — XSS Payload in Restaurant Name

```http
{
  "restaurantName": "<script>alert('xss')</script>",
  "email": "xss@test.com",
  "password": "TestPass@123"
}
```

**Expected: `HTTP 201`** — Stored as literal

**Verification:** GET /api/auth/me returns `"restaurantName": "&lt;script&gt;alert('xss')&lt;/script&gt;"` (HTML-encoded) or the raw string if client-side escaping is used. Must never execute.

---

### TC-AUTH-10 — Very Long Input Strings

```http
{
  "restaurantName": "A".repeat(300),
  "email": "verylongemail...@domain.com",
  "password": "TestPass@123"
}
```

**Expected:** `HTTP 400` — max length validation enforced (e.g., name ≤ 255 chars)

---

## 2. Login & Credential Validation

### TC-AUTH-11 — Happy Path: Owner Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "priya@dosapalace.com",
  "password": "TestPass@123"
}
```

**Expected Response: `HTTP 200`**
```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<uuid>",
  "expiresIn": 3600,
  "user": {
    "id": "<uuid>",
    "email": "priya@dosapalace.com",
    "name": "Priya Sharma",
    "role": "OWNER",
    "tenantId": "<TENANT_A_ID>"
  }
}
```

**Save:** `OWNER_TOKEN`

---

### TC-AUTH-12 — Wrong Password

```http
POST /api/auth/login

{
  "email": "priya@dosapalace.com",
  "password": "WrongPass@999"
}
```

**Expected Response: `HTTP 401`**
```json
{
  "error": "INVALID_CREDENTIALS",
  "message": "Email or password is incorrect"
}
```

**Must NOT reveal:** whether email exists, internal error details

---

### TC-AUTH-13 — Non-Existent Email

```http
{
  "email": "nobody@nowhere.com",
  "password": "TestPass@123"
}
```

**Expected: `HTTP 401`** — SAME error message as wrong password (prevent email enumeration)
```json
{ "error": "INVALID_CREDENTIALS", "message": "Email or password is incorrect" }
```

**Timing check:** Response time for non-existent email should be within ±20% of response time for wrong password (prevent timing-based enumeration)

---

### TC-AUTH-14 — Case Sensitivity in Email

```http
{ "email": "PRIYA@DOSAPALACE.COM", "password": "TestPass@123" }
{ "email": "Priya@DosaPalace.Com", "password": "TestPass@123" }
```

**Expected: `HTTP 200`** — Email lookup is case-insensitive

---

### TC-AUTH-15 — Empty Credentials

```http
{ "email": "", "password": "" }
```

**Expected: `HTTP 400`** — validation error, not 401

---

### TC-AUTH-16 — Manager Login (After Invite + Setup)

**Precondition:** Manager invited via TC-AUTH-30, account activated

```http
POST /api/auth/login

{
  "email": "ravi@dosapalace.com",
  "password": "ManagerPass@123"
}
```

**Expected: `HTTP 200`** with `"role": "MANAGER"` in JWT

**Save:** `MANAGER_TOKEN`

---

### TC-AUTH-17 — Kitchen Staff Login

```http
POST /api/auth/login

{
  "email": "anita@dosapalace.com",
  "password": "StaffPass@123"
}
```

**Expected: `HTTP 200`** with `"role": "KITCHEN_STAFF"` in JWT

**Save:** `STAFF_TOKEN`

---

### TC-AUTH-18 — Deactivated User Cannot Login

**Precondition:** Deactivate Anita via TC-AUTH-37

```http
POST /api/auth/login

{
  "email": "anita@dosapalace.com",
  "password": "StaffPass@123"
}
```

**Expected: `HTTP 401`**
```json
{ "error": "ACCOUNT_DISABLED", "message": "This account has been deactivated" }
```

---

## 3. JWT Token Validation

### TC-AUTH-20 — Valid Token Accepted

```http
GET /api/inventory/items
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 200`** — normal response

---

### TC-AUTH-21 — Expired Token Rejected

**Setup:** Use a token with `exp` in the past (either wait for real expiry or use a pre-built expired JWT)

```http
GET /api/inventory/items
Authorization: Bearer eyJhbGciOiJSUzI1NiJ9.<expired_payload>.<sig>
```

**Expected: `HTTP 401`**
```json
{ "error": "TOKEN_EXPIRED", "message": "Access token has expired" }
```

---

### TC-AUTH-22 — Tampered Token Payload

Take a valid JWT, base64-decode the payload, change `"role": "OWNER"` to `"role": "ADMIN"`, re-encode — original signature no longer matches.

```http
GET /api/inventory/items
Authorization: Bearer <tampered_token>
```

**Expected: `HTTP 401`**
```json
{ "error": "INVALID_TOKEN", "message": "Token signature verification failed" }
```

---

### TC-AUTH-23 — Token Signed With Wrong Key

Use a JWT signed with a different RSA private key.

**Expected: `HTTP 401`** — signature verification fails

---

### TC-AUTH-24 — Missing Authorization Header

```http
GET /api/inventory/items
```

**Expected: `HTTP 401`**
```json
{ "error": "UNAUTHORIZED", "message": "Authentication required" }
```

---

### TC-AUTH-25 — Wrong Auth Scheme (Basic Instead of Bearer)

```http
GET /api/inventory/items
Authorization: Basic dXNlcjpwYXNz
```

**Expected: `HTTP 401`** — scheme mismatch

---

### TC-AUTH-26 — Token Missing tenantId Claim

Create a JWT with valid signature but no `tenantId` claim.

**Expected: `HTTP 401`** — Gateway rejects tokens without required claims

---

### TC-AUTH-27 — Token With Future iat (Issued At)

JWT with `iat` 1 hour in the future.

**Expected: `HTTP 401`** — clock skew protection (or accept with warning, document behavior)

---

### TC-AUTH-28 — Algorithm Confusion Attack (none algorithm)

JWT with header `{"alg": "none"}` and no signature.

```
eyJhbGciOiJub25lIn0.<payload>.
```

**Expected: `HTTP 401`** — "none" algorithm MUST be rejected

---

### TC-AUTH-29 — RS256 Token Sent to HS256 Endpoint (Algorithm Confusion)

Forge JWT by using the RSA public key as HMAC secret.

**Expected: `HTTP 401`** — algorithm pinned to RS256 only

---

## 4. Token Refresh & Rotation

### TC-AUTH-31 — Valid Refresh Returns New Token Pair

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<valid_refresh_token_from_login>"
}
```

**Expected: `HTTP 200`**
```json
{
  "accessToken": "<new_jwt>",
  "refreshToken": "<new_uuid>",
  "expiresIn": 3600
}
```

**Database Verification:**
```sql
-- Old refresh token is now revoked
SELECT revoked_at FROM refresh_tokens WHERE token = '<old_refresh_token>';
-- Expect: revoked_at IS NOT NULL

-- New refresh token exists and is active
SELECT id, expires_at, revoked_at FROM refresh_tokens WHERE token = '<new_refresh_token>';
-- Expect: revoked_at IS NULL, expires_at > NOW()
```

---

### TC-AUTH-32 — Replay Attack: Re-Use of Already-Used Refresh Token

```http
POST /api/auth/refresh

{ "refreshToken": "<already_used_refresh_token>" }
```

**Expected: `HTTP 401`**
```json
{ "error": "REFRESH_TOKEN_REVOKED", "message": "This refresh token has already been used" }
```

**Security note:** Some implementations revoke the entire token family on replay (detect token theft).

---

### TC-AUTH-33 — Expired Refresh Token

Use a refresh token past its expiry date.

**Expected: `HTTP 401`**
```json
{ "error": "REFRESH_TOKEN_EXPIRED", "message": "Please log in again" }
```

---

### TC-AUTH-34 — Refresh Token Belonging to Different Tenant

Take Tenant B's refresh token, try to use it with Tenant A's context.

**Expected: `HTTP 401`** — tenant mismatch

---

### TC-AUTH-35 — Malformed Refresh Token

```http
POST /api/auth/refresh

{ "refreshToken": "not-a-uuid-at-all" }
```

**Expected: `HTTP 400`** — validation error

---

### TC-AUTH-36 — Logout Invalidates Refresh Token

```http
POST /api/auth/logout
Authorization: Bearer <OWNER_TOKEN>

{ "refreshToken": "<active_refresh_token>" }
```

**Expected: `HTTP 200`**

**Then attempt refresh:**
```http
POST /api/auth/refresh

{ "refreshToken": "<now_revoked_refresh_token>" }
```

**Expected: `HTTP 401`** — revoked on logout

---

## 5. RBAC — Permission Matrix

### TC-AUTH-40 — Full RBAC Matrix

For each endpoint, test every role. Format: `[Role] → [Expected Status]`

#### Inventory Endpoints

**GET /api/inventory/items**
- Owner → `200`
- Manager → `200`
- Kitchen Staff → `200`
- Unauthenticated → `401`

**POST /api/inventory/items**
- Owner → `201`
- Manager → `201`
- Kitchen Staff → `403`
- Unauthenticated → `401`

**DELETE /api/inventory/items/:id**
- Owner → `200`
- Manager → `403`
- Kitchen Staff → `403`
- Unauthenticated → `401`

**POST /api/inventory/waste-logs**
- Owner → `201`
- Manager → `201`
- Kitchen Staff → `201`
- Unauthenticated → `401`

**DELETE /api/inventory/waste-logs/:id**
- Owner → `200`
- Manager → `200`
- Kitchen Staff → `403`
- Unauthenticated → `401`

#### Finance Endpoints

**GET /api/finance/reports/pnl**
- Owner → `200`
- Manager → `403`
- Kitchen Staff → `403`
- Unauthenticated → `401`

**POST /api/finance/daily-sales-reports**
- Owner → `201`
- Manager → `201`
- Kitchen Staff → `403`
- Unauthenticated → `401`

**GET /api/finance/dashboard**
- Owner → `200`
- Manager → `200` (limited fields)
- Kitchen Staff → `403`

**GET /api/finance/expenses**
- Owner → `200`
- Manager → `200`
- Kitchen Staff → `403`

#### Staff Endpoints

**POST /api/staff/shifts/batch** (schedule creation)
- Owner → `201`
- Manager → `201`
- Kitchen Staff → `403`

**GET /api/staff/shifts/my-schedule**
- Owner → `200`
- Manager → `200`
- Kitchen Staff → `200`
- Unauthenticated → `401`

**GET /api/staff/employees** (all employees)
- Owner → `200` (all employees)
- Manager → `200` (their team)
- Kitchen Staff → `403`

**GET /api/staff/employees/:ownId** (own profile)
- Kitchen Staff accessing own ID → `200`
- Kitchen Staff accessing another employee's ID → `403`

**POST /api/staff/tasks** (task creation)
- Owner → `201`
- Manager → `201`
- Kitchen Staff → `403`

**POST /api/staff/tasks/:id/complete** (task completion)
- Kitchen Staff completing assigned task → `200`
- Kitchen Staff completing UNASSIGNED task → `403`

#### System Endpoints

**GET /api/audit-logs**
- Owner → `200`
- Manager → `403` or `200` with limited scope
- Kitchen Staff → `403`

**GET /api/auth/users** (all users in tenant)
- Owner → `200`
- Manager → `403`
- Kitchen Staff → `403`

### TC-AUTH-41 — 403 Response Does Not Leak Resource Details

```http
GET /api/finance/reports/pnl
Authorization: Bearer <STAFF_TOKEN>
```

**Expected: `HTTP 403`**
```json
{
  "error": "FORBIDDEN",
  "message": "Insufficient permissions for this resource"
}
```

**Must NOT contain:** the actual P&L data, field names, table names

---

## 6. User Management & Invitations

### TC-AUTH-30 — Owner Invites Manager

```http
POST /api/auth/users/invite
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "email": "ravi@dosapalace.com",
  "role": "MANAGER",
  "name": "Ravi Kumar"
}
```

**Expected: `HTTP 201`**
```json
{
  "userId": "<uuid>",
  "email": "ravi@dosapalace.com",
  "role": "MANAGER",
  "inviteStatus": "SENT",
  "inviteExpiresAt": "<48 hours from now>"
}
```

**Database:**
```sql
SELECT role, status, invited_by FROM users WHERE email = 'ravi@dosapalace.com';
-- status = 'INVITED', role = 'MANAGER'
```

---

### TC-AUTH-38 — Manager Cannot Invite Owner

```http
POST /api/auth/users/invite
Authorization: Bearer <MANAGER_TOKEN>

{
  "email": "newowner@test.com",
  "role": "OWNER"
}
```

**Expected: `HTTP 403`** — Cannot invite a role higher than or equal to own role

---

### TC-AUTH-39 — Duplicate Invite to Same Email

```http
POST /api/auth/users/invite
Authorization: Bearer <OWNER_TOKEN>

{
  "email": "ravi@dosapalace.com",
  "role": "MANAGER"
}
```

**Expected: `HTTP 409`** — User already invited or registered

---

### TC-AUTH-45 — Owner Changes User Role

```http
PATCH /api/auth/users/<raviId>/role
Authorization: Bearer <OWNER_TOKEN>

{
  "role": "KITCHEN_STAFF"
}
```

**Expected: `HTTP 200`**

**Verification:** Ravi's existing JWT should now be rejected or reflect new role (depends on implementation — document behavior)

---

### TC-AUTH-46 — Owner Deactivates a User

```http
PATCH /api/auth/users/<anitaId>/status
Authorization: Bearer <OWNER_TOKEN>

{
  "status": "INACTIVE"
}
```

**Expected: `HTTP 200`**

**Verification:** Anita's JWT rejected on next request (TC-AUTH-18)

**Database:**
```sql
SELECT status FROM users WHERE id = '<anitaId>';
-- status = 'INACTIVE'
```

---

### TC-AUTH-47 — Kitchen Staff Cannot Change Own Role

```http
PATCH /api/auth/users/<anitaId>/role
Authorization: Bearer <STAFF_TOKEN>

{
  "role": "OWNER"
}
```

**Expected: `HTTP 403`**

---

## 7. Multi-Tenant Data Isolation

### TC-AUTH-50 — Setup Second Tenant

```http
POST /api/auth/register

{
  "restaurantName": "Biryani Hub",
  "email": "owner@biryanihub.com",
  "password": "TestPass@123",
  "region": "IN"
}
```

**Save:** `TENANT_B_ID`, `TENANT_B_TOKEN`

**Create item in Tenant B:**
```http
POST /api/inventory/items
Authorization: Bearer <TENANT_B_TOKEN>

{ "name": "Basmati Rice", "category": "Dry Goods", "currentStock": 50, "purchaseUnit": "kg" }
```

**Save:** `ITEM_ID_RICE_B`

---

### TC-AUTH-51 — Tenant A Cannot List Tenant B's Items

```http
GET /api/inventory/items
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 200`** — response contains ONLY Dosa Palace items; `Basmati Rice` is absent

---

### TC-AUTH-52 — Tenant A Cannot Fetch Tenant B's Item by ID

```http
GET /api/inventory/items/<ITEM_ID_RICE_B>
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 404`** — not `403` (do not reveal existence of cross-tenant resources)

---

### TC-AUTH-53 — X-Tenant-Id Header Override Attempt

```http
GET /api/inventory/items
Authorization: Bearer <OWNER_TOKEN>
X-Tenant-Id: <TENANT_B_ID>
```

**Expected: `HTTP 200`** — returns ONLY Tenant A's items; Gateway uses tenantId from JWT claim, not request header

---

### TC-AUTH-54 — Audit Logs Are Tenant-Scoped

```http
GET /api/audit-logs
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** Only Dosa Palace's audit logs. No Biryani Hub events.

---

### TC-AUTH-55 — Database-Level RLS Test

```sql
-- Simulate Tenant A session
SET app.current_tenant_id = '<TENANT_A_ID>';
SELECT COUNT(*) FROM inventory_items;
-- Returns: count of Dosa Palace items only

-- Simulate Tenant B session
SET app.current_tenant_id = '<TENANT_B_ID>';
SELECT COUNT(*) FROM inventory_items;
-- Returns: count of Biryani Hub items only

-- Try to query without setting tenant (should return 0 or error)
RESET app.current_tenant_id;
SELECT COUNT(*) FROM inventory_items;
-- Expect: 0 rows (RLS blocks all access without tenant context)
```

---

## 8. Brute Force & Rate Limiting

### TC-AUTH-60 — Account Lockout After Failed Attempts

```bash
# Fire 5 wrong-password login attempts
for i in {1..5}; do
  curl -s -X POST http://localhost:8080/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"priya@dosapalace.com","password":"WrongPass"}'
done
```

**Expected:** After 5 failures (or configurable threshold), account temporarily locked:
```json
{ "error": "ACCOUNT_LOCKED", "message": "Too many failed attempts. Try again in 15 minutes." }
```

**Verification:** Correct password also rejected during lockout window

---

### TC-AUTH-61 — Rate Limiting on Login Endpoint

```bash
for i in {1..30}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:8080/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"TestPass@123"}'
done
```

**Expected:** After threshold (~10/min per IP), returns `HTTP 429`
```json
{
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests",
  "retryAfter": 60
}
```

**Header check:** `Retry-After: 60` present in response headers

---

### TC-AUTH-62 — Rate Limiting on Register Endpoint

```bash
for i in {1..15}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:8080/api/auth/register \
    -d "{\"email\":\"test${i}@test.com\",\"restaurantName\":\"R${i}\",\"password\":\"TestPass@123\"}"
done
```

**Expected:** Rate limited after threshold

---

### TC-AUTH-63 — Rate Limit Resets After Window

After TC-AUTH-60 lockout window expires (15 min or mock expiry):

```http
POST /api/auth/login

{
  "email": "priya@dosapalace.com",
  "password": "TestPass@123"
}
```

**Expected: `HTTP 200`** — login succeeds after lockout expires

---

## 9. Security Headers & Error Safety

### TC-AUTH-70 — Security Response Headers

```bash
curl -I http://localhost:8080/api/auth/login -X POST
```

**Expected headers present:**
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Content-Security-Policy: default-src 'self'` (or equivalent)
- `Cache-Control: no-store` on auth endpoints

---

### TC-AUTH-71 — 500 Error Does Not Leak Internal Details

**Setup:** Trigger an internal error (e.g., malformed JSON body that passes initial validation but fails processing)

```http
POST /api/auth/login
Content-Type: application/json

{ "email": null, "password": true }
```

**Expected: `HTTP 400` or `HTTP 500`**

**Response MUST NOT contain:**
- `java.lang.NullPointerException`
- `org.springframework`
- `at com.kitchenledger`
- Database connection strings
- Stack traces
- Port numbers of internal services (8081, 8082, etc.)

**Expected safe response:**
```json
{ "error": "BAD_REQUEST", "message": "Invalid request format" }
```

---

### TC-AUTH-72 — CORS Configuration

```bash
curl -H "Origin: http://evil.com" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS http://localhost:8080/api/auth/login
```

**Expected:** `Access-Control-Allow-Origin` does NOT include `http://evil.com` unless it's in the allowlist

---

### TC-AUTH-73 — Actuator Endpoints Not Public

```http
GET http://localhost:8081/actuator/env
GET http://localhost:8081/actuator/beans
GET http://localhost:8081/actuator/threaddump
```

**Expected: `HTTP 401`** or `HTTP 404` — sensitive actuator endpoints not exposed without auth

```http
GET http://localhost:8081/actuator/health
```

**Expected: `HTTP 200`** — health endpoint is public (used by Docker healthcheck)

---

## 10. Session Concurrency

### TC-AUTH-80 — Concurrent Login From Two Devices

**Device 1:**
```http
POST /api/auth/login → TOKEN_1, REFRESH_1
```

**Device 2 (same user):**
```http
POST /api/auth/login → TOKEN_2, REFRESH_2
```

Both tokens should work simultaneously:
```http
GET /api/inventory/items
Authorization: Bearer <TOKEN_1>
```
→ `HTTP 200`

```http
GET /api/inventory/items
Authorization: Bearer <TOKEN_2>
```
→ `HTTP 200`

---

### TC-AUTH-81 — Logout From One Device Does Not Affect Other

Logout Device 1 (revokes REFRESH_1):
```http
POST /api/auth/logout
Authorization: Bearer <TOKEN_1>
{ "refreshToken": "<REFRESH_1>" }
```

Device 2's access token still valid (short-lived JWTs are stateless):
```http
GET /api/inventory/items
Authorization: Bearer <TOKEN_2>
```
→ `HTTP 200` (until TOKEN_2 naturally expires)

---

## 11. Audit Logging for Auth Events

### TC-AUTH-90 — Login Success Creates Audit Log

After TC-AUTH-11:
```sql
SELECT event_type, user_id, ip_address, timestamp
FROM auth_audit_logs
WHERE event_type = 'LOGIN_SUCCESS' AND user_id = '<priyaUserId>'
ORDER BY timestamp DESC LIMIT 1;
-- Expect: 1 row, ip_address NOT NULL, timestamp recent
```

---

### TC-AUTH-91 — Login Failure Creates Audit Log

After TC-AUTH-12:
```sql
SELECT event_type, email_attempted, ip_address
FROM auth_audit_logs
WHERE event_type = 'LOGIN_FAILURE'
ORDER BY timestamp DESC LIMIT 1;
-- Expect: email_attempted = 'priya@dosapalace.com', ip_address NOT NULL
```

---

### TC-AUTH-92 — Role Change Audited

After TC-AUTH-45:
```sql
SELECT event_type, old_value, new_value, performed_by
FROM auth_audit_logs
WHERE event_type = 'ROLE_CHANGED' AND entity_id = '<raviUserId>';
-- old_value = 'MANAGER', new_value = 'KITCHEN_STAFF', performed_by = '<priyaUserId>'
```

---

### TC-AUTH-93 — Account Deactivation Audited

After TC-AUTH-46:
```sql
SELECT event_type, entity_id, performed_by
FROM auth_audit_logs
WHERE event_type = 'USER_DEACTIVATED' AND entity_id = '<anitaUserId>';
-- Expect: 1 row, performed_by = '<priyaUserId>'
```

---

## Quick Reference — GO/NO-GO for Auth Epic

| Test | Category | Required for GO |
|---|---|---|
| TC-AUTH-01 | Registration | MANDATORY |
| TC-AUTH-02 | Duplicate email | MANDATORY |
| TC-AUTH-11 | Login happy path | MANDATORY |
| TC-AUTH-13 | Email enumeration prevention | MANDATORY |
| TC-AUTH-21 | Expired token rejected | MANDATORY |
| TC-AUTH-22 | Tampered token rejected | MANDATORY |
| TC-AUTH-28 | `alg:none` rejected | MANDATORY |
| TC-AUTH-31 | Refresh rotation | MANDATORY |
| TC-AUTH-32 | Replay attack blocked | MANDATORY |
| TC-AUTH-40 | Full RBAC matrix | MANDATORY |
| TC-AUTH-51 | Cross-tenant item isolation | MANDATORY |
| TC-AUTH-55 | Database RLS | MANDATORY |
| TC-AUTH-60 | Brute force lockout | MANDATORY |
| TC-AUTH-71 | No stack traces in errors | MANDATORY |
| TC-AUTH-72 | CORS misconfiguration | MANDATORY |
