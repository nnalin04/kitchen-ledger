# EPIC: INFRA — Infrastructure & Project Scaffolding

**Phase:** 0 | **Weeks:** 1–2
**Goal:** All 9 services start up, connect to Postgres + Redis + RabbitMQ, and pass health checks.
**Depends on:** Nothing — this is the foundation.
**Blocks:** Everything else.

---

## INFRA-1: Monorepo & Turborepo Setup

- [ ] Initialize git repo and root `package.json` with Turborepo workspace config
- [ ] Create top-level workspace directories: `services/`, `apps/`, `packages/`, `infrastructure/`, `docs/`
- [ ] Add `turbo.json` pipeline with `build`, `dev`, `test`, `lint` tasks and correct dependency order
- [ ] Add root scripts: `infra:up`, `dev`, `test`, `health`
- [ ] Create `.env.example` with all required env vars:
  - `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`
  - `INTERNAL_SERVICE_SECRET`
  - `OPENAI_API_KEY`, `GOOGLE_CLOUD_CREDENTIALS`, `MINDEE_API_KEY`
  - `RESEND_API_KEY`, `EXPO_ACCESS_TOKEN`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_STORAGE_URL`
- [ ] Add `.gitignore` covering `.env`, `target/`, `__pycache__/`, `node_modules/`, `.next/`
- [ ] **Test:** `npm run infra:up` starts postgres + redis + rabbitmq cleanly

---

## INFRA-2: Docker Compose — Full Local Stack

- [ ] Write `infrastructure/docker-compose.yml` with all services:
  - `postgres:16-alpine` on port 5432 with `pg_isready` healthcheck
  - `redis:7-alpine` on port 6379 with `redis-cli ping` healthcheck
  - `rabbitmq:3.13-management-alpine` on ports 5672 + 15672 with `rabbitmq-diagnostics ping` healthcheck
  - All 9 application services with correct ports (8080–8088), env vars, `depends_on`
- [ ] Write `infrastructure/docker-compose.dev.yml` for dev overrides (volume mounts for hot reload)
- [ ] Write `infrastructure/rabbitmq/setup.sh`:
  - Declare `kitchenledger.events` topic exchange (durable: true)
  - Declare 5 consumer queues: `notification-service`, `finance-service`, `inventory-service`, `report-service`, `staff-service`
  - Add all queue-to-exchange bindings (see TRD §2.16 for full routing key list)
- [ ] **Test:** `docker compose up -d postgres redis rabbitmq` — all show `healthy`
- [ ] **Test:** RabbitMQ management UI accessible at `localhost:15672`

---

## INFRA-3: Java Service Skeletons (Auth, Inventory, Finance, Staff)

**Apply the same steps to each of the 4 Java services.**

- [ ] Create `pom.xml` with Spring Boot 4.0.5 parent, Java 21, all deps from TRD §1.13:
  - `spring-boot-starter-webmvc`, `spring-boot-starter-data-jpa`, `postgresql`
  - `flyway-core`, `flyway-database-postgresql`
  - `spring-boot-starter-security`, `spring-boot-starter-data-redis`
  - `spring-boot-starter-amqp`, `spring-boot-starter-validation`
  - `lombok`, `mapstruct 1.6.3`, `spring-boot-starter-actuator`, `spring-boot-starter-aop`
  - `spring-boot-starter-test`, `testcontainers` (PostgreSQL + RabbitMQ modules)
- [ ] Create `src/main/resources/application.yml` (port, datasource, JPA `ddl-auto: validate`, Flyway, RabbitMQ, Redis, actuator)
- [ ] Create `{Service}Application.java` main class
- [ ] Create `src/main/resources/db/migration/V0__baseline.sql` (empty — prevents Flyway startup error)
- [ ] Create `exception/` package:
  - `NotFoundException.java`
  - `ConflictException.java`
  - `ValidationException.java` (with `field` + `fieldMessage` accessors)
  - `AccessDeniedException.java`
  - `GlobalExceptionHandler.java` (@RestControllerAdvice — exact error envelope from TRD §5B)
- [ ] Create `security/RequiresRole.java` annotation (from TRD §2.17)
- [ ] Create `security/RoleCheckAspect.java` AOP aspect (reads `x-user-role` header, throws `AccessDeniedException` if not in allowed list)
- [ ] Create `security/GatewayTrustFilter.java` (trusts `X-User-Id/Tenant-Id/User-Role` headers, populates `SecurityContext`)
- [ ] Create `config/RabbitMQConfig.java` (declare `kitchenledger.events` exchange + own consumer queue + bindings specific to this service)
- [ ] Create `controller/HealthController.java` → `GET /actuator/health` returns 200
- [ ] Write `Dockerfile` (multi-stage: `maven:3.9-eclipse-temurin-21` build → `eclipse-temurin:21-jre-alpine` runtime, non-root user)
- [ ] **Test per service:** `docker compose up {service}` → `curl :{port}/actuator/health` → `{"status":"UP"}`

---

## INFRA-4: Python Service Skeletons (AI Service, Report Service)

**Apply to both `ai-service` and `report-service`.**

- [ ] Create `requirements.txt` with exact versions from TRD §1.13
- [ ] Create `app/core/config.py` — Pydantic `BaseSettings`, fail-fast on missing required vars
- [ ] Create `app/core/database.py` — async SQLAlchemy engine + session factory
- [ ] Create `app/main.py` — FastAPI app + lifespan + global exception handlers (from TRD §5B) + `GET /health`
- [ ] Initialize Alembic: `alembic.ini`, `alembic/env.py` (async-compatible), `alembic/versions/0001_baseline.py` (empty)
- [ ] Write `Dockerfile` (`python:3.12-slim`, non-root user, `CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0"]`)
- [ ] **Test:** `docker compose up ai-service` → `curl :8084/health` → `{"status":"ok"}`

---

## INFRA-5: Node.js Service Skeletons (Gateway, Notification, File)

**Apply to all 3 Node.js services, with Gateway extras noted.**

- [ ] Create `package.json` with exact versions from TRD §1.13
- [ ] Create `tsconfig.json` (strict: true, target: ES2022, moduleResolution: node)
- [ ] Create `src/config/index.ts` — typed env config, fail-fast on missing vars
- [ ] Create `src/server.ts` — Fastify setup + `setErrorHandler` (from TRD §5B) + `GET /health`
- [ ] Write `Dockerfile` (`node:22-alpine`, non-root user)

**Gateway additionally:**
- [ ] `src/middleware/auth.middleware.ts` — JWT RS256 verify + Redis revocation check (exact from TRD §2.3)
- [ ] `src/config/rate-limit.ts` — per-route rate limits from TRD §2.4
- [ ] `src/routes/proxy.ts` — register all 8 upstream proxies via `@fastify/http-proxy`
- [ ] `src/routes/health.ts` — aggregate health from all 9 service `/actuator/health` endpoints
- [ ] **Test (Gateway):** `curl :8080/health` returns all service statuses

---

## INFRA-6: RSA Key Generation & Environment Setup

- [ ] Generate RSA-2048 key pair:
  ```bash
  openssl genrsa -out private.pem 2048
  openssl rsa -in private.pem -pubout -out public.pem
  ```
- [ ] Add `JWT_PRIVATE_KEY` (Auth Service only) + `JWT_PUBLIC_KEY` (Gateway + Auth) to `.env`
- [ ] Generate `INTERNAL_SERVICE_SECRET` (random 64-char hex)
- [ ] Verify Auth Service boots without key-loading errors
- [ ] Verify Gateway can verify a token signed by Auth Service private key using the shared public key
