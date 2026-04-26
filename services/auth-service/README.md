# Auth Service

Handles every aspect of identity and access in KitchenLedger: registering new restaurants, managing user accounts, issuing and revoking tokens, controlling what each role can do, and running the invite and password-recovery flows.

---

## Core Concepts

### Tenants

A **tenant** is a single restaurant (or restaurant group). All data in KitchenLedger is fully isolated per tenant — one restaurant can never see another's data. When a restaurant owner registers, a tenant is created for their restaurant before their user account is linked to it.

### Roles

Every user belongs to one role that determines what they can do across the platform:

| Role | Typical User | What They Can Do |
|---|---|---|
| `owner` | Restaurant owner | Full access to all features and settings |
| `manager` | Floor/kitchen manager | Most operational features; cannot change owner-level settings |
| `kitchen_staff` | Chefs, prep staff | Stock adjustments, waste logging, task management |
| `server` | Waitstaff | Attendance clocking, task completion, notifications |

### Tokens

On login, users receive two tokens:
- **Access token** — short-lived, sent with every API request in the `Authorization: Bearer` header
- **Refresh token** — longer-lived, used only to get a new access token when the current one expires

The access token is verified by the gateway on every request. The auth service does not re-verify tokens on every call — the gateway handles that.

---

## API

All endpoints are prefixed with `/api/auth`.

### Registration and Login

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `POST` | `/register` | Public | Creates a new restaurant (tenant) and owner account. Returns access + refresh tokens. |
| `POST` | `/login` | Public | Authenticates a user. Returns access + refresh tokens. Logs the IP and user agent. |
| `POST` | `/refresh` | Public | Exchanges a valid refresh token for a new access token. |
| `POST` | `/logout` | Authenticated | Revokes the current token so it cannot be reused. |

### Password Management

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `POST` | `/forgot-password` | Public | Sends a password reset link to the email address if it's registered. Always returns 200 — never reveals whether the email exists. |
| `POST` | `/reset-password` | Public | Sets a new password using the token from the reset email. |
| `POST` | `/me/change-password` | Authenticated | Changes the current user's password. Requires the old password. |

### Profile

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/me` | Authenticated | Returns the current user's profile. |
| `PATCH` | `/me` | Authenticated | Updates the current user's name, phone, or other profile fields. |

### User Management (within a tenant)

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/users` | `owner`, `manager` | Lists all users in the tenant (paginated). Sortable by name. |
| `POST` | `/users/invite` | `owner` | Sends an invite email to a new user with a specific role. The user sets their password when they accept. |
| `POST` | `/users/accept-invite` | Public (invite link) | Activates the invited user's account using the invite token and their chosen password. |
| `PATCH` | `/users/:userId` | `owner` | Updates a user's role or status within the tenant. |

### Tenant Settings

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/tenant/profile` | Authenticated | Returns the restaurant's profile (name, address, etc.). |
| `PATCH` | `/tenant/profile` | `owner` | Updates the restaurant's profile. |
| `GET` | `/tenant/settings` | Authenticated | Returns the restaurant's settings (timezone, currency, etc.). |
| `PATCH` | `/tenant/settings` | `owner` | Updates restaurant settings. |
| `POST` | `/tenant/onboarding/complete` | `owner` | Marks onboarding as done after initial setup. |

---

## Getting Started

```bash
cd services/auth-service
mvn spring-boot:run
```

The service starts on port **8081**.

### Required Environment Variables

| Variable | Description |
|---|---|
| `JWT_PRIVATE_KEY` | RSA private key used to sign access tokens |
| `JWT_PUBLIC_KEY` | RSA public key (shared with the Gateway for token verification) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string (token revocation tracking) |
| `RABBITMQ_URL` | RabbitMQ connection string (publishes `auth.tenant.created` and `auth.password.reset.requested` events) |
| `INTERNAL_SERVICE_SECRET` | Shared secret for internal service-to-service calls |

---

## Events Published

The auth service publishes these events to the message broker for other services to consume:

| Event | Published When | Consumed By |
|---|---|---|
| `auth.tenant.created` | New restaurant registers | Downstream services that need to initialize per-tenant data |
| `auth.password.reset.requested` | Forgot-password is triggered | Notification service (sends the reset email) |

---

## Health Check

```bash
curl http://localhost:8081/actuator/health
```

---

## Running Tests

```bash
mvn test
```

Integration tests use Testcontainers and require Docker to be running.
