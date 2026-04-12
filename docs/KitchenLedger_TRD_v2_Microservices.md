# KitchenLedger — Technical Requirements Document v2.0
# Microservice Architecture Edition
---
Version: 2.0
Architecture: Microservices
Last Updated: 2025

---

# PART 1: SYSTEM ARCHITECTURE OVERVIEW

---

## 1.1 Philosophy

KitchenLedger is built as a collection of independently deployable services, each owning its own domain, its own database tables, and its own technology stack chosen for fit — not uniformity. No service is aware of another service's internal implementation. They communicate only through defined contracts: REST APIs for synchronous calls and message queue events for asynchronous operations.

This means:
- A bug in the AI Service cannot crash the Finance Service
- Updating the OCR model requires deploying only the AI Service
- The Finance Service can be scaled independently during month-end reporting peaks
- Each service can be tested, monitored, and versioned independently

---

## 1.2 The Nine Services

| Service | Technology | Role |
|---|---|---|
| **API Gateway** | Node.js + Fastify | Single entry point, routing, auth verification, rate limiting |
| **Auth Service** | Java + Spring Boot 4.0.5 | Tenant registration, users, JWT, RBAC, sessions |
| **Inventory Service** | Java + Spring Boot 4.0.5 | Items, suppliers, POs, stock movements, recipes |
| **Finance Service** | Java + Spring Boot 4.0.5 | DSR, expenses, AP, P&L, vendors, accounts |
| **Staff Service** | Java + Spring Boot 4.0.5 | Scheduling, attendance, tasks, tip pooling, HR, certifications |
| **AI Service** | Python + FastAPI | OCR, voice, NL queries, forecasting, anomaly detection |
| **Notification Service** | Node.js + Fastify | Push, email, WhatsApp dispatch, device tokens |
| **Report Service** | Python + FastAPI | Heavy aggregation, PDF/CSV export, scheduled reports |
| **File Service** | Node.js + Fastify | Upload handling, pre-signed URLs, image processing |

---

## 1.3 Frontend Applications

| App | Technology | Role |
|---|---|---|
| **Web App** | Next.js 14 (App Router) + TypeScript | Full dashboard, reports, management |
| **Mobile App** | Expo SDK 51 + React Native + TypeScript | Field operations, counting, logging |
| **Shared UI Package** | TypeScript + Tailwind + Radix UI | Shared component library |
| **Shared Types Package** | TypeScript | Generated from OpenAPI specs of all services |

---

## 1.4 Infrastructure Components

| Component | Technology | Purpose |
|---|---|---|
| **Primary Database** | PostgreSQL 16 via Supabase | All persistent data |
| **Cache + Rate Limit** | Redis 7 | Session cache, rate limiting, deduplication |
| **Message Queue** | RabbitMQ 3.13 | Async inter-service events |
| **Object Storage** | Supabase Storage (S3-compatible) | Receipts, photos, exports |
| **Search** | PostgreSQL full-text (Phase 1); Meilisearch (Phase 3) | Item and vendor search |
| **Realtime** | Supabase Realtime | Live dashboard updates |
| **Container Orchestration** | Docker Compose (dev); Kubernetes (production Phase 3) | Service lifecycle |

---

## 1.5 System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                              │
│   Next.js Web App          Expo Mobile App                  │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    API GATEWAY  :8080                       │
│                  Node.js / Fastify                          │
│   • JWT verification    • Rate limiting                     │
│   • Request routing     • CORS                              │
│   • Access logging      • Circuit breaker                   │
└──┬─────────┬──────────┬──────────┬──────────┬──────────┬───┘
   │         │          │          │          │          │
   ▼         ▼          ▼          ▼          ▼          ▼
┌──────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐ ┌───────┐
│ Auth │ │Invent.│ │Finance│ │ Staff │ │  AI   │ │ File  │
│:8081 │ │:8082  │ │:8083  │ │:8088  │ │:8084  │ │:8085  │
│ Java │ │ Java  │ │ Java  │ │ Java  │ │Python │ │Node.js│
└──┬───┘ └───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘ └───┬───┘
   │         │         │         │         │         │
   └─────────┴─────────┴─────────┴─────────┴─────────┘
                              │
                       ┌──────▼──────┐
                       │  RabbitMQ   │
                       │  :5672      │
                       │  (topic     │
                       │  exchange)  │
                       └──────┬──────┘
                              │
               ┌──────────────┴──────────────┐
               ▼                             ▼
         ┌──────────┐                 ┌──────────┐
         │Notificat.│                 │  Report  │
         │ :8086    │                 │ :8087    │
         │ Node.js  │                 │ Python   │
         └──────────┘                 └──────────┘
               │
     ┌─────────┼─────────┐
     ▼         ▼         ▼
   Expo      Email    WhatsApp
   Push     (Resend)   Link


SHARED INFRASTRUCTURE:
┌──────────────────────────────────────────────────────┐
│  PostgreSQL 16      Redis 7       Supabase Storage   │
│  (Supabase)         (Cache)       (Files/Photos)     │
│                                                       │
│  Supabase Realtime                RabbitMQ            │
│  (Live updates)                   (Message Queue)     │
└──────────────────────────────────────────────────────┘
```

---

## 1.6 Database Ownership Map

Each service owns specific tables. No service queries another service's tables directly — it calls the owning service's API.

```
Auth Service owns:
  tenants, users, refresh_tokens, auth_tokens, auth_audit_logs

Inventory Service owns:
  inventory_categories, inventory_items, inventory_item_suppliers,
  suppliers, purchase_orders, purchase_order_items,
  stock_receipts, stock_receipt_items, inventory_movements,
  waste_logs, stock_transfers, stock_transfer_items,
  inventory_counts, inventory_count_items,
  recipes, recipe_ingredients

Finance Service owns:
  accounts, vendors, daily_sales_reports, expenses,
  vendor_payments, upi_transactions, finance_audit_logs

Staff Service owns:
  employees, shifts, tasks, task_completions, shift_feedback,
  tip_pools, tip_pool_payouts, attendance,
  performance_goals, certifications

Notification Service owns:
  notifications, device_tokens

Report Service owns:
  report_jobs
  (reads from all other services via read replica;
   report outputs stored as URLs in report_jobs.output_url)

AI Service owns:
  ai_jobs
  (no domain data — reads other services;
   OCR results stored in ai_jobs.result JSONB column)

File Service owns:
  file_uploads
  (metadata only — files live in Supabase Storage)
```

---

## 1.7 Inter-Service Communication Contracts

### Synchronous (REST)
```
API Gateway → Auth Service:         POST /internal/auth/verify-token
API Gateway → any service:          Forward authenticated request
AI Service → Inventory Service:     GET  /internal/items?names[]=...
AI Service → Finance Service:       GET  /internal/accounts
Finance Service → Inventory Service: GET /internal/items/{id}/cost
Report Service → Finance Service:   GET  /internal/reports/pl-data
Report Service → Inventory Service: GET  /internal/reports/inventory-data
```

### Asynchronous (RabbitMQ Events)

All events follow this envelope:
```json
{
  "event_id": "uuid",
  "event_type": "inventory.stock.low",
  "tenant_id": "uuid",
  "produced_by": "inventory-service",
  "produced_at": "2024-01-15T10:30:00Z",
  "version": "1.0",
  "payload": { ... }
}
```

**Event Catalog:**

| Event Type | Producer | Consumer(s) | Trigger |
|---|---|---|---|
| `auth.tenant.created` | Auth | Finance | New tenant registration completes — Finance seeds default chart of accounts |
| `auth.user.registered` | Auth | Notification, Staff | New tenant signup — welcome email + employee record seed |
| `auth.user.invited` | Auth | Notification | Staff invited |
| `inventory.stock.low` | Inventory | Notification | Stock drops below PAR |
| `inventory.stock.expiring` | Inventory | Notification | Item expiry approaching |
| `inventory.receipt.confirmed` | Inventory | AI | Receipt confirmed (OCR invoice) |
| `inventory.po.sent` | Inventory | Notification | PO sent to supplier |
| `finance.dsr.reconciled` | Finance | Report, Notification | DSR marked reconciled |
| `finance.expense.created` | Finance | AI | Expense with receipt (trigger OCR) |
| `finance.payment.overdue` | Finance | Notification | Vendor payment past due |
| `ai.ocr.completed` | AI | Finance, Inventory | OCR job complete — Finance updates expense, Inventory applies stock changes |
| `report.generated` | Report | Notification | Report ready to download |

---

## 1.8 Authentication Flow Across Services

```
1. Client → API Gateway: POST /api/auth/login
2. Gateway → Auth Service: POST /internal/auth/login
3. Auth Service: validates credentials, generates JWT
4. Auth Service → Gateway: { access_token, refresh_token }
5. Gateway → Client: { access_token, refresh_token }

For every subsequent request:
1. Client → Gateway: GET /api/inventory/items (Authorization: Bearer <token>)
2. Gateway: verifies JWT signature (using Auth Service public key)
   - If valid: extracts { user_id, tenant_id, role } from claims
   - Adds headers: X-User-Id, X-Tenant-Id, X-User-Role
   - Forwards to Inventory Service
3. Inventory Service: trusts these headers (only accepts from Gateway)
   - Sets DB session: SET LOCAL app.current_tenant_id = 'uuid'
   - Proceeds with request
```

**Important:** Internal services trust the headers set by the Gateway. They do NOT independently verify JWTs. The Gateway is the single verification point.

---

## 1.9 Shared Database Design Principles

These apply to every service's database schema:

1. **Tenant isolation** — every domain table has `tenant_id UUID NOT NULL`
2. **Row-Level Security** — enabled on every tenant-scoped table
3. **UUID primary keys** — `gen_random_uuid()` on all tables
4. **Soft deletes** — `deleted_at TIMESTAMPTZ` — never hard delete
5. **Monetary precision** — `NUMERIC(12,2)` — never FLOAT or DOUBLE
6. **Timezone awareness** — all timestamps are `TIMESTAMPTZ`
7. **Optimistic locking** — `version INT` on frequently-updated tables
8. **Audit triggers** — every write emits an event to audit_logs

---

## 1.10 Monorepo Structure

```
kitchenledger/
├── services/
│   ├── gateway/                    # Node.js + Fastify
│   │   ├── src/
│   │   │   ├── routes/             # Route definitions + proxying
│   │   │   ├── middleware/         # Auth verify, rate limit, logging
│   │   │   └── config/
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   ├── auth-service/               # Java + Spring Boot
│   │   ├── src/main/java/com/kitchenledger/auth/
│   │   │   ├── controller/
│   │   │   ├── service/
│   │   │   ├── repository/
│   │   │   ├── model/
│   │   │   ├── dto/
│   │   │   ├── config/
│   │   │   └── security/
│   │   ├── src/main/resources/
│   │   │   └── application.yml
│   │   ├── pom.xml
│   │   └── Dockerfile
│   │
│   ├── inventory-service/          # Java + Spring Boot
│   │   ├── src/main/java/com/kitchenledger/inventory/
│   │   │   ├── controller/
│   │   │   ├── service/
│   │   │   ├── repository/
│   │   │   ├── model/
│   │   │   ├── dto/
│   │   │   ├── event/              # RabbitMQ producers/consumers
│   │   │   └── config/
│   │   ├── pom.xml
│   │   └── Dockerfile
│   │
│   ├── finance-service/            # Java + Spring Boot
│   │   ├── src/main/java/com/kitchenledger/finance/
│   │   │   ├── controller/
│   │   │   ├── service/
│   │   │   ├── repository/
│   │   │   ├── model/
│   │   │   ├── dto/
│   │   │   ├── event/
│   │   │   └── config/
│   │   ├── pom.xml
│   │   └── Dockerfile
│   │
│   ├── ai-service/                 # Python + FastAPI
│   │   ├── app/
│   │   │   ├── routers/
│   │   │   ├── services/
│   │   │   ├── workers/            # Celery tasks
│   │   │   ├── schemas/            # Pydantic models
│   │   │   └── clients/            # HTTP clients to other services
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   ├── notification-service/       # Node.js + Fastify
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   ├── consumers/          # RabbitMQ event consumers
│   │   │   ├── providers/          # Expo, Resend, WhatsApp
│   │   │   └── repositories/
│   │   ├── package.json
│   │   └── Dockerfile
│   │
│   ├── report-service/             # Python + FastAPI
│   │   ├── app/
│   │   │   ├── routers/
│   │   │   ├── generators/         # Per-report generators
│   │   │   ├── workers/
│   │   │   └── schemas/
│   │   ├── requirements.txt
│   │   └── Dockerfile
│   │
│   └── file-service/               # Node.js + Fastify
│       ├── src/
│       │   ├── routes/
│       │   ├── processors/         # Image compression
│       │   └── storage/            # Supabase Storage client
│       ├── package.json
│       └── Dockerfile
│
├── apps/
│   ├── web/                        # Next.js 14
│   │   ├── app/
│   │   ├── components/
│   │   ├── lib/
│   │   └── stores/
│   └── mobile/                     # Expo SDK 51
│       ├── app/
│       ├── components/
│       └── lib/
│
├── packages/
│   ├── types/                      # Shared TypeScript types
│   ├── ui/                         # Shared React components
│   └── api-client/                 # Generated API clients
│
├── infrastructure/
│   ├── docker-compose.yml          # Full local dev stack
│   ├── docker-compose.dev.yml      # Dev overrides
│   └── nginx/                      # Local gateway config
│
└── docs/
    ├── KitchenLedger_PRD_Enhanced.md
    └── KitchenLedger_TRD_Complete_v2.md
```

---

## 1.11 Local Development Setup

```yaml
# infrastructure/docker-compose.yml

version: "3.9"

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: kitchenledger
      POSTGRES_USER: kl_user
      POSTGRES_PASSWORD: kl_password
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kl_user -d kitchenledger"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  rabbitmq:
    image: rabbitmq:3.13-management-alpine
    ports:
      - "5672:5672"    # AMQP
      - "15672:15672"  # Management UI (localhost:15672, guest/guest)
    environment:
      RABBITMQ_DEFAULT_USER: kl_rabbit
      RABBITMQ_DEFAULT_PASS: kl_rabbit_pass
    healthcheck:
      test: ["CMD", "rabbitmq-diagnostics", "ping"]

  gateway:
    build: ./services/gateway
    ports: ["8080:8080"]
    environment:
      AUTH_SERVICE_URL: http://auth-service:8081
      INVENTORY_SERVICE_URL: http://inventory-service:8082
      FINANCE_SERVICE_URL: http://finance-service:8083
      STAFF_SERVICE_URL: http://staff-service:8088
      AI_SERVICE_URL: http://ai-service:8084
      FILE_SERVICE_URL: http://file-service:8085
      NOTIFICATION_SERVICE_URL: http://notification-service:8086
      REPORT_SERVICE_URL: http://report-service:8087
      JWT_PUBLIC_KEY: ${JWT_PUBLIC_KEY}
      REDIS_URL: redis://redis:6379
      INTERNAL_SERVICE_SECRET: ${INTERNAL_SERVICE_SECRET}
    depends_on: [redis, auth-service]

  auth-service:
    build: ./services/auth-service
    ports: ["8081:8081"]
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/kitchenledger
      SPRING_DATASOURCE_USERNAME: kl_user
      SPRING_DATASOURCE_PASSWORD: kl_password
      SPRING_REDIS_HOST: redis
      JWT_PRIVATE_KEY: ${JWT_PRIVATE_KEY}
      JWT_PUBLIC_KEY: ${JWT_PUBLIC_KEY}
      RABBITMQ_HOST: rabbitmq
      RESEND_API_KEY: ${RESEND_API_KEY}
    depends_on: [postgres, redis, rabbitmq]

  inventory-service:
    build: ./services/inventory-service
    ports: ["8082:8082"]
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/kitchenledger
      SPRING_DATASOURCE_USERNAME: kl_user
      SPRING_DATASOURCE_PASSWORD: kl_password
      RABBITMQ_HOST: rabbitmq
      AUTH_SERVICE_URL: http://auth-service:8081
    depends_on: [postgres, rabbitmq]

  finance-service:
    build: ./services/finance-service
    ports: ["8083:8083"]
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/kitchenledger
      SPRING_DATASOURCE_USERNAME: kl_user
      SPRING_DATASOURCE_PASSWORD: kl_password
      RABBITMQ_HOST: rabbitmq
      INVENTORY_SERVICE_URL: http://inventory-service:8082
    depends_on: [postgres, rabbitmq]

  ai-service:
    build: ./services/ai-service
    ports: ["8084:8084"]
    environment:
      DATABASE_URL: postgresql://kl_user:kl_password@postgres:5432/kitchenledger
      REDIS_URL: redis://redis:6379
      RABBITMQ_URL: amqp://kl_rabbit:kl_rabbit_pass@rabbitmq:5672
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      GOOGLE_CLOUD_CREDENTIALS: ${GOOGLE_CLOUD_CREDENTIALS}
      MINDEE_API_KEY: ${MINDEE_API_KEY}
      INVENTORY_SERVICE_URL: http://inventory-service:8082
      FINANCE_SERVICE_URL: http://finance-service:8083
    depends_on: [postgres, redis, rabbitmq]

  ai-worker:
    build: ./services/ai-service
    command: celery -A app.workers.celery_app worker --loglevel=info
    environment: ${AI_SERVICE_ENV}
    depends_on: [redis, rabbitmq]

  staff-service:
    build: ./services/staff-service
    ports: ["8088:8088"]
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/kitchenledger
      SPRING_DATASOURCE_USERNAME: kl_user
      SPRING_DATASOURCE_PASSWORD: kl_password
      RABBITMQ_HOST: rabbitmq
      AUTH_SERVICE_URL: http://auth-service:8081
      INTERNAL_SERVICE_SECRET: ${INTERNAL_SERVICE_SECRET}
    depends_on: [postgres, rabbitmq]

  notification-service:
    build: ./services/notification-service
    ports: ["8086:8086"]
    environment:
      DATABASE_URL: postgresql://kl_user:kl_password@postgres:5432/kitchenledger
      RABBITMQ_URL: amqp://kl_rabbit:kl_rabbit_pass@rabbitmq:5672
      RESEND_API_KEY: ${RESEND_API_KEY}
      EXPO_ACCESS_TOKEN: ${EXPO_ACCESS_TOKEN}
      INTERNAL_SERVICE_SECRET: ${INTERNAL_SERVICE_SECRET}
    depends_on: [postgres, rabbitmq]

  report-service:
    build: ./services/report-service
    ports: ["8087:8087"]
    environment:
      DATABASE_URL: postgresql://kl_user:kl_password@postgres:5432/kitchenledger
      REDIS_URL: redis://redis:6379
      RABBITMQ_URL: amqp://kl_rabbit:kl_rabbit_pass@rabbitmq:5672
      FINANCE_SERVICE_URL: http://finance-service:8083
      INVENTORY_SERVICE_URL: http://inventory-service:8082
      SUPABASE_STORAGE_URL: ${SUPABASE_STORAGE_URL}
    depends_on: [postgres, redis, rabbitmq]

  file-service:
    build: ./services/file-service
    ports: ["8085:8085"]
    environment:
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_SERVICE_KEY: ${SUPABASE_SERVICE_KEY}
      SUPABASE_STORAGE_BUCKET: kitchenledger-files
      MAX_FILE_SIZE_MB: 10
    depends_on: []

volumes:
  postgres_data:
```

---

## 1.12 Port Allocation

| Service | Internal Port | Notes |
|---|---|---|
| API Gateway | 8080 | Public-facing — only this port exposed externally |
| Auth Service | 8081 | Internal only |
| Inventory Service | 8082 | Internal only |
| Finance Service | 8083 | Internal only |
| AI Service | 8084 | Internal only |
| File Service | 8085 | Internal only |
| Notification Service | 8086 | Internal only |
| Report Service | 8087 | Internal only |
| Staff Service | 8088 | Internal only |
| PostgreSQL | 5432 | Internal only |
| Redis | 6379 | Internal only |
| RabbitMQ AMQP | 5672 | Internal only |
| RabbitMQ Management | 15672 | Dev only |

---

## 1.13 Technology Versions Reference

**Java Services (Auth, Inventory, Finance, Staff):**
```xml
<!-- pom.xml parent for all Java services -->
<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>4.0.5</version>  <!-- Spring Boot 4 GA — Jakarta EE 11, Spring Framework 7 -->
</parent>

<properties>
  <java.version>21</java.version>
  <!-- No Spring Cloud BOM: Spring Cloud 2025.1 (Boot 4.x) not yet GA.
       Inter-service HTTP calls use Spring Framework 7's RestClient instead. -->
</properties>

<dependencies>
  <!-- Spring Web MVC (renamed from spring-boot-starter-web in Boot 4.0) -->
  <dependency>spring-boot-starter-webmvc</dependency>
  <!-- Spring Data JPA + Hibernate -->
  <dependency>spring-boot-starter-data-jpa</dependency>
  <!-- PostgreSQL Driver -->
  <dependency>postgresql (runtime)</dependency>
  <!-- Flyway for migrations -->
  <dependency>flyway-core</dependency>
  <dependency>flyway-database-postgresql</dependency>
  <!-- Spring Security -->
  <dependency>spring-boot-starter-security</dependency>
  <!-- Redis -->
  <dependency>spring-boot-starter-data-redis</dependency>
  <!-- RabbitMQ -->
  <dependency>spring-boot-starter-amqp</dependency>
  <!-- Validation (Jakarta Bean Validation 3.1) -->
  <dependency>spring-boot-starter-validation</dependency>
  <!-- Lombok -->
  <dependency>lombok (provided)</dependency>
  <!-- MapStruct for DTO mapping -->
  <dependency>mapstruct 1.6.3</dependency>
  <!-- RestClient (built into Spring Framework 7 via spring-boot-starter-webmvc)
       Used for inter-service HTTP calls — replaces OpenFeign -->
  <!-- Actuator for health checks -->
  <dependency>spring-boot-starter-actuator</dependency>
  <!-- AOP for @RequiresRole aspect -->
  <dependency>spring-boot-starter-aop</dependency>
  <!-- Testing -->
  <dependency>spring-boot-starter-test</dependency>
  <dependency>testcontainers (PostgreSQL + RabbitMQ)</dependency>
</dependencies>
```

**Python Services (AI, Report):**
```
fastapi==0.115.0
uvicorn[standard]==0.30.0
pydantic==2.7.0
pydantic-settings==2.3.0
sqlalchemy==2.0.30        # async, for Report Service only
asyncpg==0.29.0
alembic==1.13.2           # database migrations (same role as Flyway in Java)
celery==5.4.0
redis==5.0.4
httpx==0.27.0             # async HTTP client for inter-service calls
openai==1.35.0
google-cloud-vision==3.7.0
mindee==4.14.0
python-multipart==0.0.9
Pillow==10.3.0
reportlab==4.2.0          # PDF generation in Report Service
pandas==2.2.2             # Report Service aggregations
pytest==8.2.0
pytest-asyncio==0.23.0
```

**Node.js Services (Gateway, Notification, File):**
```json
{
  "dependencies": {
    "fastify": "^4.28.0",
    "@fastify/cors": "^9.0.0",
    "@fastify/rate-limit": "^9.1.0",
    "@fastify/http-proxy": "^9.4.0",
    "fastify-plugin": "^4.5.1",
    "amqplib": "^0.10.4",
    "ioredis": "^5.4.1",
    "pg": "^8.12.0",
    "@supabase/supabase-js": "^2.44.0",
    "jsonwebtoken": "^9.0.2",
    "expo-server-sdk": "^3.10.0",
    "resend": "^3.2.0",
    "sharp": "^0.33.4",
    "zod": "^3.23.8",
    "pino": "^9.2.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^20.0.0",
    "vitest": "^1.6.0"
  }
}
```
# KitchenLedger TRD v2 — Part 2
# Service Specs: API Gateway + Auth Service

---

# SERVICE 1: API GATEWAY
**Technology:** Node.js 22 + Fastify 4 + TypeScript

---

## 2.1 Responsibility

The Gateway is deliberately thin. It does only four things:
1. Verify JWT tokens (using Auth Service's public key)
2. Route requests to the correct upstream service
3. Enforce rate limits per tenant
4. Log every request with tenant context

It contains zero business logic. It does not touch the database directly.

---

## 2.2 Route Map

```
Public routes (no auth required):
POST   /api/auth/register          → auth-service:8081/api/auth/register
POST   /api/auth/login             → auth-service:8081/api/auth/login
POST   /api/auth/refresh           → auth-service:8081/api/auth/refresh
POST   /api/auth/forgot-password   → auth-service:8081/api/auth/forgot-password
POST   /api/auth/reset-password    → auth-service:8081/api/auth/reset-password
GET    /api/auth/verify-email      → auth-service:8081/api/auth/verify-email

Protected routes (JWT required):
ALL    /api/auth/*                 → auth-service:8081/*
ALL    /api/inventory/*            → inventory-service:8082/*
ALL    /api/finance/*              → finance-service:8083/*
ALL    /api/staff/*                → staff-service:8088/*
ALL    /api/ai/*                   → ai-service:8084/*
ALL    /api/files/*                → file-service:8085/*
ALL    /api/notifications/*        → notification-service:8086/*
ALL    /api/reports/*              → report-service:8087/*

Health:
GET    /health                     → { status: "ok", services: {...} }
GET    /health/services            → Individual service health checks
```

---

## 2.3 JWT Verification

```typescript
// services/gateway/src/middleware/auth.middleware.ts

import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config';

const PUBLIC_ROUTES = [
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
];

export interface JWTPayload {
  sub: string;          // user_id
  tenant_id: string;
  role: string;
  email: string;
  exp: number;
  iat: number;
  jti: string;
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const path = request.url.split('?')[0];

  // Skip auth for public routes
  if (PUBLIC_ROUTES.some(r => path.startsWith(r))) return;
  if (path === '/health') return;

  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({
      success: false,
      error: { code: 'MISSING_TOKEN', message: 'Authorization header required' }
    });
  }

  const token = authHeader.substring(7);
  try {
    // Verify using Auth Service's RSA public key (RS256)
    const payload = jwt.verify(token, config.JWT_PUBLIC_KEY, {
      algorithms: ['RS256']
    }) as JWTPayload;

    // Check token not revoked (Redis check — O(1))
    const isRevoked = await checkTokenRevoked(payload.jti);
    if (isRevoked) {
      return reply.code(401).send({
        success: false,
        error: { code: 'TOKEN_REVOKED', message: 'Token has been revoked' }
      });
    }

    // Inject context headers for downstream services
    request.headers['x-user-id'] = payload.sub;
    request.headers['x-tenant-id'] = payload.tenant_id;
    request.headers['x-user-role'] = payload.role;
    request.headers['x-user-email'] = payload.email;

  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return reply.code(401).send({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Access token expired' }
      });
    }
    return reply.code(401).send({
      success: false,
      error: { code: 'INVALID_TOKEN', message: 'Invalid token' }
    });
  }
}

async function checkTokenRevoked(jti: string): Promise<boolean> {
  const result = await redisClient.get(`revoked:${jti}`);
  return result !== null;
}
```

---

## 2.4 Rate Limiting

```typescript
// services/gateway/src/config/rate-limit.ts

export const RATE_LIMITS = {
  // Auth endpoints — strict
  '/api/auth/login':     { max: 10,  timeWindow: '15 minutes' },
  '/api/auth/register':  { max: 5,   timeWindow: '1 hour' },
  '/api/auth/refresh':   { max: 30,  timeWindow: '15 minutes' },

  // AI endpoints — moderate (expensive operations)
  '/api/ai/ocr':         { max: 20,  timeWindow: '1 hour' },
  '/api/ai/voice':       { max: 60,  timeWindow: '1 hour' },
  '/api/ai/query':       { max: 100, timeWindow: '1 hour' },

  // Standard API — generous
  'default':             { max: 500, timeWindow: '1 minute' },
};

// Key by tenant_id for authenticated, IP for unauthenticated
const keyGenerator = (request: FastifyRequest): string => {
  const tenantId = request.headers['x-tenant-id'];
  return tenantId ? `tenant:${tenantId}` : `ip:${request.ip}`;
};
```

---

## 2.5 Request Proxying

```typescript
// services/gateway/src/routes/proxy.ts
// Using @fastify/http-proxy

import proxy from '@fastify/http-proxy';

export async function registerProxies(app: FastifyInstance) {
  const services = {
    '/api/inventory':     process.env.INVENTORY_SERVICE_URL,
    '/api/finance':       process.env.FINANCE_SERVICE_URL,
    '/api/staff':         process.env.STAFF_SERVICE_URL,
    '/api/ai':            process.env.AI_SERVICE_URL,
    '/api/files':         process.env.FILE_SERVICE_URL,
    '/api/notifications': process.env.NOTIFICATION_SERVICE_URL,
    '/api/reports':       process.env.REPORT_SERVICE_URL,
    '/api/auth':          process.env.AUTH_SERVICE_URL,
  };

  for (const [prefix, upstream] of Object.entries(services)) {
    await app.register(proxy, {
      upstream,
      prefix,
      rewritePrefix: prefix,
      httpMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      // Circuit breaker: if upstream fails 5 times in 30s, open circuit
      undici: {
        connections: 100,
        pipelining: 10,
      },
    });
  }
}
```

---

## 2.6 Health Check Aggregation

```typescript
// GET /health
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "services": {
    "auth":         { "status": "ok",   "latency_ms": 4 },
    "inventory":    { "status": "ok",   "latency_ms": 6 },
    "finance":      { "status": "ok",   "latency_ms": 5 },
    "ai":           { "status": "ok",   "latency_ms": 12 },
    "notification": { "status": "ok",   "latency_ms": 3 },
    "report":       { "status": "ok",   "latency_ms": 8 },
    "file":         { "status": "ok",   "latency_ms": 4 }
  },
  "infrastructure": {
    "redis":    { "status": "ok" },
    "rabbitmq": { "status": "ok" }
  }
}
```

---

---

# SERVICE 2: AUTH SERVICE
**Technology:** Java 21 + Spring Boot 4.0.5 + Spring Security + Spring Data JPA + Flyway

---

## 2.7 Responsibility

Everything related to identity, access, and tenant management. This service is the **most security-critical** in the system. It uses RSA-256 JWT (asymmetric keys) — the private key lives only here; the public key is shared with the Gateway for verification.

---

## 2.8 Database Schema (Auth Service owns these tables)

```sql
-- ====================================================
-- Flyway migration: V1__auth_schema.sql
-- ====================================================

-- TENANTS
CREATE TABLE tenants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_name     VARCHAR(200) NOT NULL,
    slug                VARCHAR(100) UNIQUE NOT NULL,
    email               VARCHAR(255) UNIQUE NOT NULL,
    phone               VARCHAR(20),
    address_line1       VARCHAR(255),
    address_line2       VARCHAR(255),
    city                VARCHAR(100),
    state               VARCHAR(100),
    country             CHAR(3) NOT NULL DEFAULT 'IND',
    postal_code         VARCHAR(20),
    timezone            VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    currency            CHAR(3) NOT NULL DEFAULT 'INR',
    locale              VARCHAR(10) NOT NULL DEFAULT 'en-IN',
    subscription_tier   VARCHAR(20) NOT NULL DEFAULT 'starter'
                        CHECK (subscription_tier IN ('starter','growth','professional','enterprise')),
    subscription_status VARCHAR(20) NOT NULL DEFAULT 'trialing'
                        CHECK (subscription_status IN ('trialing','active','past_due','canceled')),
    trial_ends_at       TIMESTAMPTZ,
    settings            JSONB NOT NULL DEFAULT '{}',
    onboarding_step     INT NOT NULL DEFAULT 0,
    onboarding_done     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

-- USERS
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email               VARCHAR(255) NOT NULL,
    hashed_password     VARCHAR(255) NOT NULL,
    full_name           VARCHAR(200) NOT NULL,
    phone               VARCHAR(20),
    role                VARCHAR(20) NOT NULL DEFAULT 'kitchen_staff'
                        CHECK (role IN ('owner','manager','kitchen_staff','server')),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified         BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at       TIMESTAMPTZ,
    avatar_url          VARCHAR(500),
    pin_hash            VARCHAR(255),
    language            VARCHAR(10) NOT NULL DEFAULT 'en',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    UNIQUE (tenant_id, email)
);

-- REFRESH TOKENS
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent  VARCHAR(500),
    ip_address  INET
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;

-- VERIFICATION TOKENS (email verify, password reset, invites)
CREATE TABLE auth_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_type  VARCHAR(30) NOT NULL
                CHECK (token_type IN ('email_verify','password_reset','invite')),
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata    JSONB NOT NULL DEFAULT '{}'
    -- metadata for invite: { "role": "kitchen_staff", "inviter_id": "uuid" }
);

-- AUTH AUDIT LOG
CREATE TABLE auth_audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES tenants(id),
    user_id     UUID REFERENCES users(id),
    event_type  VARCHAR(100) NOT NULL,
    ip_address  INET,
    user_agent  VARCHAR(500),
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_auth_audit_tenant ON auth_audit_logs(tenant_id, created_at DESC);

-- RLS
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_users ON users
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
```

---

## 2.9 Spring Boot Project Structure

```
auth-service/
└── src/main/java/com/kitchenledger/auth/
    ├── AuthServiceApplication.java
    ├── config/
    │   ├── SecurityConfig.java          # Spring Security config (JWT filter)
    │   ├── JwtConfig.java               # RSA key pair loading
    │   ├── RabbitMQConfig.java          # Exchange + queue declarations
    │   └── FlywayConfig.java
    ├── security/
    │   ├── JwtService.java              # Token generation + validation
    │   ├── JwtAuthFilter.java           # Internal JWT filter (for /internal/* routes)
    │   ├── GatewayTrustFilter.java      # Trust X-User-Id headers from Gateway
    │   └── PasswordService.java         # BCrypt operations
    ├── model/
    │   ├── Tenant.java
    │   ├── User.java
    │   ├── RefreshToken.java
    │   └── AuthToken.java
    ├── repository/
    │   ├── TenantRepository.java
    │   ├── UserRepository.java
    │   ├── RefreshTokenRepository.java
    │   └── AuthTokenRepository.java
    ├── dto/
    │   ├── request/
    │   │   ├── RegisterRequest.java
    │   │   ├── LoginRequest.java
    │   │   ├── InviteUserRequest.java
    │   │   └── ResetPasswordRequest.java
    │   └── response/
    │       ├── AuthResponse.java         # { access_token, refresh_token, user, tenant }
    │       ├── UserResponse.java
    │       └── TenantResponse.java
    ├── service/
    │   ├── AuthService.java             # Core auth logic
    │   ├── TenantService.java           # Tenant CRUD + settings
    │   ├── UserService.java             # User CRUD
    │   ├── InviteService.java           # Invite flow
    │   └── AccountSeedService.java      # Default data on registration
    ├── event/
    │   └── AuthEventPublisher.java      # RabbitMQ event publishing
    └── controller/
        ├── AuthController.java          # /api/auth/*
        ├── UserController.java          # /api/auth/users/*
        ├── TenantController.java        # /api/auth/tenant/*
        └── InternalAuthController.java  # /internal/auth/* (gateway use only)
```

---

## 2.10 JWT Implementation (RSA-256)

```java
// security/JwtService.java

@Service
public class JwtService {

    private final RSAPrivateKey privateKey;
    private final RSAPublicKey publicKey;

    @Value("${jwt.access-token-expiry-minutes:15}")
    private long accessTokenExpiryMinutes;

    @Value("${jwt.refresh-token-expiry-days:30}")
    private long refreshTokenExpiryDays;

    public String generateAccessToken(User user) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + accessTokenExpiryMinutes * 60 * 1000);

        return Jwts.builder()
            .id(UUID.randomUUID().toString())           // jti — for revocation
            .subject(user.getId().toString())            // sub = user_id
            .claim("tenant_id", user.getTenantId())
            .claim("role", user.getRole().name())
            .claim("email", user.getEmail())
            .issuedAt(now)
            .expiration(expiry)
            .signWith(privateKey, Jwts.SIG.RS256)
            .compact();
    }

    public String generateRefreshToken(User user) {
        // Refresh token is an opaque UUID — stored hashed in DB
        return UUID.randomUUID().toString();
    }

    public Claims validateToken(String token) {
        return Jwts.parser()
            .verifyWith(publicKey)
            .build()
            .parseSignedClaims(token)
            .getPayload();
    }
}
```

---

## 2.11 API Endpoints

```java
// controller/AuthController.java

// PUBLIC ENDPOINTS
POST /api/auth/register
Request:  RegisterRequest
Response: AuthResponse (201)
Logic:
  1. Validate email uniqueness across tenants
  2. Create Tenant (slug auto-generated)
  3. Create User (role=OWNER, is_verified=false)
  4. Hash password (BCrypt strength 12)
  5. Seed default settings (chart of accounts seeded by Finance Service via event)
  6. Generate access_token + refresh_token
  7. Store refresh token hash in DB
  8. Publish auth.user.registered event → RabbitMQ
  9. Return AuthResponse

POST /api/auth/login
Request:  { email, password }
Response: AuthResponse (200)
Logic:
  1. Find user by email (case-insensitive)
  2. Verify password (BCrypt)
  3. Check is_active, deleted_at
  4. Update last_login_at
  5. Generate + return tokens
  6. Log to auth_audit_logs

POST /api/auth/refresh
Request:  { refresh_token: "uuid" }
Response: { access_token, expires_in } (200)
Logic:
  1. Hash incoming token, find in DB
  2. Check not revoked, not expired
  3. Load user, check still active
  4. Generate new access_token
  5. Optionally rotate refresh token (sliding window)

POST /api/auth/logout
Auth: Bearer
Request:  { refresh_token }
Response: { success: true } (200)
Logic:
  1. Extract jti from access_token
  2. Store jti in Redis with TTL = remaining expiry time (revocation)
  3. Mark refresh_token as revoked in DB

GET  /api/auth/verify-email?token=xxx
Response: redirect to web app

POST /api/auth/resend-verification
Auth: Bearer
Response: { success: true }

POST /api/auth/forgot-password
Request: { email }
Response: { success: true }  // always 200, never reveal if email exists

POST /api/auth/reset-password
Request: { token, new_password, confirm_password }
Response: { success: true }

// AUTHENTICATED ENDPOINTS
GET  /api/auth/me
Response: { user: UserResponse, tenant: TenantResponse }

PATCH /api/auth/me
Request: { full_name, phone, language }
Response: { user: UserResponse }

POST /api/auth/me/change-password
Request: { current_password, new_password }
Response: { success: true }

// USER MANAGEMENT (owner only)
GET   /api/auth/users
Response: { data: [UserResponse] }

POST  /api/auth/users/invite
Auth: owner
Request: InviteUserRequest { email, full_name, role, phone }
Response: { success: true, user_id }

PATCH /api/auth/users/{user_id}
Auth: owner
Request: { role, is_active }
Response: { data: UserResponse }

// TENANT SETTINGS
GET   /api/auth/tenant/settings
PATCH /api/auth/tenant/settings
Auth: owner

GET   /api/auth/tenant/profile
PATCH /api/auth/tenant/profile

// INTERNAL (gateway only, no JWT — uses service-to-service secret header)
POST /internal/auth/verify-token
Request: { token }
Response: { valid: true, payload: { user_id, tenant_id, role } }

GET  /internal/auth/users/{user_id}
// Used by other services to look up user details by ID
Response: { data: UserResponse }
```

---

## 2.12 Tenant Settings Structure

```java
// Stored in tenants.settings JSONB
// Accessed via tenant.getSettings().get("key")

{
  "fiscal_year_start": "04-01",
  "working_hours": { "open": "10:00", "close": "23:00" },
  "cash_variance_threshold": 100,
  "default_food_cost_target": 30,
  "default_labor_cost_target": 30,
  "prime_cost_target": 62,
  "tax_name": "GST",
  "default_tax_rate": 5,
  "enable_upi": true,
  "upi_id": "spicegarden@okaxis",
  "low_stock_alert_method": "push",
  "expiry_alert_days": 2,
  "price_change_alert_threshold": 10,
  "onboarding_restaurant_type": "full_service",
  "current_cash_float": 5000
}
```

---

## 2.13 Account Seed Service

```java
// service/AccountSeedService.java
// Called during tenant registration, publishes event consumed by Finance Service

@Service
public class AccountSeedService {

    @Autowired
    private AuthEventPublisher eventPublisher;

    public void seedNewTenant(UUID tenantId) {
        // Publish event — Finance Service will create the accounts
        eventPublisher.publishTenantCreated(TenantCreatedEvent.builder()
            .tenantId(tenantId)
            .build());
    }
}

// Finance Service consumes auth.tenant.created and seeds:
// - 20 default chart of accounts
// - Default vendor categories
```

---

## 2.14 RabbitMQ Event Publishing

```java
// event/AuthEventPublisher.java

@Component
public class AuthEventPublisher {

    @Autowired
    private RabbitTemplate rabbitTemplate;

    private static final String EXCHANGE = "kitchenledger.events";

    public void publishUserRegistered(User user, Tenant tenant) {
        rabbitTemplate.convertAndSend(
            EXCHANGE,
            "auth.user.registered",
            EventEnvelope.builder()
                .eventId(UUID.randomUUID())
                .eventType("auth.user.registered")
                .tenantId(tenant.getId())
                .producedBy("auth-service")
                .producedAt(Instant.now())
                .version("1.0")
                .payload(Map.of(
                    "user_id", user.getId(),
                    "email", user.getEmail(),
                    "full_name", user.getFullName(),
                    "tenant_name", tenant.getRestaurantName()
                ))
                .build()
        );
    }

    public void publishUserInvited(User invitedUser, String inviteToken) {
        rabbitTemplate.convertAndSend(
            EXCHANGE,
            "auth.user.invited",
            EventEnvelope.builder()
                .eventType("auth.user.invited")
                .tenantId(invitedUser.getTenantId())
                .payload(Map.of(
                    "user_id", invitedUser.getId(),
                    "email", invitedUser.getEmail(),
                    "role", invitedUser.getRole(),
                    "invite_token", inviteToken
                ))
                .build()
        );
    }
}
```

---

## 2.15 application.yml

```yaml
# auth-service/src/main/resources/application.yml

server:
  port: 8081

spring:
  application:
    name: auth-service
  datasource:
    url: ${SPRING_DATASOURCE_URL}
    username: ${SPRING_DATASOURCE_USERNAME}
    password: ${SPRING_DATASOURCE_PASSWORD}
    hikari:
      maximum-pool-size: 10
      connection-timeout: 30000
  jpa:
    hibernate:
      ddl-auto: validate          # Flyway manages schema — never use create/update
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
        format_sql: false
        default_schema: public
  flyway:
    enabled: true
    locations: classpath:db/migration
    baseline-on-migrate: true
  rabbitmq:
    host: ${RABBITMQ_HOST:localhost}
    port: 5672
    username: ${RABBITMQ_USERNAME:kl_rabbit}
    password: ${RABBITMQ_PASSWORD:kl_rabbit_pass}
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: 6379

jwt:
  private-key-path: ${JWT_PRIVATE_KEY_PATH}
  public-key-path: ${JWT_PUBLIC_KEY_PATH}
  access-token-expiry-minutes: 15
  refresh-token-expiry-days: 30

rabbitmq:
  exchange: kitchenledger.events
  # Auth Service is a PRODUCER only — it publishes events to the exchange.
  # It does NOT declare consumer queues. Each consumer service
  # (notification-service, finance-service, staff-service) creates and
  # owns its own durable queue. See §1.7 RabbitMQ Topology.

management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics
  endpoint:
    health:
      show-details: always

logging:
  level:
    com.kitchenledger: INFO
    org.springframework.security: WARN
```

---

## 2.16 RabbitMQ Topology (Definitive)

```
Exchange: kitchenledger.events  (type: topic, durable: true)

Each consumer service creates ONE durable queue named after itself.
Producers publish to the exchange using the event_type as routing key.
Consumers bind their queue to the exchange with specific routing keys.

QUEUE: notification-service
  Bindings (routing keys it receives):
    auth.user.registered
    auth.user.invited
    inventory.stock.low
    inventory.stock.expiring
    inventory.po.sent
    finance.dsr.reconciled
    finance.payment.overdue
    report.generated

QUEUE: finance-service
  Bindings:
    auth.tenant.created    ← seeds default chart of accounts
    ai.ocr.completed       ← updates expense with OCR results

QUEUE: inventory-service
  Bindings:
    ai.ocr.completed       ← applies notebook scan results to stock

QUEUE: report-service
  Bindings:
    finance.dsr.reconciled ← triggers report generation on reconcile

QUEUE: staff-service
  Bindings:
    auth.user.registered   ← may seed employee record for owner

NOTE: Auth Service is a PRODUCER only. It does not declare or own
any consumer queues. The Notification Service, Finance Service, and
Staff Service each own and manage their own queues independently.
```

---

## 2.17 @RequiresRole Custom Annotation (All Java Services)

Each Java service (auth, inventory, finance, staff) contains its own
local copy of this annotation + AOP aspect. There is no shared runtime
library — each service is fully self-contained.

```java
// src/main/java/com/kitchenledger/{service}/security/RequiresRole.java

package com.kitchenledger.{service}.security;

import java.lang.annotation.*;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequiresRole {
    String[] value();  // e.g. {"owner", "manager"}
}
```

```java
// src/main/java/com/kitchenledger/{service}/security/RoleCheckAspect.java

package com.kitchenledger.{service}.security;

import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import com.kitchenledger.{service}.exception.AccessDeniedException;
import java.util.Arrays;

@Aspect
@Component
public class RoleCheckAspect {

    @Before("@annotation(RequiresRole)")
    public void checkRole(JoinPoint joinPoint) {
        MethodSignature sig = (MethodSignature) joinPoint.getSignature();
        RequiresRole annotation = sig.getMethod().getAnnotation(RequiresRole.class);
        String[] allowedRoles = annotation.value();

        ServletRequestAttributes attrs =
            (ServletRequestAttributes) RequestContextHolder.currentRequestAttributes();
        HttpServletRequest request = attrs.getRequest();

        String userRole = request.getHeader("x-user-role");
        if (userRole == null || !Arrays.asList(allowedRoles).contains(userRole)) {
            throw new AccessDeniedException(
                "Role '" + userRole + "' is not permitted. Required: "
                + Arrays.toString(allowedRoles)
            );
        }
    }
}
```

```java
// Usage in any controller method:
@PostMapping
@RequiresRole({"owner", "manager"})
public ResponseEntity<?> createItem(...) { ... }
```

---

# KitchenLedger TRD v2 — Part 3
# Service Specs: Inventory Service + Finance Service

---

# SERVICE 3: INVENTORY SERVICE
**Technology:** Java 21 + Spring Boot 4.0.5 + Spring Data JPA + Flyway

---

## 3.1 Responsibility

Complete inventory lifecycle: supplier catalog, item catalog, PAR management, stock receiving with three-way match, FEFO tracking, waste logging, stock counting, recipe costing, and menu engineering. Owns the `inventory_movements` append-only ledger — the source of truth for all stock changes.

---

## 3.2 Database Schema

```sql
-- Flyway migration: V1__inventory_schema.sql

CREATE TABLE inventory_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    name        VARCHAR(100) NOT NULL,
    parent_id   UUID REFERENCES inventory_categories(id),
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, name)
);

CREATE TABLE suppliers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    name                VARCHAR(200) NOT NULL,
    contact_name        VARCHAR(200),
    email               VARCHAR(255),
    phone               VARCHAR(20),
    whatsapp            VARCHAR(20),
    address             TEXT,
    payment_terms_days  INT NOT NULL DEFAULT 30,
    lead_time_days      INT NOT NULL DEFAULT 1,
    delivery_schedule   JSONB NOT NULL DEFAULT '[]',
    notes               TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);
CREATE INDEX idx_suppliers_tenant ON suppliers(tenant_id) WHERE deleted_at IS NULL;

CREATE TABLE inventory_items (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL,
    category_id                 UUID REFERENCES inventory_categories(id),
    name                        VARCHAR(200) NOT NULL,
    sku                         VARCHAR(100),
    barcode                     VARCHAR(100),
    description                 TEXT,
    abc_category                CHAR(1) NOT NULL DEFAULT 'C' CHECK (abc_category IN ('A','B','C')),
    abc_override                BOOLEAN NOT NULL DEFAULT FALSE,
    -- Unit system
    purchase_unit               VARCHAR(50) NOT NULL,
    purchase_unit_qty           NUMERIC(10,4) NOT NULL DEFAULT 1,
    recipe_unit                 VARCHAR(50) NOT NULL,
    count_unit                  VARCHAR(50) NOT NULL,
    purchase_to_recipe_factor   NUMERIC(10,6) NOT NULL DEFAULT 1,
    recipe_to_count_factor      NUMERIC(10,6) NOT NULL DEFAULT 1,
    -- Stock
    current_stock               NUMERIC(12,4) NOT NULL DEFAULT 0,
    par_level                   NUMERIC(12,4),
    reorder_quantity            NUMERIC(12,4),
    safety_stock                NUMERIC(12,4) NOT NULL DEFAULT 0,
    -- Cost
    avg_cost                    NUMERIC(12,4) NOT NULL DEFAULT 0,
    last_purchase_price         NUMERIC(12,4),
    price_alert_threshold       NUMERIC(5,2) NOT NULL DEFAULT 10,
    -- Perishability
    is_perishable               BOOLEAN NOT NULL DEFAULT FALSE,
    shelf_life_days             INT,
    expiry_alert_days           INT NOT NULL DEFAULT 2,
    storage_location            VARCHAR(100),
    primary_supplier_id         UUID REFERENCES suppliers(id),
    is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
    notes                       TEXT,
    image_url                   VARCHAR(500),
    version                     INT NOT NULL DEFAULT 0,      -- optimistic locking
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ
);
CREATE INDEX idx_inv_items_tenant ON inventory_items(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_inv_items_barcode ON inventory_items(barcode) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX idx_inv_items_name_tenant ON inventory_items(tenant_id, LOWER(name)) WHERE deleted_at IS NULL;

CREATE TABLE inventory_item_suppliers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    supplier_id         UUID NOT NULL REFERENCES suppliers(id),
    supplier_sku        VARCHAR(100),
    unit_price          NUMERIC(12,4) NOT NULL,
    is_preferred        BOOLEAN NOT NULL DEFAULT FALSE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (inventory_item_id, supplier_id)
);

CREATE TABLE purchase_orders (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    po_number               VARCHAR(50) NOT NULL,
    supplier_id             UUID NOT NULL REFERENCES suppliers(id),
    status                  VARCHAR(30) NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','sent','partial','received','closed','cancelled')),
    order_date              DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_delivery_date  DATE,
    actual_delivery_date    DATE,
    subtotal                NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_amount              NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount            NUMERIC(12,2) NOT NULL DEFAULT 0,
    notes                   TEXT,
    sent_via                VARCHAR(20),
    sent_at                 TIMESTAMPTZ,
    created_by              UUID NOT NULL,        -- user_id (from Auth Service)
    received_by             UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at              TIMESTAMPTZ,
    UNIQUE (tenant_id, po_number)
);
CREATE INDEX idx_po_tenant_status ON purchase_orders(tenant_id, status) WHERE deleted_at IS NULL;

CREATE TABLE purchase_order_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    purchase_order_id   UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    ordered_quantity    NUMERIC(12,4) NOT NULL,
    ordered_unit        VARCHAR(50) NOT NULL,
    unit_price          NUMERIC(12,4) NOT NULL,
    line_total          NUMERIC(12,2) GENERATED ALWAYS AS (ROUND(ordered_quantity * unit_price, 2)) STORED,
    received_quantity   NUMERIC(12,4) NOT NULL DEFAULT 0,
    invoice_unit_price  NUMERIC(12,4),
    discrepancy_notes   TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_receipts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    purchase_order_id       UUID REFERENCES purchase_orders(id),
    supplier_id             UUID REFERENCES suppliers(id),
    receipt_date            DATE NOT NULL DEFAULT CURRENT_DATE,
    invoice_number          VARCHAR(100),
    invoice_date            DATE,
    invoice_amount          NUMERIC(12,2),
    invoice_image_url       VARCHAR(500),
    three_way_match_status  VARCHAR(20) NOT NULL DEFAULT 'pending'
                            CHECK (three_way_match_status IN ('pending','matched','discrepancy','approved')),
    match_notes             TEXT,
    received_by             UUID NOT NULL,
    is_confirmed            BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_receipt_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_receipt_id    UUID NOT NULL REFERENCES stock_receipts(id) ON DELETE CASCADE,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    expected_quantity   NUMERIC(12,4),
    received_quantity   NUMERIC(12,4) NOT NULL,
    unit                VARCHAR(50) NOT NULL,
    unit_cost           NUMERIC(12,4) NOT NULL,
    expiry_date         DATE,
    batch_number        VARCHAR(100),
    storage_location    VARCHAR(100),
    condition           VARCHAR(20) NOT NULL DEFAULT 'good'
                        CHECK (condition IN ('good','damaged','rejected')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- APPEND-ONLY STOCK LEDGER
CREATE TABLE inventory_movements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    movement_type       VARCHAR(50) NOT NULL
                        CHECK (movement_type IN (
                            'receipt','waste','transfer_out','transfer_in',
                            'count_adjust','opening_stock','void'
                        )),
    quantity_delta      NUMERIC(12,4) NOT NULL,
    unit                VARCHAR(50) NOT NULL,
    unit_cost           NUMERIC(12,4),
    reference_id        UUID,
    reference_type      VARCHAR(50),
    notes               TEXT,
    performed_by        UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_inv_movements_item ON inventory_movements(inventory_item_id, created_at DESC);
CREATE INDEX idx_inv_movements_tenant_date ON inventory_movements(tenant_id, created_at DESC);

CREATE TABLE waste_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    logged_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    quantity            NUMERIC(12,4) NOT NULL,
    unit                VARCHAR(50) NOT NULL,
    reason              VARCHAR(50) NOT NULL
                        CHECK (reason IN ('spoilage','expiration','prep_waste','overproduction',
                                          'cooking_error','plate_waste','contamination','incorrect_order')),
    station             VARCHAR(100),
    estimated_cost      NUMERIC(12,2),
    photo_url           VARCHAR(500),
    notes               TEXT,
    logged_by           UUID NOT NULL,
    movement_id         UUID REFERENCES inventory_movements(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_waste_logs_tenant_date ON waste_logs(tenant_id, logged_at DESC);

CREATE TABLE inventory_counts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    count_type              VARCHAR(20) NOT NULL DEFAULT 'full'
                            CHECK (count_type IN ('full','cycle')),
    abc_filter              CHAR(1) CHECK (abc_filter IN ('A','B','C')),
    status                  VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                            CHECK (status IN ('in_progress','completed','verified')),
    count_date              DATE NOT NULL DEFAULT CURRENT_DATE,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at            TIMESTAMPTZ,
    verified_at             TIMESTAMPTZ,
    counted_by              UUID NOT NULL,
    verified_by             UUID,
    notes                   TEXT,
    total_variance_cost     NUMERIC(12,2),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_count_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_count_id  UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    expected_quantity   NUMERIC(12,4) NOT NULL,
    counted_quantity    NUMERIC(12,4),
    unit                VARCHAR(50) NOT NULL,
    unit_cost           NUMERIC(12,4) NOT NULL,
    variance_quantity   NUMERIC(12,4) GENERATED ALWAYS AS (counted_quantity - expected_quantity) STORED,
    variance_cost       NUMERIC(12,2),
    notes               TEXT,
    counted_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_transfers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    from_location   VARCHAR(100) NOT NULL,
    to_location     VARCHAR(100) NOT NULL,
    transfer_date   DATE NOT NULL DEFAULT CURRENT_DATE,
    notes           TEXT,
    transferred_by  UUID NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE stock_transfer_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_transfer_id   UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    inventory_item_id   UUID NOT NULL REFERENCES inventory_items(id),
    quantity            NUMERIC(12,4) NOT NULL,
    unit                VARCHAR(50) NOT NULL,
    unit_cost           NUMERIC(12,4)
);

CREATE TABLE recipes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    name                VARCHAR(200) NOT NULL,
    category            VARCHAR(100),
    menu_price          NUMERIC(10,2) NOT NULL DEFAULT 0,
    serving_size        NUMERIC(10,3),
    serving_unit        VARCHAR(50),
    prep_time_minutes   INT,
    cook_time_minutes   INT,
    yield_percent       NUMERIC(5,2) NOT NULL DEFAULT 100,
    total_cost          NUMERIC(10,4) NOT NULL DEFAULT 0,
    food_cost_percent   NUMERIC(5,2) NOT NULL DEFAULT 0,
    menu_matrix_category VARCHAR(20)
                        CHECK (menu_matrix_category IN ('star','plowhorse','puzzle','dog')),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    notes               TEXT,
    image_url           VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE TABLE recipe_ingredients (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id           UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    inventory_item_id   UUID REFERENCES inventory_items(id),
    sub_recipe_id       UUID REFERENCES recipes(id),
    quantity            NUMERIC(12,4) NOT NULL,
    unit                VARCHAR(50) NOT NULL,
    waste_percent       NUMERIC(5,2) NOT NULL DEFAULT 0,
    unit_cost           NUMERIC(12,4) NOT NULL DEFAULT 0,
    line_cost           NUMERIC(12,4) NOT NULL DEFAULT 0,
    sort_order          INT NOT NULL DEFAULT 0,
    CONSTRAINT ingredient_xor_sub_recipe CHECK (
        (inventory_item_id IS NOT NULL AND sub_recipe_id IS NULL) OR
        (inventory_item_id IS NULL AND sub_recipe_id IS NOT NULL)
    )
);

-- RLS on all tables
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
-- (same for all tables above)

CREATE POLICY tenant_isolation ON inventory_items
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
-- (same pattern for all tables)
```

---

## 3.3 Service Layer Pattern (Java)

```java
// Shared pattern for all Java services

// Controller — thin, only HTTP concerns
@RestController
@RequestMapping("/api/inventory/items")
@RequiredArgsConstructor
public class InventoryItemController {

    private final InventoryItemService itemService;

    @GetMapping
    public ResponseEntity<PagedResponse<InventoryItemResponse>> listItems(
            @RequestHeader("x-tenant-id") UUID tenantId,
            @RequestHeader("x-user-role") String role,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "25") int size,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String abcCategory,
            @RequestParam(defaultValue = false) boolean lowStockOnly
    ) {
        var filter = ItemFilter.builder()
            .tenantId(tenantId)
            .search(search)
            .abcCategory(abcCategory)
            .lowStockOnly(lowStockOnly)
            .pageable(PageRequest.of(page, size))
            .build();
        return ResponseEntity.ok(itemService.listItems(filter));
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<ApiResponse<InventoryItemResponse>> createItem(
            @RequestHeader("x-tenant-id") UUID tenantId,
            @RequestHeader("x-user-id") UUID userId,
            @Valid @RequestBody CreateInventoryItemRequest request
    ) {
        var item = itemService.createItem(tenantId, userId, request);
        return ResponseEntity.status(201).body(ApiResponse.success(item));
    }
}

// Service — business logic
@Service
@Transactional
@RequiredArgsConstructor
public class InventoryItemService {

    private final InventoryItemRepository itemRepo;
    private final InventoryMovementRepository movementRepo;
    private final InventoryEventPublisher eventPublisher;
    private final AuditService auditService;

    public InventoryItemResponse createItem(UUID tenantId, UUID userId, CreateInventoryItemRequest req) {
        // 1. Check name uniqueness (case-insensitive)
        if (itemRepo.existsByTenantIdAndNameIgnoreCase(tenantId, req.getName())) {
            throw new ConflictException("Item with this name already exists");
        }
        // 2. Validate category belongs to tenant
        // 3. Create item
        var item = InventoryItem.builder()
            .tenantId(tenantId)
            .name(req.getName())
            // ... map all fields
            .build();
        item = itemRepo.save(item);
        // 4. Write audit log
        auditService.log(tenantId, userId, "inventory.item.created", item.getId(), null, item);
        return InventoryItemMapper.toResponse(item);
    }

    @Transactional
    public void confirmReceipt(UUID tenantId, UUID receiptId, UUID userId) {
        var receipt = receiptRepo.findByIdAndTenantId(receiptId, tenantId)
            .orElseThrow(() -> new NotFoundException("Receipt not found"));

        for (var lineItem : receipt.getItems()) {
            if (lineItem.getCondition() == Condition.REJECTED) continue;

            var item = itemRepo.findById(lineItem.getInventoryItemId())
                .orElseThrow();

            // Weighted average cost calculation (BigDecimal — NO double/float)
            BigDecimal currentStock = item.getCurrentStock();
            BigDecimal currentAvgCost = item.getAvgCost();
            BigDecimal receivedQty = lineItem.getReceivedQuantity();
            BigDecimal receivedCost = lineItem.getUnitCost();

            BigDecimal newTotalValue = currentStock.multiply(currentAvgCost)
                .add(receivedQty.multiply(receivedCost));
            BigDecimal newTotalQty = currentStock.add(receivedQty);
            BigDecimal newAvgCost = newTotalQty.compareTo(BigDecimal.ZERO) > 0
                ? newTotalValue.divide(newTotalQty, 4, RoundingMode.HALF_UP)
                : receivedCost;

            // Update item stock + cost
            item.setCurrentStock(newTotalQty);
            item.setAvgCost(newAvgCost);
            item.setLastPurchasePrice(receivedCost);
            itemRepo.save(item);

            // Append to immutable ledger
            movementRepo.save(InventoryMovement.builder()
                .tenantId(tenantId)
                .inventoryItemId(item.getId())
                .movementType(MovementType.RECEIPT)
                .quantityDelta(receivedQty)
                .unit(lineItem.getUnit())
                .unitCost(receivedCost)
                .referenceId(receiptId)
                .referenceType("stock_receipt")
                .performedBy(userId)
                .build());

            // If price changed >threshold: publish alert event
            BigDecimal priceDeltaPercent = computePriceDeltaPercent(
                item.getLastPurchasePrice(), receivedCost);
            if (priceDeltaPercent.abs().compareTo(item.getPriceAlertThreshold()) > 0) {
                eventPublisher.publishPriceAlert(tenantId, item, priceDeltaPercent);
            }
        }

        // Trigger recipe cost recalculation event for affected items
        eventPublisher.publishReceiptConfirmed(tenantId, receipt.getItems());

        receipt.setIsConfirmed(true);
        receipt.setConfirmedAt(Instant.now());
        receiptRepo.save(receipt);
    }
}
```

---

## 3.4 API Endpoints — Inventory Service

```
ITEMS
GET    /api/inventory/items                     list with filter/search/sort/page
POST   /api/inventory/items                     create [owner, manager]
GET    /api/inventory/items/{id}                detail + movements + suppliers
PATCH  /api/inventory/items/{id}                update [owner, manager]
DELETE /api/inventory/items/{id}                soft delete [owner, manager]
GET    /api/inventory/items/by-barcode/{code}   lookup by barcode
POST   /api/inventory/items/import              CSV bulk import [owner, manager]
POST   /api/inventory/opening-stock             set opening stock for multiple items

CATEGORIES
GET    /api/inventory/categories
POST   /api/inventory/categories
PATCH  /api/inventory/categories/{id}

SUPPLIERS
GET    /api/inventory/suppliers
POST   /api/inventory/suppliers
GET    /api/inventory/suppliers/{id}
PATCH  /api/inventory/suppliers/{id}
DELETE /api/inventory/suppliers/{id}
GET    /api/inventory/suppliers/{id}/items      items supplied by this supplier

ITEM SUPPLIERS (pricing)
POST   /api/inventory/items/{id}/suppliers
PATCH  /api/inventory/items/{id}/suppliers/{supplier_id}
DELETE /api/inventory/items/{id}/suppliers/{supplier_id}

PURCHASE ORDERS
GET    /api/inventory/purchase-orders
POST   /api/inventory/purchase-orders
GET    /api/inventory/purchase-orders/{id}
PATCH  /api/inventory/purchase-orders/{id}
DELETE /api/inventory/purchase-orders/{id}      draft only
POST   /api/inventory/purchase-orders/{id}/send  email or whatsapp
GET    /api/inventory/purchase-orders/suggestions auto-suggested from low stock

STOCK RECEIPTS
GET    /api/inventory/receipts
POST   /api/inventory/receipts                  create draft receipt
GET    /api/inventory/receipts/{id}
PATCH  /api/inventory/receipts/{id}             update draft
POST   /api/inventory/receipts/{id}/confirm     lock + update stock

WASTE LOGS
GET    /api/inventory/waste
POST   /api/inventory/waste                     [all roles]
GET    /api/inventory/waste/{id}
GET    /api/inventory/waste/report              aggregated report

STOCK COUNTS
GET    /api/inventory/counts
POST   /api/inventory/counts                    start session
GET    /api/inventory/counts/{id}
PATCH  /api/inventory/counts/{id}/items/{item_id}   update single count
POST   /api/inventory/counts/{id}/complete      calculate variances
POST   /api/inventory/counts/{id}/verify        apply adjustments [owner, manager]
GET    /api/inventory/counts/{id}/variance-report

STOCK TRANSFERS
GET    /api/inventory/transfers
POST   /api/inventory/transfers

MOVEMENTS
GET    /api/inventory/items/{id}/movements      history for one item
GET    /api/inventory/movements                 all movements

ALERTS
GET    /api/inventory/alerts                    low stock + expiring

RECIPES
GET    /api/inventory/recipes
POST   /api/inventory/recipes
GET    /api/inventory/recipes/{id}
PATCH  /api/inventory/recipes/{id}
DELETE /api/inventory/recipes/{id}
POST   /api/inventory/recipes/{id}/calculate-cost
GET    /api/inventory/menu-engineering          2x2 matrix [owner]

REPORTS
GET    /api/inventory/reports/valuation
GET    /api/inventory/reports/waste-analysis
GET    /api/inventory/reports/purchase-analysis

MOBILE SYNC
GET    /api/inventory/sync/pull
  Query params: last_pulled_at (Unix timestamp ms, optional — omit for full sync)
  Auth: all roles
  Response:
  {
    "timestamp": 1705312200000,
    "changes": {
      "inventory_items": {
        "created": [ ...InventoryItemSyncResponse ],
        "updated": [ ...InventoryItemSyncResponse ],
        "deleted": [ "uuid1", "uuid2" ]
      }
    }
  }
  Logic: Returns items created/updated/deleted since last_pulled_at.
  InventoryItemSyncResponse includes only fields needed by WatermelonDB
  schema (id, name, abc_category, current_stock, par_level, count_unit,
  storage_location, is_perishable, avg_cost).
  Implement in Phase 3 alongside inventory item CRUD.

INTERNAL (inter-service, no auth)
GET    /internal/inventory/items/{id}/cost      cost data for Finance
GET    /internal/inventory/items?names[]=...    item lookup for AI Service
GET    /internal/inventory/tenant/{id}/items    all items for a tenant (AI OCR)
```

---

## 3.5 Scheduled Jobs (Spring @Scheduled)

```java
// config/ScheduledJobsConfig.java

@Component
public class InventoryScheduledJobs {

    @Scheduled(cron = "0 0 * * * *")  // every hour
    public void checkLowStockAlerts() {
        // For each tenant: find items where current_stock <= par_level
        // Deduplicate via Redis (don't re-alert within 4h per item)
        // Publish inventory.stock.low event per item
    }

    @Scheduled(cron = "0 0 7 * * *")  // 7am daily
    public void checkExpiryAlerts() {
        // Find perishable items expiring within expiry_alert_days
        // Publish inventory.stock.expiring event
    }

    @Scheduled(cron = "0 0 2 * * MON")  // 2am every Monday
    public void recomputeAbcClassification() {
        // For each tenant: rank items by avg cost contribution
        // Top 20% → A, next 30% → B, rest → C
        // Bulk update abc_category where abc_override = false
    }
}
```

---

---

# SERVICE 4: FINANCE SERVICE
**Technology:** Java 21 + Spring Boot 4.0.5 + Spring Data JPA + Flyway

---

## 3.6 Responsibility

Everything related to money: daily sales reconciliation, expense tracking, vendor payments, accounts payable, and the P&L engine. Financial precision is the defining constraint — every monetary value is `BigDecimal`, every multi-step operation is `@Transactional`.

---

## 3.7 Database Schema

```sql
-- Flyway migration: V1__finance_schema.sql

CREATE TABLE accounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    code            VARCHAR(20) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    account_type    VARCHAR(30) NOT NULL
                    CHECK (account_type IN ('revenue','cogs','labor','operating_expense','asset','liability')),
    parent_id       UUID REFERENCES accounts(id),
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order      INT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
);

CREATE TABLE vendors (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    name                VARCHAR(200) NOT NULL,
    contact_name        VARCHAR(200),
    email               VARCHAR(255),
    phone               VARCHAR(20),
    address             TEXT,
    payment_terms_days  INT NOT NULL DEFAULT 30,
    tax_number          VARCHAR(50),
    bank_details        JSONB,
    external_supplier_id UUID,         -- link to inventory supplier
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE TABLE daily_sales_reports (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    report_date             DATE NOT NULL,
    status                  VARCHAR(20) NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','reconciled','verified')),
    -- Revenue
    gross_sales             NUMERIC(12,2) NOT NULL DEFAULT 0,
    discounts               NUMERIC(12,2) NOT NULL DEFAULT 0,
    comps                   NUMERIC(12,2) NOT NULL DEFAULT 0,
    voids                   NUMERIC(12,2) NOT NULL DEFAULT 0,
    net_sales               NUMERIC(12,2) GENERATED ALWAYS AS
                            (gross_sales - discounts - comps - voids) STORED,
    food_sales              NUMERIC(12,2) NOT NULL DEFAULT 0,
    beverage_sales          NUMERIC(12,2) NOT NULL DEFAULT 0,
    other_sales             NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_collected           NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Payment breakdown
    cash_sales              NUMERIC(12,2) NOT NULL DEFAULT 0,
    card_sales              NUMERIC(12,2) NOT NULL DEFAULT 0,
    upi_sales               NUMERIC(12,2) NOT NULL DEFAULT 0,
    delivery_platform_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
    other_payment_sales     NUMERIC(12,2) NOT NULL DEFAULT 0,
    tips_collected          NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- Cash reconciliation
    cash_expected           NUMERIC(12,2) NOT NULL DEFAULT 0,
    cash_counted            NUMERIC(12,2),
    cash_over_short         NUMERIC(12,2),
    variance_explanation    TEXT,
    -- Operations
    guest_count             INT NOT NULL DEFAULT 0,
    avg_check_size          NUMERIC(10,2) GENERATED ALWAYS AS
                            (CASE WHEN guest_count > 0
                             THEN ROUND((gross_sales - discounts - comps - voids) / guest_count, 2)
                             ELSE 0 END) STORED,
    table_count             INT NOT NULL DEFAULT 0,
    table_turnover_rate     NUMERIC(5,2),
    -- Labor (filled from HR module later)
    total_labor_hours       NUMERIC(8,2),
    total_labor_cost        NUMERIC(12,2),
    splh                    NUMERIC(10,2),
    -- Metadata
    reconciled_by           UUID,
    reconciled_at           TIMESTAMPTZ,
    notes                   TEXT,
    version                 INT NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, report_date)
);
CREATE INDEX idx_dsr_tenant_date ON daily_sales_reports(tenant_id, report_date DESC);
CREATE INDEX idx_dsr_status ON daily_sales_reports(tenant_id, status, report_date DESC);

CREATE TABLE expenses (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    account_id          UUID NOT NULL REFERENCES accounts(id),
    vendor_id           UUID REFERENCES vendors(id),
    expense_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    description         VARCHAR(500) NOT NULL,
    amount              NUMERIC(12,2) NOT NULL,
    tax_amount          NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(12,2) GENERATED ALWAYS AS (amount + tax_amount) STORED,
    payment_method      VARCHAR(30) NOT NULL DEFAULT 'cash'
                        CHECK (payment_method IN ('cash','card','upi','bank_transfer','cheque','other')),
    payment_status      VARCHAR(20) NOT NULL DEFAULT 'paid'
                        CHECK (payment_status IN ('paid','pending','overdue')),
    invoice_number      VARCHAR(100),
    invoice_date        DATE,
    due_date            DATE,
    receipt_url         VARCHAR(500),
    ocr_raw_data        JSONB,
    ocr_confidence      NUMERIC(5,2),
    is_recurring        BOOLEAN NOT NULL DEFAULT FALSE,
    recurring_config    JSONB,
    notes               TEXT,
    approved_by         UUID,
    approved_at         TIMESTAMPTZ,
    created_by          UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);
CREATE INDEX idx_expenses_tenant_date ON expenses(tenant_id, expense_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_vendor ON expenses(vendor_id, expense_date DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_expenses_due ON expenses(tenant_id, due_date) WHERE payment_status = 'pending';

CREATE TABLE vendor_payments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    vendor_id           UUID NOT NULL REFERENCES vendors(id),
    expense_id          UUID REFERENCES expenses(id),
    amount              NUMERIC(12,2) NOT NULL,
    payment_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method      VARCHAR(30) NOT NULL,
    reference_number    VARCHAR(100),
    notes               TEXT,
    created_by          UUID NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE upi_transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    report_date     DATE,
    transaction_ref VARCHAR(100) UNIQUE NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    payer_vpa       VARCHAR(255),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','success','failed','refunded')),
    settled_at      TIMESTAMPTZ,
    raw_webhook     JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Finance Audit Log (separate from auth audit)
CREATE TABLE finance_audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    user_id     UUID,
    event_type  VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id   UUID,
    old_value   JSONB,
    new_value   JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE daily_sales_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
-- ... same for all tables

CREATE POLICY tenant_isolation ON daily_sales_reports
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
```

---

## 3.8 P&L Report Engine

```java
// service/PLReportService.java

@Service
@RequiredArgsConstructor
public class PLReportService {

    private final DailySalesReportRepository dsrRepo;
    private final ExpenseRepository expenseRepo;
    private final AccountRepository accountRepo;

    @Transactional(readOnly = true)
    public PLReportResponse generate(UUID tenantId, LocalDate start, LocalDate end,
                                     LocalDate compareStart, LocalDate compareEnd) {
        var primary = computePL(tenantId, start, end);
        var comparison = (compareStart != null)
            ? computePL(tenantId, compareStart, compareEnd)
            : null;
        return PLReportResponse.builder()
            .period(new DateRange(start, end))
            .primary(primary)
            .comparison(comparison)
            .build();
    }

    private PLData computePL(UUID tenantId, LocalDate start, LocalDate end) {
        // Revenue: aggregate DSRs
        var revenue = dsrRepo.aggregateRevenue(tenantId, start, end);
        // Total net sales = food_sales + beverage_sales + other_sales - discounts - comps - voids

        // COGS: expenses where account.account_type = 'cogs'
        var cogsByAccount = expenseRepo.sumByAccountType(tenantId, start, end, "cogs");
        BigDecimal totalCogs = cogsByAccount.stream()
            .map(AccountSummary::getAmount)
            .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Labor: account_type = 'labor'
        var laborByAccount = expenseRepo.sumByAccountType(tenantId, start, end, "labor");
        BigDecimal totalLabor = sum(laborByAccount);

        // Operating: account_type = 'operating_expense'
        var operatingByAccount = expenseRepo.sumByAccountType(tenantId, start, end, "operating_expense");
        BigDecimal totalOperating = sum(operatingByAccount);

        // Derived metrics
        BigDecimal netSales = revenue.getNetSales();
        BigDecimal grossProfit = netSales.subtract(totalCogs);
        BigDecimal primeCost = totalCogs.add(totalLabor);
        BigDecimal netProfit = grossProfit.subtract(totalLabor).subtract(totalOperating);

        // Benchmark statuses (from tenant settings or defaults)
        var benchmarks = loadBenchmarks(tenantId);

        return PLData.builder()
            .revenue(buildRevenueSection(revenue))
            .cogs(buildCogSection(cogsByAccount, totalCogs, netSales, benchmarks))
            .grossProfit(buildGrossProfit(grossProfit, netSales))
            .labor(buildLaborSection(laborByAccount, totalLabor, netSales, benchmarks))
            .primeCost(buildPrimeCost(primeCost, netSales, benchmarks))
            .operatingExpenses(buildOperating(operatingByAccount, totalOperating, netSales))
            .netProfit(buildNetProfit(netProfit, netSales, benchmarks))
            .build();
    }

    private BenchmarkStatus getBenchmarkStatus(BigDecimal actual, BigDecimal min, BigDecimal max) {
        if (actual.compareTo(min) >= 0 && actual.compareTo(max) <= 0) return BenchmarkStatus.GOOD;
        if (actual.compareTo(max) > 0) return BenchmarkStatus.WARNING;
        return BenchmarkStatus.DANGER;
    }
}
```

---

## 3.9 DSR Service — Get-or-Create Pattern

```java
// service/DailySalesReportService.java

@Service
@Transactional
public class DailySalesReportService {

    public DailySalesReport getOrCreateDraft(UUID tenantId, LocalDate date) {
        if (date.isAfter(LocalDate.now())) {
            throw new BadRequestException("Cannot create report for future date");
        }
        return dsrRepo.findByTenantIdAndReportDate(tenantId, date)
            .orElseGet(() -> dsrRepo.save(DailySalesReport.builder()
                .tenantId(tenantId)
                .reportDate(date)
                .status(DsrStatus.DRAFT)
                .build()));
    }

    public DailySalesReport reconcile(UUID tenantId, LocalDate date, UUID userId) {
        var dsr = getOrCreateDraft(tenantId, date);

        if (dsr.getCashCounted() == null) {
            throw new ValidationException("cash_counted", "Cash count is required");
        }

        BigDecimal overShort = dsr.getCashCounted().subtract(dsr.getCashExpected());
        dsr.setCashOverShort(overShort);

        BigDecimal threshold = getTenantCashThreshold(tenantId);
        if (overShort.abs().compareTo(threshold) > 0 &&
            (dsr.getVarianceExplanation() == null || dsr.getVarianceExplanation().isBlank())) {
            throw new ValidationException("variance_explanation",
                "Explanation required when variance exceeds " + threshold);
        }

        dsr.setStatus(DsrStatus.RECONCILED);
        dsr.setReconciledBy(userId);
        dsr.setReconciledAt(Instant.now());
        var saved = dsrRepo.save(dsr);

        // Publish event — triggers notifications + report generation
        eventPublisher.publishDsrReconciled(tenantId, saved);
        auditService.log(tenantId, userId, "finance.dsr.reconciled", saved.getId(), null, saved);

        return saved;
    }
}
```

---

## 3.10 API Endpoints — Finance Service

```
CHART OF ACCOUNTS
GET    /api/finance/accounts
POST   /api/finance/accounts                    [owner]
PATCH  /api/finance/accounts/{id}               [owner]
DELETE /api/finance/accounts/{id}               [owner] — only non-system, unused

VENDORS
GET    /api/finance/vendors
POST   /api/finance/vendors
GET    /api/finance/vendors/{id}
PATCH  /api/finance/vendors/{id}
DELETE /api/finance/vendors/{id}
GET    /api/finance/vendors/{id}/balance        AP aging per vendor

DAILY SALES REPORTS
GET    /api/finance/daily-reports               list with date range filter
GET    /api/finance/daily-reports/{date}        get or create draft (YYYY-MM-DD)
PUT    /api/finance/daily-reports/{date}        save DSR form (full update)
POST   /api/finance/daily-reports/{date}/reconcile
GET    /api/finance/daily-reports/trends        DSR trend analysis

EXPENSES
GET    /api/finance/expenses                    filter: date, account, vendor, status
POST   /api/finance/expenses
GET    /api/finance/expenses/{id}
PATCH  /api/finance/expenses/{id}
DELETE /api/finance/expenses/{id}               soft delete

VENDOR PAYMENTS
POST   /api/finance/vendors/{id}/payments       record payment
GET    /api/finance/vendors/{id}/payments       payment history

ACCOUNTS PAYABLE
GET    /api/finance/ap/summary                  totals + aging buckets
GET    /api/finance/ap/aging                    per-vendor aging detail

UPI
POST   /api/finance/upi/generate-qr             dynamic QR [owner, manager]
POST   /api/webhooks/upi-payment                webhook (no auth, HMAC verified)

REPORTS (lighter versions — heavy reports go to Report Service)
GET    /api/finance/reports/pl                  P&L for date range [owner]
GET    /api/finance/reports/expenses            expense breakdown
GET    /api/finance/reports/cash-flow           30-day cash projection
GET    /api/finance/reports/tax                 GST summary [owner]
GET    /api/finance/dashboard                   finance KPI summary

EXPORT
GET    /api/finance/export                      CSV/Excel [owner]

INTERNAL
GET    /internal/finance/pl-data                for Report Service
POST   /internal/finance/accounts/seed          called on tenant.created event
```

---

## 3.11 Scheduled Jobs

```java
@Component
public class FinanceScheduledJobs {

    @Scheduled(cron = "0 0 8 * * *")  // 8am daily
    public void checkPaymentDueAlerts() {
        // Find expenses where due_date = today + 3 days AND status = pending
        // Publish finance.payment.due event
    }

    @Scheduled(cron = "0 0 1 * * *")  // 1am daily
    public void markOverduePayments() {
        // Update expenses where due_date < today AND status = pending → overdue
        // Publish finance.payment.overdue event for any newly overdue
    }

    @Scheduled(cron = "0 0 9 * * MON")  // 9am Monday
    public void sendWeeklyFinanceSummary() {
        // For each tenant: compute 7-day P&L summary
        // Publish event → Report Service generates PDF → Notification Service sends
    }
}
```

---

## 3.12 RabbitMQ Event Consumer — Finance Service

```java
// event/FinanceEventConsumer.java

@Component
public class FinanceEventConsumer {

    @RabbitListener(queues = "finance.tenant.created")
    public void onTenantCreated(TenantCreatedEvent event) {
        // Seed default chart of accounts for new tenant
        accountSeedService.seedDefaultAccounts(event.getTenantId());
    }

    @RabbitListener(queues = "finance.ai.ocr.completed")
    public void onOcrCompleted(OcrCompletedEvent event) {
        if (!"expense".equals(event.getContextType())) return;
        // Find expense by event.referenceId
        // Update expense fields from event.extractedData
        // Set ocr_confidence, ocr_raw_data
    }
}
```

---

# SERVICE 5: STAFF SERVICE
**Technology:** Java 21 + Spring Boot 4.0.5 + Spring Data JPA + Flyway

---

## 3.13 Responsibility

All staff and HR operations: employee records, shift scheduling, clock-in/out attendance, daily task management with photo verification, shift feedback, tip pool calculation and distribution, performance goals, and certification tracking. This service is the operational HR backbone — it knows *who works when* and *what they did*.

---

## 3.14 Database Schema

```sql
-- Flyway migration: V1__staff_schema.sql

CREATE TABLE employees (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    user_id             UUID,                    -- link to auth.users (optional)
    full_name           VARCHAR(200) NOT NULL,
    phone               VARCHAR(20),
    role                VARCHAR(50) NOT NULL,
    employment_type     VARCHAR(20) NOT NULL DEFAULT 'full_time'
                        CHECK (employment_type IN ('full_time','part_time','contract')),
    hourly_rate         NUMERIC(10,2),
    hire_date           DATE,
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive','terminated')),
    emergency_contact   JSONB NOT NULL DEFAULT '{}',
    availability        JSONB NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);
CREATE INDEX idx_employees_tenant ON employees(tenant_id) WHERE deleted_at IS NULL;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON employees
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE TABLE shifts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    employee_id         UUID NOT NULL REFERENCES employees(id),
    shift_date          DATE NOT NULL,
    start_time          TIME NOT NULL,
    end_time            TIME NOT NULL,
    role                VARCHAR(50),
    station             VARCHAR(100),
    status              VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','clocked_in',
                                          'completed','no_show','cancelled')),
    actual_clock_in     TIMESTAMPTZ,
    actual_clock_out    TIMESTAMPTZ,
    break_minutes       INT NOT NULL DEFAULT 0,
    total_hours         NUMERIC(5,2),
    overtime_hours      NUMERIC(5,2) NOT NULL DEFAULT 0,
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_shifts_tenant_date ON shifts(tenant_id, shift_date DESC);
CREATE INDEX idx_shifts_employee ON shifts(employee_id, shift_date DESC);
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shifts
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE TABLE tasks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    title               VARCHAR(255) NOT NULL,
    description         TEXT,
    category            VARCHAR(30) NOT NULL DEFAULT 'general'
                        CHECK (category IN ('opening','closing',
                                            'sidework','prep','safety','general')),
    assigned_to         UUID REFERENCES employees(id),
    shift_id            UUID REFERENCES shifts(id),
    due_date            DATE,
    status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','in_progress',
                                          'completed','skipped')),
    requires_photo      BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at        TIMESTAMPTZ,
    photo_url           VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tasks_tenant_date ON tasks(tenant_id, due_date DESC);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tasks
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE TABLE shift_feedback (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    shift_id            UUID NOT NULL REFERENCES shifts(id),
    employee_id         UUID NOT NULL REFERENCES employees(id),
    rating              SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    issues              JSONB NOT NULL DEFAULT '[]',
    equipment_flags     JSONB NOT NULL DEFAULT '[]',
    morale_note         TEXT,
    submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE shift_feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON shift_feedback
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE TABLE tip_pools (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    pool_date           DATE NOT NULL,
    shift_type          VARCHAR(20),
    total_tips          NUMERIC(12,2) NOT NULL DEFAULT 0,
    distribution_rules  JSONB NOT NULL DEFAULT '{}',
    status              VARCHAR(20) NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open','calculated','distributed')),
    calculated_at       TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE tip_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tip_pools
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE TABLE tip_pool_payouts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tip_pool_id         UUID NOT NULL REFERENCES tip_pools(id),
    employee_id         UUID NOT NULL REFERENCES employees(id),
    amount              NUMERIC(10,2) NOT NULL,
    basis               VARCHAR(50),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE attendance (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    employee_id         UUID NOT NULL REFERENCES employees(id),
    shift_id            UUID REFERENCES shifts(id),
    date                DATE NOT NULL,
    clock_in            TIMESTAMPTZ,
    clock_out           TIMESTAMPTZ,
    break_minutes       INT NOT NULL DEFAULT 0,
    total_hours         NUMERIC(5,2),
    overtime_hours      NUMERIC(5,2) NOT NULL DEFAULT 0,
    status              VARCHAR(20) NOT NULL DEFAULT 'present'
                        CHECK (status IN ('present','late','absent','excused')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_attendance_tenant_date ON attendance(tenant_id, date DESC);
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON attendance
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE TABLE performance_goals (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    employee_id         UUID NOT NULL REFERENCES employees(id),
    metric              VARCHAR(100) NOT NULL,
    target_value        NUMERIC(12,2) NOT NULL,
    current_value       NUMERIC(12,2) NOT NULL DEFAULT 0,
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','achieved','missed')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE performance_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON performance_goals
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE TABLE certifications (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    employee_id         UUID NOT NULL REFERENCES employees(id),
    name                VARCHAR(200) NOT NULL,
    issued_date         DATE,
    expiry_date         DATE,
    document_url        VARCHAR(500),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON certifications
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
```

---

## 3.15 Project Structure

```
staff-service/
└── src/main/java/com/kitchenledger/staff/
    ├── StaffServiceApplication.java
    ├── config/
    │   ├── SecurityConfig.java
    │   ├── RabbitMQConfig.java
    │   └── FlywayConfig.java
    ├── security/
    │   ├── RequiresRole.java           # Custom annotation
    │   ├── RoleCheckAspect.java        # AOP aspect
    │   └── GatewayTrustFilter.java     # Trust X-User-* headers
    ├── model/
    │   ├── Employee.java
    │   ├── Shift.java
    │   ├── Task.java
    │   ├── ShiftFeedback.java
    │   ├── TipPool.java
    │   ├── TipPoolPayout.java
    │   ├── Attendance.java
    │   ├── PerformanceGoal.java
    │   └── Certification.java
    ├── repository/
    │   ├── EmployeeRepository.java
    │   ├── ShiftRepository.java
    │   ├── TaskRepository.java
    │   ├── AttendanceRepository.java
    │   └── TipPoolRepository.java
    ├── dto/
    │   ├── request/
    │   └── response/
    ├── service/
    │   ├── EmployeeService.java
    │   ├── ShiftService.java
    │   ├── TaskService.java
    │   ├── AttendanceService.java
    │   ├── TipPoolService.java
    │   └── AuditService.java
    ├── event/
    │   ├── StaffEventConsumer.java     # RabbitMQ listeners
    │   └── StaffEventPublisher.java
    ├── exception/
    │   ├── GlobalExceptionHandler.java
    │   ├── NotFoundException.java
    │   ├── ConflictException.java
    │   ├── ValidationException.java
    │   └── AccessDeniedException.java
    └── controller/
        ├── EmployeeController.java
        ├── ShiftController.java
        ├── TaskController.java
        ├── AttendanceController.java
        ├── TipPoolController.java
        ├── PerformanceController.java
        └── HealthController.java
```

---

## 3.16 API Endpoints — Staff Service

```
EMPLOYEES
GET    /api/staff/employees                   list (filter: status, role) [owner, manager]
POST   /api/staff/employees                   create [owner, manager]
GET    /api/staff/employees/{id}              detail [owner, manager; own profile for staff]
PATCH  /api/staff/employees/{id}             update [owner, manager]
DELETE /api/staff/employees/{id}              soft delete [owner]

SHIFTS (SCHEDULING)
GET    /api/staff/shifts                      list (filter: date range, employee_id, status)
POST   /api/staff/shifts                      create shift [owner, manager]
GET    /api/staff/shifts/{id}
PATCH  /api/staff/shifts/{id}                update [owner, manager]
DELETE /api/staff/shifts/{id}                cancel [owner, manager]
GET    /api/staff/schedule                    weekly schedule view (all employees)
POST   /api/staff/schedule/publish           publish schedule (sends notifications)

ATTENDANCE (CLOCK-IN/OUT)
POST   /api/staff/attendance/clock-in         clock in [all roles for own record]
POST   /api/staff/attendance/clock-out        clock out [all roles for own record]
GET    /api/staff/attendance                  list [owner, manager]
PATCH  /api/staff/attendance/{id}            edit (manager approval) [owner, manager]
GET    /api/staff/attendance/report          weekly timesheet [owner, manager]

TASKS
GET    /api/staff/tasks                       list (filter: date, status, assigned_to)
POST   /api/staff/tasks                       create [owner, manager]
GET    /api/staff/tasks/{id}
PATCH  /api/staff/tasks/{id}                 update status (staff can update own) [all roles]
DELETE /api/staff/tasks/{id}                  [owner, manager]
POST   /api/staff/tasks/{id}/complete        mark complete + optional photo URL
GET    /api/staff/tasks/checklist/{date}     opening/closing checklist for date

SHIFT FEEDBACK
POST   /api/staff/shifts/{id}/feedback       submit feedback [all roles for own shift]
GET    /api/staff/shifts/{id}/feedback       [owner, manager]
GET    /api/staff/feedback/summary           morale trends [owner, manager]

TIP POOLS
GET    /api/staff/tips                        list tip pools
POST   /api/staff/tips                        create [owner, manager]
GET    /api/staff/tips/{id}
POST   /api/staff/tips/{id}/calculate        calculate distribution [owner, manager]
POST   /api/staff/tips/{id}/distribute       mark as distributed [owner]
GET    /api/staff/tips/{id}/payouts          per-employee amounts

PERFORMANCE & GOALS
GET    /api/staff/employees/{id}/goals
POST   /api/staff/employees/{id}/goals       [owner, manager]
PATCH  /api/staff/employees/{id}/goals/{goal_id}

CERTIFICATIONS
GET    /api/staff/employees/{id}/certifications
POST   /api/staff/employees/{id}/certifications    [owner, manager]
DELETE /api/staff/employees/{id}/certifications/{cert_id}

INTERNAL
GET    /internal/staff/employees/{id}        employee lookup for other services
```

---

## 3.17 RabbitMQ — Staff Service Events

```java
// StaffEventConsumer.java

@RabbitListener(queues = "staff-service")
public void onUserRegistered(EventEnvelope event) {
    if (!"auth.user.registered".equals(event.getEventType())) return;
    // Owner user registered — optionally create a linked employee record
    // (owner may also be an employee for scheduling/payroll purposes)
}
```

Staff Service produces no events in Phase 3. Future phases may add:
- `staff.shift.published` → Notification Service (schedule published alert)
- `staff.attendance.overtime` → Notification Service (overtime alert)

---

# KitchenLedger TRD v2 — Part 4
# Service Specs: AI Service + Notification Service + Report Service + File Service

---

# SERVICE 6: AI SERVICE
**Technology:** Python 3.12 + FastAPI 0.115 + Celery 5.4 + Redis

---

## 4.1 Responsibility

All AI-powered features: OCR for handwritten notebooks, invoice/receipt parsing, voice transcription, natural language financial queries, demand forecasting, and anomaly detection. This service has **no authoritative database** — it reads from other services via internal APIs and writes results back via RabbitMQ events or direct API callbacks.

---

## 4.2 Database Schema (AI-owned tables only)

```sql
-- Flyway migration (applied by AI service at startup via Alembic)

CREATE TABLE ai_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    user_id         UUID NOT NULL,
    job_type        VARCHAR(50) NOT NULL
                    CHECK (job_type IN ('notebook_ocr','receipt_ocr','voice_transcribe','nl_query','forecast')),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','completed','failed')),
    input_data      JSONB NOT NULL DEFAULT '{}',
    result          JSONB,
    error_message   TEXT,
    model_used      VARCHAR(100),
    tokens_used     INT,
    processing_ms   INT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);
CREATE INDEX idx_ai_jobs_tenant ON ai_jobs(tenant_id, created_at DESC);
CREATE INDEX idx_ai_jobs_status ON ai_jobs(status, created_at) WHERE status = 'pending';
```

---

## 4.3 Project Structure

```
ai-service/
├── app/
│   ├── main.py                     # FastAPI app + lifespan
│   ├── core/
│   │   ├── config.py               # Pydantic settings
│   │   ├── deps.py                 # FastAPI dependencies (tenant headers)
│   │   └── database.py             # Async SQLAlchemy for ai_jobs table
│   ├── routers/
│   │   ├── ocr.py                  # /api/ai/ocr/*
│   │   ├── voice.py                # /api/ai/voice/*
│   │   ├── query.py                # /api/ai/query
│   │   └── forecast.py             # /api/ai/forecast/*
│   ├── services/
│   │   ├── ocr_service.py          # Vision + GPT-4o pipeline
│   │   ├── voice_service.py        # Whisper + parsing
│   │   ├── query_service.py        # NL queries with function calling
│   │   ├── forecast_service.py     # Statistical forecasting
│   │   └── anomaly_service.py      # Shrinkage + expense anomalies
│   ├── workers/
│   │   ├── celery_app.py           # Celery + Redis
│   │   ├── ocr_tasks.py            # Async OCR processing
│   │   └── forecast_tasks.py       # Scheduled forecasting
│   ├── clients/
│   │   ├── inventory_client.py     # HTTP client → Inventory Service
│   │   ├── finance_client.py       # HTTP client → Finance Service
│   │   └── rabbitmq_client.py      # Event publishing
│   └── schemas/
│       ├── ocr.py
│       ├── voice.py
│       └── query.py
├── requirements.txt
└── Dockerfile
```

---

## 4.4 OCR Pipeline Implementation

```python
# services/ocr_service.py

import asyncio
import base64
import json
from io import BytesIO
from PIL import Image, ImageEnhance, ImageFilter
from google.cloud import vision
import openai
from app.clients.inventory_client import InventoryClient

class OCRService:

    def __init__(self):
        self.vision_client = vision.ImageAnnotatorClient()
        self.openai_client = openai.AsyncOpenAI()
        self.inventory_client = InventoryClient()

    def preprocess_image(self, image_bytes: bytes) -> bytes:
        """Enhance handwriting visibility"""
        img = Image.open(BytesIO(image_bytes)).convert('L')
        img = ImageEnhance.Contrast(img).enhance(2.0)
        img = ImageEnhance.Sharpness(img).enhance(2.0)
        img = img.filter(ImageFilter.SHARPEN)
        buf = BytesIO()
        img.save(buf, format='JPEG', quality=95)
        return buf.getvalue()

    async def extract_text(self, image_bytes: bytes) -> str:
        """Google Cloud Vision — document_text_detection for dense text"""
        image = vision.Image(content=image_bytes)
        response = self.vision_client.document_text_detection(image=image)
        if response.error.message:
            raise RuntimeError(f"Vision API error: {response.error.message}")
        return response.full_text_annotation.text

    async def parse_with_gpt4o(
        self,
        raw_text: str,
        image_bytes: bytes,
        context_type: str,
        known_items: list[str]
    ) -> dict:
        """GPT-4o contextual correction and structuring"""

        system_prompts = {
            "inventory": f"""You are a restaurant inventory data extractor.
Extract structured data from handwritten inventory notebook pages.
Known items in this restaurant: {', '.join(known_items[:50])}

Return ONLY valid JSON:
{{
  "items": [
    {{"name": "string", "quantity": number, "unit": "string",
      "date": "YYYY-MM-DD or null", "cost_per_unit": number or null,
      "notes": "string or null"}}
  ],
  "confidence": 0.0-1.0,
  "unreadable_sections": ["describe what could not be read"]
}}

Rules:
- Use known items list to fix spelling
- Prefer restaurant units: kg, grams, litres, ml, pieces, dozen
- If date unclear, use null
- confidence = average readability of the page""",

            "expense": f"""You are a restaurant expense extractor.
Extract expenses from handwritten notes.

Return ONLY valid JSON:
{{
  "expenses": [
    {{"description": "string", "amount": number,
      "payee": "string or null", "date": "YYYY-MM-DD or null"}}
  ],
  "confidence": 0.0-1.0
}}"""
        }

        image_b64 = base64.b64encode(image_bytes).decode()
        response = await self.openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompts.get(context_type, system_prompts["inventory"])},
                {"role": "user", "content": [
                    {"type": "text", "text": f"OCR extracted text:\n{raw_text}\n\nAlso analyze the image:"},
                    {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}}
                ]}
            ],
            max_tokens=1500,
            response_format={"type": "json_object"},
            temperature=0.1  # low temperature for extraction tasks
        )
        return json.loads(response.choices[0].message.content)

    async def match_to_catalog(
        self,
        extracted_items: list[dict],
        tenant_id: str
    ) -> dict:
        """Match extracted item names to inventory catalog"""
        catalog = await self.inventory_client.get_tenant_items(tenant_id)
        catalog_names = {item['name'].lower(): item for item in catalog}

        matched = []
        unmatched = []

        for extracted in extracted_items:
            name_lower = extracted['name'].lower()
            # Exact match
            if name_lower in catalog_names:
                matched.append({
                    **extracted,
                    "matched_item_id": catalog_names[name_lower]['id'],
                    "matched_name": catalog_names[name_lower]['name'],
                    "match_confidence": 1.0,
                    "match_type": "exact"
                })
                continue

            # Fuzzy match using GPT-4o-mini (cheap)
            best_match = await self._fuzzy_match(
                extracted['name'],
                list(catalog_names.keys())
            )
            if best_match and best_match['confidence'] > 0.85:
                matched.append({
                    **extracted,
                    "matched_item_id": catalog_names[best_match['name']]['id'],
                    "matched_name": catalog_names[best_match['name']]['name'],
                    "match_confidence": best_match['confidence'],
                    "match_type": "fuzzy"
                })
            else:
                unmatched.append(extracted)

        return {"matched": matched, "unmatched": unmatched}
```

---

## 4.5 Celery Task — Async OCR Processing

```python
# workers/ocr_tasks.py

from app.workers.celery_app import celery_app
from app.services.ocr_service import OCRService
from app.clients.rabbitmq_client import RabbitMQClient

@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=10,
    name="ocr.process_notebook"
)
def process_notebook_ocr(
    self,
    job_id: str,
    tenant_id: str,
    user_id: str,
    image_url: str,
    context_type: str
):
    import asyncio
    loop = asyncio.get_event_loop()
    try:
        loop.run_until_complete(
            _process_notebook_ocr_async(job_id, tenant_id, user_id, image_url, context_type)
        )
    except Exception as exc:
        self.retry(exc=exc)

async def _process_notebook_ocr_async(job_id, tenant_id, user_id, image_url, context_type):
    service = OCRService()
    db = get_db_session()

    try:
        # Update job status
        await db.execute("UPDATE ai_jobs SET status='processing' WHERE id=$1", job_id)

        # 1. Download image from Supabase Storage
        image_bytes = await download_from_storage(image_url)

        # 2. Preprocess
        processed = service.preprocess_image(image_bytes)

        # 3. Google Cloud Vision
        raw_text = await service.extract_text(processed)

        # 4. Get tenant's item catalog for matching
        inventory_client = InventoryClient()
        known_items = await inventory_client.get_item_names(tenant_id)

        # 5. GPT-4o structuring
        parsed = await service.parse_with_gpt4o(
            raw_text, processed, context_type, known_items
        )

        # 6. Match to catalog
        if context_type == "inventory":
            matched = await service.match_to_catalog(
                parsed.get("items", []), tenant_id
            )
            result = {**parsed, **matched}
        else:
            result = parsed

        # 7. Update job with result
        await db.execute(
            "UPDATE ai_jobs SET status='completed', result=$1, completed_at=NOW() WHERE id=$2",
            json.dumps(result), job_id
        )

        # 8. Publish completion event
        await RabbitMQClient().publish("ai.ocr.completed", {
            "job_id": job_id,
            "tenant_id": tenant_id,
            "user_id": user_id,
            "context_type": context_type,
            "result": result
        })

    except Exception as e:
        await db.execute(
            "UPDATE ai_jobs SET status='failed', error_message=$1 WHERE id=$2",
            str(e), job_id
        )
        raise
```

---

## 4.6 Voice Transcription Service

```python
# services/voice_service.py

class VoiceService:

    async def transcribe(self, audio_bytes: bytes, language: str = "en") -> str:
        client = openai.AsyncOpenAI()
        # Domain-specific prompt helps Whisper with restaurant terms
        prompt = ("Restaurant kitchen context. Common ingredients: "
                  "chicken, tomatoes, onions, cream, flour, rice, dal, paneer. "
                  "Quantities in kg, grams, litres, pieces.")
        response = await client.audio.transcriptions.create(
            model="whisper-1",
            file=("audio.wav", audio_bytes, "audio/wav"),
            language=language if language != "en" else None,
            prompt=prompt,
            response_format="text"
        )
        return response

    async def parse_command(
        self,
        transcript: str,
        command_type: str,
        known_items: list[str]
    ) -> dict:
        """GPT-4o-mini — cheap, fast, good for structured extraction"""
        client = openai.AsyncOpenAI()

        schemas = {
            "waste": '{"item":"string","quantity":number,"unit":"string","reason":"spoilage|prep_waste|overproduction|cooking_error|contamination","station":"string or null"}',
            "stock_count": '{"item":"string","quantity":number,"unit":"string"}',
            "receipt": '{"item":"string","quantity":number,"unit":"string","cost_per_unit":"number or null"}'
        }

        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "system",
                "content": f"""Parse restaurant kitchen voice command.
Known items: {', '.join(known_items[:30])}
Command type: {command_type}
Return ONLY JSON matching: {schemas.get(command_type, schemas['stock_count'])}
Match item name to closest known item."""
            }, {
                "role": "user",
                "content": transcript
            }],
            max_tokens=150,
            response_format={"type": "json_object"},
            temperature=0
        )
        return json.loads(response.choices[0].message.content)
```

---

## 4.7 Natural Language Query Service

```python
# services/query_service.py

FINANCE_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_expense_total",
            "description": "Get total expenses for a category or vendor in a date range",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "account name or type e.g. 'proteins', 'cogs'"},
                    "vendor_name": {"type": "string"},
                    "start_date": {"type": "string", "format": "date"},
                    "end_date": {"type": "string", "format": "date"}
                },
                "required": ["start_date", "end_date"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_revenue_summary",
            "description": "Get revenue figures for a period",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {"type": "string"},
                    "end_date": {"type": "string"},
                    "breakdown": {"type": "boolean", "description": "Include food/beverage breakdown"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_food_cost_percent",
            "description": "Calculate food cost percentage for a period",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {"type": "string"},
                    "end_date": {"type": "string"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_waste_analysis",
            "description": "Get waste cost and breakdown for a period",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {"type": "string"},
                    "end_date": {"type": "string"},
                    "group_by": {"type": "string", "enum": ["reason", "item", "station"]}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_item_consumption",
            "description": "Get how much of a specific inventory item was used or wasted",
            "parameters": {
                "type": "object",
                "properties": {
                    "item_name": {"type": "string"},
                    "start_date": {"type": "string"},
                    "end_date": {"type": "string"}
                }
            }
        }
    }
]

class QueryService:

    async def answer(self, tenant_id: str, question: str, currency: str = "INR") -> dict:
        from datetime import date
        client = openai.AsyncOpenAI()
        currency_symbol = "₹" if currency == "INR" else "$"

        messages = [
            {"role": "system", "content": f"""You are a restaurant financial assistant.
Today: {date.today()}. Currency: {currency} ({currency_symbol}).
Use available tools to answer questions. Be concise. Format money as {currency_symbol}X,XXX.
Mention percentage changes when comparing periods."""},
            {"role": "user", "content": question}
        ]

        # First pass — tool selection
        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            tools=FINANCE_TOOLS,
            tool_choice="auto",
            max_tokens=500
        )

        if not response.choices[0].message.tool_calls:
            return {"answer": response.choices[0].message.content, "data": None}

        # Execute tool calls
        messages.append(response.choices[0].message)
        for tool_call in response.choices[0].message.tool_calls:
            result = await self._execute_tool(tenant_id, tool_call)
            messages.append({
                "role": "tool",
                "tool_call_id": tool_call.id,
                "content": json.dumps(result)
            })

        # Second pass — generate human answer
        final = await client.chat.completions.create(
            model="gpt-4o",
            messages=messages,
            max_tokens=300
        )

        return {
            "answer": final.choices[0].message.content,
            "data": self._extract_chart_data(messages)
        }

    async def _execute_tool(self, tenant_id: str, tool_call) -> dict:
        name = tool_call.function.name
        args = json.loads(tool_call.function.arguments)

        if name == "get_expense_total":
            return await self.finance_client.get_expense_total(tenant_id, **args)
        elif name == "get_revenue_summary":
            return await self.finance_client.get_revenue_summary(tenant_id, **args)
        elif name == "get_food_cost_percent":
            return await self.finance_client.get_food_cost_percent(tenant_id, **args)
        elif name == "get_waste_analysis":
            return await self.inventory_client.get_waste_analysis(tenant_id, **args)
        elif name == "get_item_consumption":
            return await self.inventory_client.get_item_consumption(tenant_id, **args)
        return {"error": "Unknown tool"}
```

---

## 4.8 API Endpoints — AI Service

```
POST /api/ai/ocr/notebook
Body: multipart/form-data { image, context_type, target_date }
Response: { job_id, estimated_seconds: 8 }

GET  /api/ai/ocr/notebook/{job_id}
Response: { status, result: { matched, unmatched, confidence } }

POST /api/ai/ocr/notebook/{job_id}/commit
Body: { items_to_update, expenses_to_create, items_to_create }
→ Calls Inventory/Finance services to apply changes

POST /api/ai/voice/transcribe
Body: multipart/form-data { audio, command_type, language }
Response: { transcript, parsed: { item, quantity, unit, reason, confidence } }

POST /api/ai/query
Body: { question }
Response: { answer: "string", data: { type, values } }

GET  /api/ai/forecast/{item_id}
Query: ?days=7
Response: { item_name, forecast: [...], suggested_order_quantity }

GET  /api/ai/anomalies
Response: { inventory_anomalies: [...], finance_anomalies: [...] }
```

---

---

# SERVICE 7: NOTIFICATION SERVICE
**Technology:** Node.js 22 + Fastify 4 + TypeScript + amqplib

---

## 4.9 Responsibility

Dispatch-only service. Listens to RabbitMQ events from all other services, translates them into the appropriate delivery channel (push, email, WhatsApp link), and stores the notification record. Has no business logic — it only knows how to send messages.

---

## 4.10 Database Schema

```sql
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL,
    user_id     UUID,           -- NULL = all users in tenant
    type        VARCHAR(100) NOT NULL,
    priority    VARCHAR(20) NOT NULL DEFAULT 'informational'
                CHECK (priority IN ('critical','important','informational')),
    title       VARCHAR(255) NOT NULL,
    body        TEXT NOT NULL,
    data        JSONB NOT NULL DEFAULT '{}',
    channels    JSONB NOT NULL DEFAULT '[]',  -- ['push', 'email']
    read_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at);

CREATE TABLE device_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    tenant_id   UUID NOT NULL,
    token       VARCHAR(500) NOT NULL UNIQUE,
    platform    VARCHAR(20) NOT NULL CHECK (platform IN ('ios','android','web')),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);
CREATE INDEX idx_device_tokens_user ON device_tokens(user_id) WHERE is_active = TRUE;
```

---

## 4.11 Event Consumers

```typescript
// src/consumers/event.consumer.ts

import amqplib from 'amqplib';
import { NotificationDispatcher } from '../providers/dispatcher';

const EVENT_HANDLERS: Record<string, NotificationTemplate> = {
  'auth.user.registered': {
    title: 'Welcome to KitchenLedger!',
    body: 'Your account is ready. Start by adding your inventory.',
    priority: 'informational',
    channels: ['email'],
    emailTemplate: 'welcome'
  },
  'auth.user.invited': {
    title: 'You have been invited',
    body: (payload) => `${payload.inviter_name} invited you to join ${payload.restaurant_name}`,
    priority: 'important',
    channels: ['email'],
    emailTemplate: 'invitation'
  },
  'inventory.stock.low': {
    title: 'Low Stock Alert',
    body: (payload) => `${payload.item_name} is running low (${payload.current_stock} ${payload.unit} remaining)`,
    priority: 'important',
    channels: ['push'],
    targetRole: ['owner', 'manager']
  },
  'inventory.stock.expiring': {
    title: 'Item Expiring Soon',
    body: (payload) => `${payload.item_name} expires in ${payload.days_remaining} day(s)`,
    priority: 'important',
    channels: ['push'],
    targetRole: ['owner', 'manager', 'kitchen_staff']
  },
  'finance.dsr.reconciled': {
    title: 'Daily Report Reconciled',
    body: (payload) => `Sales report for ${payload.date} reconciled. Net sales: ${payload.currency}${payload.net_sales}`,
    priority: 'informational',
    channels: ['push'],
    targetRole: ['owner']
  },
  'finance.payment.overdue': {
    title: 'Payment Overdue',
    body: (payload) => `Payment to ${payload.vendor_name} is overdue (${payload.currency}${payload.amount})`,
    priority: 'critical',
    channels: ['push', 'email'],
    targetRole: ['owner']
  },
  'report.generated': {
    title: 'Your Report is Ready',
    body: (payload) => `${payload.report_name} has been generated and is ready to download`,
    priority: 'informational',
    channels: ['push', 'email'],
    targetRole: ['owner']
  }
};

export class EventConsumer {
  async start(connection: amqplib.Connection) {
    const channel = await connection.createChannel();
    await channel.assertExchange('kitchenledger.events', 'topic', { durable: true });

    const { queue } = await channel.assertQueue('notification-service', { durable: true });

    // Bind to all event types this service handles
    for (const eventType of Object.keys(EVENT_HANDLERS)) {
      await channel.bindQueue(queue, 'kitchenledger.events', eventType);
    }

    channel.consume(queue, async (msg) => {
      if (!msg) return;
      try {
        const event = JSON.parse(msg.content.toString());
        const handler = EVENT_HANDLERS[event.event_type];
        if (handler) {
          await this.processEvent(event, handler);
        }
        channel.ack(msg);
      } catch (err) {
        // Dead-letter after 3 retries
        channel.nack(msg, false, false);
      }
    });
  }

  private async processEvent(event: any, template: NotificationTemplate) {
    const tenantId = event.tenant_id;
    const payload = event.payload;

    // 1. Resolve target users (by role from Auth Service)
    const users = await this.authClient.getUsersByRole(
      tenantId, template.targetRole
    );

    // 2. Create notification record per user
    for (const user of users) {
      const notification = await this.notificationRepo.create({
        tenantId,
        userId: user.id,
        type: event.event_type,
        priority: template.priority,
        title: typeof template.title === 'function' ? template.title(payload) : template.title,
        body: typeof template.body === 'function' ? template.body(payload) : template.body,
        data: payload,
        channels: template.channels
      });

      // 3. Dispatch to channels
      if (template.channels.includes('push')) {
        await this.dispatcher.sendPush(user.id, notification);
      }
      if (template.channels.includes('email') && template.emailTemplate) {
        await this.dispatcher.sendEmail(user.email, template.emailTemplate, payload);
      }
    }
  }
}
```

---

## 4.12 Push Notification Dispatcher

```typescript
// src/providers/expo-push.provider.ts

import { Expo, ExpoPushMessage } from 'expo-server-sdk';

export class ExpoPushProvider {
  private expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

  async send(userId: string, notification: Notification): Promise<void> {
    const tokens = await this.tokenRepo.getActiveTokens(userId);
    const messages: ExpoPushMessage[] = tokens
      .filter(t => Expo.isExpoPushToken(t.token))
      .map(t => ({
        to: t.token,
        title: notification.title,
        body: notification.body,
        data: notification.data,
        priority: notification.priority === 'critical' ? 'high' : 'normal',
        sound: notification.priority === 'critical' ? 'default' : undefined,
        badge: 1
      }));

    if (messages.length === 0) return;

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        const receipts = await this.expo.sendPushNotificationsAsync(chunk);
        // Handle failed tokens (remove from DB)
        await this.handleReceipts(receipts, tokens);
      } catch (err) {
        console.error('Push notification failed:', err);
      }
    }
  }
}
```

---

## 4.13 API Endpoints — Notification Service

```
GET  /api/notifications              list for current user (paginated)
PATCH /api/notifications/{id}/read
PATCH /api/notifications/read-all
GET  /api/notifications/unread-count

POST /api/notifications/devices      register device token
DELETE /api/notifications/devices/{token}  unregister

INTERNAL
POST /internal/notifications/send    direct send (from other services if needed)
```

---

---

# SERVICE 8: REPORT SERVICE
**Technology:** Python 3.12 + FastAPI 0.115 + Celery + pandas + reportlab

---

## 4.14 Responsibility

Generates heavy, time-consuming reports that would block API responses if done synchronously. Reads from a PostgreSQL read replica (not the write primary) to avoid impacting operational performance. Outputs PDF or CSV to Supabase Storage and notifies the user via event.

---

## 4.15 Database Schema

```sql
CREATE TABLE report_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    requested_by    UUID NOT NULL,
    report_type     VARCHAR(50) NOT NULL
                    CHECK (report_type IN ('pl_monthly','pl_custom','waste_monthly',
                                          'inventory_valuation','expense_breakdown',
                                          'gst_summary','menu_engineering')),
    status          VARCHAR(20) NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','processing','completed','failed')),
    parameters      JSONB NOT NULL DEFAULT '{}',
    output_url      VARCHAR(500),       -- Supabase Storage URL when done
    output_format   VARCHAR(10) NOT NULL DEFAULT 'pdf' CHECK (output_format IN ('pdf','csv','excel')),
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);
CREATE INDEX idx_report_jobs_tenant ON report_jobs(tenant_id, created_at DESC);
```

---

## 4.16 Report Generation

```python
# workers/report_tasks.py

from celery import Task
from app.generators.pl_generator import PLReportGenerator
from app.generators.waste_generator import WasteReportGenerator
import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet

@celery_app.task(bind=True)
def generate_report(self, job_id: str):
    """Generates any report type based on job configuration"""
    job = get_report_job(job_id)
    try:
        update_job_status(job_id, 'processing')
        generator = get_generator(job.report_type)
        output_bytes = generator.generate(job.tenant_id, job.parameters)
        url = upload_to_storage(output_bytes, job.output_format, job_id)
        update_job_completed(job_id, url)
        publish_report_generated_event(job)
    except Exception as e:
        update_job_failed(job_id, str(e))
        raise


class PLReportGenerator:
    """Generates P&L report as PDF"""

    async def generate(self, tenant_id: str, params: dict) -> bytes:
        # 1. Fetch data from Finance Service (internal API)
        pl_data = await self.finance_client.get_pl_data(
            tenant_id,
            params['start_date'],
            params['end_date']
        )

        # 2. Build PDF with reportlab
        buf = BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4)
        styles = getSampleStyleSheet()
        elements = []

        # Title
        elements.append(Paragraph(
            f"Profit & Loss Report — {params['start_date']} to {params['end_date']}",
            styles['Title']
        ))

        # Revenue section table
        revenue_data = [
            ['Revenue', 'Amount', '% of Net Sales'],
            ['Food Sales', f"₹{pl_data['revenue']['food_sales']:,.2f}", ''],
            ['Beverage Sales', f"₹{pl_data['revenue']['beverage_sales']:,.2f}", ''],
            ['Net Sales', f"₹{pl_data['revenue']['net_sales']:,.2f}", '100%'],
        ]
        elements.append(self._styled_table(revenue_data))

        # Cost sections...
        # (Add COGS, Labor, Operating, Net Profit sections)

        doc.build(elements)
        return buf.getvalue()

    def _styled_table(self, data: list) -> Table:
        t = Table(data, colWidths=[250, 120, 120])
        t.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (-1,0), colors.HexColor('#1a1a2e')),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor('#f8f9fa')]),
            ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor('#dee2e6')),
            ('ALIGN', (1,0), (-1,-1), 'RIGHT'),
            ('FONTSIZE', (0,0), (-1,-1), 10),
            ('PADDING', (0,0), (-1,-1), 8),
        ]))
        return t
```

---

## 4.17 API Endpoints — Report Service

```
POST /api/reports/jobs             request report generation
Body: { report_type, parameters: { start_date, end_date, format }, output_format }
Response: { job_id, estimated_seconds }

GET  /api/reports/jobs             list past report jobs
GET  /api/reports/jobs/{id}        status + download URL when done
GET  /api/reports/jobs/{id}/download  redirect to Supabase Storage URL
```

---

---

# SERVICE 9: FILE SERVICE
**Technology:** Node.js 22 + Fastify 4 + TypeScript + sharp + @supabase/supabase-js

---

## 4.18 Responsibility

Handles all file uploads. Validates, compresses, and stores files in Supabase Storage. Generates pre-signed URLs for direct upload. Other services reference files by URL — they never handle binary data themselves.

---

## 4.19 Database Schema

```sql
CREATE TABLE file_uploads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    uploaded_by     UUID NOT NULL,
    original_name   VARCHAR(255) NOT NULL,
    storage_path    VARCHAR(500) NOT NULL UNIQUE,
    public_url      VARCHAR(500) NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    size_bytes      INT NOT NULL,
    context         VARCHAR(50) NOT NULL
                    CHECK (context IN ('receipt','waste_photo','notebook_scan',
                                       'avatar','invoice','product_image')),
    reference_id    UUID,       -- e.g. expense_id or waste_log_id
    reference_type  VARCHAR(50),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_file_uploads_tenant ON file_uploads(tenant_id, created_at DESC);
CREATE INDEX idx_file_uploads_reference ON file_uploads(reference_id) WHERE reference_id IS NOT NULL;
```

---

## 4.20 Upload Flow

```typescript
// src/routes/upload.routes.ts

// Flow 1: Direct upload via File Service (mobile — simpler)
fastify.post('/api/files/upload', async (request, reply) => {
  const { tenantId, userId } = extractHeaders(request);
  const data = await request.file();

  // Validate
  const allowedTypes = ['image/jpeg','image/png','image/webp','application/pdf'];
  if (!allowedTypes.includes(data.mimetype)) {
    return reply.code(400).send({ error: 'File type not allowed' });
  }
  if (data.file.bytesRead > 10 * 1024 * 1024) {
    return reply.code(400).send({ error: 'File too large (max 10MB)' });
  }

  let fileBuffer = await data.toBuffer();

  // Compress images
  if (data.mimetype.startsWith('image/')) {
    fileBuffer = await sharp(fileBuffer)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
  }

  // Upload to Supabase Storage
  const storagePath = `${tenantId}/${context}/${uuidv4()}.jpg`;
  const { data: uploaded, error } = await supabase.storage
    .from('kitchenledger-files')
    .upload(storagePath, fileBuffer, {
      contentType: 'image/jpeg',
      cacheControl: '3600'
    });

  if (error) throw error;

  const publicUrl = supabase.storage
    .from('kitchenledger-files')
    .getPublicUrl(storagePath).data.publicUrl;

  // Record in DB
  await db.query(
    `INSERT INTO file_uploads (tenant_id, uploaded_by, original_name,
     storage_path, public_url, mime_type, size_bytes, context)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [tenantId, userId, data.filename, storagePath, publicUrl,
     'image/jpeg', fileBuffer.length, request.query.context]
  );

  return reply.send({ success: true, data: { url: publicUrl, storage_path: storagePath } });
});

// Flow 2: Pre-signed URL for web (client uploads directly to Supabase)
fastify.post('/api/files/presign', async (request, reply) => {
  const { context, filename, mime_type } = request.body;
  const storagePath = `${tenantId}/${context}/${uuidv4()}_${filename}`;

  const { data, error } = await supabase.storage
    .from('kitchenledger-files')
    .createSignedUploadUrl(storagePath);

  return reply.send({
    success: true,
    data: {
      upload_url: data.signedUrl,
      storage_path: storagePath,
      token: data.token
    }
  });
});
```

---

## 4.21 API Endpoints — File Service

```
POST /api/files/upload          direct upload (mobile)
POST /api/files/presign         get pre-signed upload URL (web)
GET  /api/files/{id}            file metadata
DELETE /api/files/{id}          soft delete (owner only)
GET  /api/files/by-reference/{type}/{id}  all files for an entity
```
# KitchenLedger TRD v2 — Part 5
# Frontend Architecture, Build Sequence & Claude Code Instructions

---

# PART 5: FRONTEND ARCHITECTURE

---

## 5.1 Web App (Next.js 14)

**Technology:** Next.js 14 App Router + TypeScript + Tailwind CSS + shadcn/ui

### Structure

```
apps/web/
├── app/
│   ├── (auth)/                     # No sidebar layout
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── setup/page.tsx          # Onboarding wizard
│   └── (dashboard)/                # Sidebar layout
│       ├── layout.tsx              # Sidebar + topbar + auth guard
│       ├── page.tsx                # Home dashboard
│       ├── inventory/
│       │   ├── page.tsx            # Item list
│       │   ├── items/[id]/page.tsx # Item detail
│       │   ├── suppliers/page.tsx
│       │   ├── purchase-orders/page.tsx
│       │   ├── purchase-orders/new/page.tsx
│       │   ├── receipts/page.tsx
│       │   ├── receipts/new/page.tsx
│       │   ├── counts/page.tsx
│       │   ├── counts/[id]/page.tsx
│       │   ├── waste/page.tsx
│       │   ├── recipes/page.tsx
│       │   └── menu-engineering/page.tsx
│       ├── finance/
│       │   ├── page.tsx            # Finance dashboard
│       │   ├── daily-reports/page.tsx
│       │   ├── daily-reports/[date]/page.tsx
│       │   ├── expenses/page.tsx
│       │   ├── vendors/page.tsx
│       │   ├── accounts-payable/page.tsx
│       │   └── reports/page.tsx    # P&L + other reports
│       ├── staff/
│       │   ├── page.tsx            # Staff dashboard (schedule view)
│       │   ├── employees/page.tsx  # Employee list
│       │   ├── employees/[id]/page.tsx
│       │   ├── schedule/page.tsx   # Weekly schedule builder
│       │   ├── attendance/page.tsx # Timesheet + clock-in records
│       │   ├── tasks/page.tsx      # Task checklist view
│       │   ├── tips/page.tsx       # Tip pool management
│       │   └── performance/page.tsx
│       ├── ai/
│       │   ├── notebook-scan/page.tsx
│       │   └── query/page.tsx
│       └── settings/
│           ├── page.tsx            # Profile
│           ├── team/page.tsx
│           ├── operations/page.tsx
│           └── accounts/page.tsx   # Chart of accounts
├── components/
│   ├── ui/                         # shadcn/ui base components
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Topbar.tsx
│   │   └── RoleGuard.tsx
│   ├── inventory/
│   │   ├── InventoryTable.tsx
│   │   ├── ItemEditDrawer.tsx
│   │   ├── StockCountSession.tsx
│   │   ├── WasteLogForm.tsx
│   │   ├── POCreateForm.tsx
│   │   ├── ReceiptForm.tsx
│   │   └── RecipeEditor.tsx
│   ├── finance/
│   │   ├── DSRWizard.tsx           # 4-step DSR entry
│   │   ├── ExpenseForm.tsx
│   │   ├── PLReport.tsx
│   │   ├── APAgingTable.tsx
│   │   └── UPIQRModal.tsx
│   ├── ai/
│   │   ├── NotebookScanner.tsx
│   │   ├── OCRConfirmationUI.tsx
│   │   └── QueryBar.tsx
│   └── shared/
│       ├── DataTable.tsx           # Reusable paginated table
│       ├── DateRangePicker.tsx
│       ├── ConfirmDialog.tsx
│       ├── FileUploadZone.tsx
│       └── KPICard.tsx
├── lib/
│   ├── api/
│   │   ├── client.ts               # Axios with interceptors
│   │   ├── auth.api.ts
│   │   ├── inventory.api.ts
│   │   ├── finance.api.ts
│   │   ├── ai.api.ts
│   │   └── files.api.ts
│   └── utils.ts
├── hooks/
│   ├── use-auth.ts
│   ├── use-inventory.ts
│   ├── use-finance.ts
│   └── use-realtime.ts             # Supabase Realtime hook
└── stores/
    ├── auth.store.ts               # Zustand — user + tenant
    └── ui.store.ts                 # Sidebar state, theme
```

### API Client Pattern

```typescript
// lib/api/client.ts

import axios from 'axios';
import { useAuthStore } from '@/stores/auth.store';

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080',
  headers: { 'Content-Type': 'application/json' }
});

// Inject token on every request
apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-refresh on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retried) {
      error.config._retried = true;
      try {
        await useAuthStore.getState().refreshToken();
        return apiClient(error.config);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// lib/api/inventory.api.ts (example)
export const inventoryApi = {
  items: {
    list: (params: ItemListParams) =>
      apiClient.get<PagedResponse<InventoryItem>>('/api/inventory/items', { params }),
    get: (id: string) =>
      apiClient.get<ApiResponse<InventoryItemDetail>>(`/api/inventory/items/${id}`),
    create: (data: CreateItemRequest) =>
      apiClient.post<ApiResponse<InventoryItem>>('/api/inventory/items', data),
    update: (id: string, data: UpdateItemRequest) =>
      apiClient.patch<ApiResponse<InventoryItem>>(`/api/inventory/items/${id}`, data),
    delete: (id: string) =>
      apiClient.delete(`/api/inventory/items/${id}`),
    byBarcode: (barcode: string) =>
      apiClient.get<ApiResponse<InventoryItem>>(`/api/inventory/items/by-barcode/${barcode}`),
  },
  waste: {
    log: (data: WasteLogRequest) =>
      apiClient.post<ApiResponse<WasteLog>>('/api/inventory/waste', data),
    list: (params: WasteListParams) =>
      apiClient.get<PagedResponse<WasteLog>>('/api/inventory/waste', { params }),
    report: (params: WasteReportParams) =>
      apiClient.get('/api/inventory/waste/report', { params }),
  },
  // ... other resources
};
```

### Role Guard Component

```typescript
// components/layout/RoleGuard.tsx

'use client';
import { useAuthStore } from '@/stores/auth.store';
import { redirect } from 'next/navigation';

type Role = 'owner' | 'manager' | 'kitchen_staff' | 'server';

interface RoleGuardProps {
  allowedRoles: Role[];
  fallback?: React.ReactNode;
  redirectTo?: string;
  children: React.ReactNode;
}

export function RoleGuard({ allowedRoles, fallback, redirectTo, children }: RoleGuardProps) {
  const { user } = useAuthStore();
  if (!user) return null;
  if (!allowedRoles.includes(user.role as Role)) {
    if (redirectTo) redirect(redirectTo);
    return fallback ?? null;
  }
  return <>{children}</>;
}

// Usage:
// <RoleGuard allowedRoles={['owner']}>
//   <PLReportPage />
// </RoleGuard>
```

### Supabase Realtime Hook

```typescript
// hooks/use-realtime.ts
// Used for live DSR updates, inventory alert count, notification badge

import { createClient } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth.store';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export function useRealtimeDSR(date: string, onUpdate: (dsr: any) => void) {
  const { tenant } = useAuthStore();
  useEffect(() => {
    if (!tenant?.id) return;
    const channel = supabase
      .channel(`dsr:${tenant.id}:${date}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'daily_sales_reports',
        filter: `tenant_id=eq.${tenant.id}`
      }, (payload) => onUpdate(payload.new))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenant?.id, date]);
}
```

---

## 5.2 Mobile App (Expo React Native)

**Technology:** Expo SDK 51 + React Native + TypeScript + Expo Router + WatermelonDB

### Structure

```
apps/mobile/
├── app/
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── setup/             # Onboarding wizard screens
│   └── (tabs)/                # Bottom tab navigation
│       ├── _layout.tsx        # Tab bar config
│       ├── dashboard.tsx      # Home
│       ├── inventory/
│       │   ├── index.tsx      # Item list (grouped by location)
│       │   ├── count.tsx      # Stock count workflow
│       │   ├── waste.tsx      # Waste log (PRIMARY daily screen)
│       │   ├── receive.tsx    # Receive delivery
│       │   └── scan.tsx       # Barcode scanner
│       └── finance/
│           ├── index.tsx      # Finance overview
│           ├── daily-report.tsx
│           └── expense.tsx    # Quick expense entry
├── components/
│   ├── inventory/
│   │   ├── CountItemRow.tsx   # Single item row in count session
│   │   ├── WasteQuickLog.tsx  # One-tap waste form
│   │   └── VoiceInput.tsx     # Hold-to-record button
│   ├── finance/
│   │   └── DSRForm.tsx
│   └── shared/
│       ├── OfflineBanner.tsx
│       └── NumberPad.tsx      # Large number pad for kitchen use
├── lib/
│   ├── api/                   # Same axios client as web
│   ├── watermelon/
│   │   ├── schema.ts          # WatermelonDB schema
│   │   ├── models/            # WatermelonDB model classes
│   │   └── sync.ts            # Sync engine
│   └── storage.ts             # Expo SecureStore wrapper
└── hooks/
    ├── use-offline-sync.ts
    └── use-barcode.ts
```

### WatermelonDB Offline Schema

```typescript
// lib/watermelon/schema.ts

import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'inventory_items',
      columns: [
        { name: 'server_id', type: 'string', isIndexed: true },
        { name: 'tenant_id', type: 'string', isIndexed: true },
        { name: 'name', type: 'string' },
        { name: 'category', type: 'string', isOptional: true },
        { name: 'abc_category', type: 'string' },
        { name: 'current_stock', type: 'number' },
        { name: 'par_level', type: 'number', isOptional: true },
        { name: 'count_unit', type: 'string' },
        { name: 'storage_location', type: 'string', isOptional: true },
        { name: 'is_perishable', type: 'boolean' },
        { name: 'avg_cost', type: 'number' },
        { name: 'synced_at', type: 'number' },
      ]
    }),
    tableSchema({
      name: 'waste_logs_pending',     // pending sync
      columns: [
        { name: 'inventory_item_id', type: 'string' },
        { name: 'quantity', type: 'number' },
        { name: 'unit', type: 'string' },
        { name: 'reason', type: 'string' },
        { name: 'station', type: 'string', isOptional: true },
        { name: 'photo_url', type: 'string', isOptional: true },
        { name: 'notes', type: 'string', isOptional: true },
        { name: 'logged_at', type: 'number' },
        { name: 'synced', type: 'boolean' },
      ]
    }),
    tableSchema({
      name: 'count_session_items',    // in-progress count
      columns: [
        { name: 'count_session_id', type: 'string' },
        { name: 'inventory_item_id', type: 'string' },
        { name: 'server_count_item_id', type: 'string', isOptional: true },
        { name: 'counted_quantity', type: 'number', isOptional: true },
        { name: 'unit', type: 'string' },
        { name: 'synced', type: 'boolean' },
      ]
    }),
  ]
});
```

### Sync Engine

```typescript
// lib/watermelon/sync.ts

import { synchronize } from '@nozbe/watermelondb/sync';
import { database } from './database';
import { apiClient } from '../api/client';

export async function syncWithServer(): Promise<void> {
  await synchronize({
    database,
    pullChanges: async ({ lastPulledAt }) => {
      const { data } = await apiClient.get('/api/inventory/sync/pull', {
        params: { last_pulled_at: lastPulledAt }
      });
      return data; // { changes: { inventory_items: { created, updated, deleted } }, timestamp }
    },
    pushChanges: async ({ changes }) => {
      // Push pending waste logs
      const pendingWaste = changes.waste_logs_pending?.created || [];
      for (const log of pendingWaste) {
        await apiClient.post('/api/inventory/waste', log);
      }
      // Push pending count updates
      const pendingCounts = changes.count_session_items?.updated || [];
      for (const item of pendingCounts) {
        if (item.server_count_item_id && item.counted_quantity != null) {
          await apiClient.patch(
            `/api/inventory/counts/${item.count_session_id}/items/${item.server_count_item_id}`,
            { counted_quantity: item.counted_quantity }
          );
        }
      }
    },
    migrationsEnabledAtVersion: 1,
  });
}

// Run sync on app foreground + every 5 minutes when online
export function startSyncScheduler() {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') syncWithServer().catch(console.error);
  });
  setInterval(() => syncWithServer().catch(console.error), 5 * 60 * 1000);
}
```

---

## 5.3 Shared Packages

### packages/types — Generated TypeScript Types

```bash
# After starting all services:
# Auto-generate types from OpenAPI specs

# Aggregate all OpenAPI specs
curl http://localhost:8081/v3/api-docs > /tmp/auth-spec.json
curl http://localhost:8082/v3/api-docs > /tmp/inventory-spec.json
curl http://localhost:8083/v3/api-docs > /tmp/finance-spec.json
curl http://localhost:8084/openapi.json > /tmp/ai-spec.json

# Generate TypeScript types
npx openapi-typescript /tmp/auth-spec.json -o packages/types/auth.d.ts
npx openapi-typescript /tmp/inventory-spec.json -o packages/types/inventory.d.ts
npx openapi-typescript /tmp/finance-spec.json -o packages/types/finance.d.ts
npx openapi-typescript /tmp/ai-spec.json -o packages/types/ai.d.ts
```

---

# PART 5B: ERROR HANDLING STANDARDS

All services use the same error envelope format. No service ever returns
a different error shape. Build these handlers in Phase 0 (Gateway/Node.js)
and Phase 1 (Java), Phase 5 (Python).

## Error Response Envelope

```json
{
  "success": false,
  "error": {
    "code": "SCREAMING_SNAKE_CASE_STRING",
    "message": "Human readable description",
    "field_errors": { "field_name": "error message" }
  }
}
```
`field_errors` is present **only** on validation errors (HTTP 422).

---

## Java (@RestControllerAdvice — all 4 Java services)

```java
// exception/GlobalExceptionHandler.java

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(NotFoundException ex) {
        return ResponseEntity.status(404).body(ErrorResponse.of(
            "NOT_FOUND", ex.getMessage()
        ));
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ErrorResponse> handleConflict(ConflictException ex) {
        return ResponseEntity.status(409).body(ErrorResponse.of(
            "CONFLICT", ex.getMessage()
        ));
    }

    @ExceptionHandler(ValidationException.class)
    public ResponseEntity<ErrorResponse> handleValidation(ValidationException ex) {
        return ResponseEntity.status(422).body(ErrorResponse.ofFieldError(
            "VALIDATION_ERROR", ex.getMessage(),
            ex.getField(), ex.getFieldMessage()
        ));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleBeanValidation(
            MethodArgumentNotValidException ex) {
        Map<String, String> fieldErrors = new LinkedHashMap<>();
        ex.getBindingResult().getFieldErrors().forEach(e ->
            fieldErrors.put(e.getField(), e.getDefaultMessage()));
        return ResponseEntity.status(422).body(ErrorResponse.ofFieldErrors(
            "VALIDATION_ERROR", "Request validation failed", fieldErrors
        ));
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleForbidden(AccessDeniedException ex) {
        return ResponseEntity.status(403).body(ErrorResponse.of(
            "FORBIDDEN", ex.getMessage()
        ));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleUnexpected(Exception ex) {
        log.error("Unexpected error", ex);
        return ResponseEntity.status(500).body(ErrorResponse.of(
            "INTERNAL_ERROR", "An unexpected error occurred"
        ));
    }
}
```

Build in **Phase 1** for all Java services.

---

## FastAPI (global exception handler — ai-service, report-service)

```python
# app/main.py

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError

app = FastAPI()

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    field_errors = {}
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"][1:])
        field_errors[field] = error["msg"]
    return JSONResponse(status_code=422, content={
        "success": False,
        "error": {
            "code": "VALIDATION_ERROR",
            "message": "Request validation failed",
            "field_errors": field_errors
        }
    })

@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    if hasattr(exc, "status_code"):
        return JSONResponse(status_code=exc.status_code, content={
            "success": False,
            "error": {"code": "HTTP_ERROR", "message": str(exc.detail)}
        })
    return JSONResponse(status_code=500, content={
        "success": False,
        "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"}
    })
```

Build in **Phase 5** when AI Service gets real endpoints.

---

## Fastify (setErrorHandler — gateway, notification, file)

```typescript
// src/server.ts

fastify.setErrorHandler((error, request, reply) => {
  // Fastify validation errors
  if (error.validation) {
    const fieldErrors: Record<string, string> = {};
    error.validation.forEach((v: any) => {
      const field = v.instancePath.replace('/', '') || v.params?.missingProperty;
      if (field) fieldErrors[field] = v.message;
    });
    return reply.code(422).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Request validation failed',
               field_errors: fieldErrors }
    });
  }
  const statusCode = error.statusCode || 500;
  const code = statusCode === 404 ? 'NOT_FOUND'
             : statusCode === 401 ? 'UNAUTHORIZED'
             : statusCode === 403 ? 'FORBIDDEN'
             : statusCode >= 500 ? 'INTERNAL_ERROR'
             : 'REQUEST_ERROR';
  reply.code(statusCode).send({
    success: false,
    error: { code, message: error.message || 'An error occurred' }
  });
});
```

Build in **Phase 0** since Gateway handles errors immediately.

---

# PART 6: BUILD SEQUENCE

---

## 6.1 Phase 0: Project Scaffolding (Week 1)

**Goal:** All 9 services start up, connect to Postgres + Redis + RabbitMQ, and pass health checks.

```
1. Initialize monorepo (Turborepo)
   - services/ (9 service directories)
   - apps/web, apps/mobile
   - packages/types, packages/ui, packages/api-client

2. Create all 9 service directories with correct tech stacks:
   Java (Spring Boot 4.0.5 + Java 21):
     auth-service, inventory-service, finance-service, staff-service
   Python (FastAPI 0.115 + Python 3.12):
     ai-service, report-service
   Node.js (Fastify 4 + TypeScript):
     gateway, notification-service, file-service

3. Each Java service skeleton:
   - pom.xml (Spring Boot 4.0.5, all deps from §1.13)
   - application.yml (port, datasource, JPA, Flyway, RabbitMQ, Redis)
   - {Service}Application.java main class
   - controller/HealthController.java → GET /health
   - config/RabbitMQConfig.java (declare exchange + own queue + bindings)
   - exception/GlobalExceptionHandler.java (@RestControllerAdvice)
   - exception/{NotFoundException, ConflictException,
                ValidationException, AccessDeniedException}.java
   - security/RequiresRole.java (annotation)
   - security/RoleCheckAspect.java (AOP aspect)
   - src/main/resources/db/migration/V0__baseline.sql (empty)
   - Dockerfile

4. Each Python service skeleton:
   - requirements.txt (from §1.13 + alembic==1.13.2)
   - app/main.py (FastAPI + lifespan + global exception handler + GET /health)
   - app/core/config.py (Pydantic settings)
   - app/core/database.py (SQLAlchemy async engine)
   - alembic.ini + alembic/env.py
   - alembic/versions/0001_baseline.py (empty)
   - Dockerfile

5. Each Node.js service skeleton:
   - package.json (dependencies from §1.13)
   - tsconfig.json
   - src/server.ts (Fastify + setErrorHandler + GET /health)
   - src/config/index.ts (typed env config)
   - Dockerfile

   Gateway additionally:
   - src/middleware/auth.middleware.ts (JWT verify per §2.3)
   - src/routes/proxy.ts (route map for all 9 services per §2.2)
   - src/routes/health.ts (aggregated health check for all 9 services)

6. Create infrastructure/docker-compose.yml (exact config from §1.11,
   updated with staff-service on port 8088 and rabbitmq-setup container)

7. Create infrastructure/rabbitmq/setup.sh:
   - Create exchange: kitchenledger.events (topic, durable)
   - Create queues: notification-service, finance-service,
     inventory-service, report-service, staff-service
   - Create all bindings from §2.16 RabbitMQ Topology

8. Add rabbitmq-setup service to docker-compose.yml:
   Runs setup.sh once after RabbitMQ is healthy, then exits.

9. Create .env.example with all variables grouped by service

10. Verify: docker-compose up --build
    → ALL 9 services return 200 on their health endpoints
    → GET http://localhost:8080/health shows all 9 services as UP
    → RabbitMQ management UI (http://localhost:15672) shows
      all 5 queues created with correct bindings
```

## 6.2 Phase 1: Auth Foundation (Weeks 1-2)

**Services:** Auth Service (Java), API Gateway (Node.js)

```
Auth Service:
- Flyway migration V1__auth_schema.sql (all 5 auth tables + RLS)
- JPA entities: Tenant, User, RefreshToken, AuthToken, AuthAuditLog
- JwtService with RSA-256 key pair (generate keys, store as env vars)
- POST /api/auth/register — full flow including account seed event
- POST /api/auth/login
- POST /api/auth/refresh
- POST /api/auth/logout
- GET  /api/auth/me
- PATCH /api/auth/me
- POST /api/auth/me/change-password
- POST /api/auth/users/invite + accept-invite flow
- PATCH /api/auth/users/{id} (role change)
- GET/PATCH /api/auth/tenant/settings
- /internal/auth/verify-token (for Gateway)
- /internal/auth/users/{id} (for other services)
- RabbitMQ: publish auth.user.registered, auth.user.invited

API Gateway:
- JWT verification middleware using Auth Service public key
- Route proxy for all 7 services
- Rate limiting per tenant
- Request logging
- GET /health aggregating all service health

Test milestone: register → login → call GET /api/auth/me → see user data
```

## 6.3 Phase 2: Onboarding & Settings (Week 2)

**Services:** Auth Service (extend), Notification Service (Node.js)

```
Auth Service additions:
- POST /api/auth/onboarding/complete
- Tenant settings PATCH endpoint

Notification Service:
- DB schema (notifications, device_tokens tables)
- RabbitMQ consumer setup
- Consume auth.user.registered → welcome email
- Consume auth.user.invited → invitation email
- POST /api/notifications/devices (register push token)
- GET  /api/notifications (list)
- PATCH /api/notifications/{id}/read

Test milestone: register → receive welcome email
```

## 6.4 Phase 3: Inventory Core + Staff Core (Weeks 3-4)

**Services:** Inventory Service (Java), Staff Service (Java), File Service (Node.js partial)

```
Inventory Service:
- Flyway V1__inventory_schema.sql (all 16 tables + RLS)
- JPA entities for all inventory tables
- GET/POST/PATCH/DELETE /api/inventory/items (full CRUD + search/filter)
- GET/POST/PATCH/DELETE /api/inventory/categories
- GET/POST/PATCH/DELETE /api/inventory/suppliers
- POST /api/inventory/items/{id}/suppliers
- GET  /api/inventory/items/by-barcode/{code}
- POST /api/inventory/opening-stock
- POST /api/inventory/items/import (CSV)
- GET  /api/inventory/sync/pull (WatermelonDB sync endpoint)
- Scheduled: ABC classification (weekly)
- /internal/inventory/* endpoints for AI Service

Staff Service:
- Flyway V1__staff_schema.sql (all 9 tables + RLS per §3.14)
- JPA entities for all staff tables
- GET/POST/PATCH/DELETE /api/staff/employees
- GET/POST/PATCH/DELETE /api/staff/shifts
- GET /api/staff/schedule
- POST /api/staff/attendance/clock-in
- POST /api/staff/attendance/clock-out
- GET/POST/PATCH/DELETE /api/staff/tasks
- POST /api/staff/tasks/{id}/complete
- GET /api/staff/tasks/checklist/{date}
- RabbitMQ: consume auth.user.registered (staff queue binding)
- /internal/staff/employees/{id}

File Service (partial):
- POST /api/files/upload (for item images and task photos)
- POST /api/files/presign

Test milestone: Create 20 items, set opening stock, search by name/barcode;
  Create employees, assign shifts, clock in/out, complete a task
```

## 6.5 Phase 4: Stock Operations (Weeks 4-5)

**Services:** Inventory Service (extend), Notification Service (extend)

```
Inventory Service additions:
- POST   /api/inventory/purchase-orders (create)
- GET    /api/inventory/purchase-orders
- GET    /api/inventory/purchase-orders/suggestions
- POST   /api/inventory/purchase-orders/{id}/send (WhatsApp URL + email)
- POST   /api/inventory/receipts (create draft)
- POST   /api/inventory/receipts/{id}/confirm (stock update + 3-way match)
- GET/POST /api/inventory/waste (log + list)
- GET    /api/inventory/waste/report
- POST   /api/inventory/counts (start session)
- PATCH  /api/inventory/counts/{id}/items/{item_id}
- POST   /api/inventory/counts/{id}/complete
- POST   /api/inventory/counts/{id}/verify
- GET    /api/inventory/items/{id}/movements
- GET    /api/inventory/alerts
- Scheduled: low stock alerts, expiry alerts
- Publish: inventory.stock.low, inventory.stock.expiring, inventory.po.sent

Notification Service:
- Consume inventory.stock.low → push notification
- Consume inventory.stock.expiring → push notification

Test milestone: Full receiving workflow, stock count, waste log
```

## 6.6 Phase 5: Finance Core (Weeks 5-6)

**Services:** Finance Service (Java), File Service (extend), AI Service (partial)

```
Finance Service:
- Flyway V1__finance_schema.sql (all 8 tables + RLS)
- Consume auth.tenant.created → seed chart of accounts
- GET/POST/PATCH/DELETE /api/finance/accounts
- GET/POST/PATCH/DELETE /api/finance/vendors
- GET/PUT  /api/finance/daily-reports/{date} (get-or-create + save)
- POST     /api/finance/daily-reports/{date}/reconcile
- GET/POST /api/finance/expenses (including receipt_url from File Service)
- POST     /api/finance/vendors/{id}/payments
- GET      /api/finance/ap/summary
- GET      /api/finance/ap/aging
- POST     /api/finance/upi/generate-qr (India market)
- Scheduled: payment due alerts, overdue marking
- Publish: finance.dsr.reconciled, finance.payment.overdue, finance.expense.created

File Service additions:
- POST /api/files/upload for receipts/invoices
- Context-specific validation

AI Service (partial):
- DB schema + ai_jobs table
- POST /api/ai/ocr/receipt (Mindee integration for expense receipt)
- Celery worker for async processing
- Consume finance.expense.created → start OCR → update expense via internal API

Notification Service:
- Consume finance.payment.overdue → critical push + email

Test milestone: Complete end-of-day DSR in <5 minutes, expense with receipt OCR
```

## 6.7 Phase 6: Reports (Week 7)

**Services:** Finance Service (extend), Report Service (Python), Inventory Service (extend)

```
Finance Service additions:
- GET /api/finance/reports/pl (P&L computation)
- GET /api/finance/reports/expenses
- GET /api/finance/reports/cash-flow
- GET /api/finance/reports/tax (GST)
- GET /api/finance/dashboard
- GET /api/finance/daily-reports/trends
- /internal/finance/pl-data (for Report Service)

Inventory Service additions:
- GET /api/inventory/reports/valuation
- GET /api/inventory/reports/waste-analysis
- /internal/inventory/reports/* (for Report Service)

Report Service:
- DB schema (report_jobs table)
- POST /api/reports/jobs (queue a report)
- GET  /api/reports/jobs/{id} (status polling)
- Celery: PLReportGenerator (PDF via reportlab)
- Celery: WasteReportGenerator (PDF + CSV)
- Upload to Supabase Storage
- Publish report.generated event

Notification Service:
- Consume report.generated → push + email with download link

Test milestone: Request P&L PDF, receive push notification with download link
```

## 6.8 Phase 7: Recipe & Menu Engineering (Week 8)

**Services:** Inventory Service (extend)

```
- GET/POST/PATCH/DELETE /api/inventory/recipes
- POST /api/inventory/recipes/{id}/calculate-cost
- GET  /api/inventory/menu-engineering
- GET/POST /api/inventory/transfers
- Cascade recalculation when ingredient cost changes
- Scheduled: weekly recipe cost recalculation

Test milestone: Recipe costs auto-update when supplier price changes
```

## 6.9 Phase 8: AI Features (Weeks 9-10)

**Services:** AI Service (Python — full implementation)

```
AI Service full:
- POST /api/ai/ocr/notebook (notebook scan pipeline)
- GET  /api/ai/ocr/notebook/{job_id} (poll)
- POST /api/ai/ocr/notebook/{job_id}/commit
- POST /api/ai/voice/transcribe
- POST /api/ai/query (NL financial queries)
- GET  /api/ai/forecast/{item_id}
- GET  /api/ai/anomalies

Celery workers:
- process_notebook_ocr (Vision API → GPT-4o)
- process_voice_transcribe (Whisper → GPT-4o-mini parse)
- compute_forecast (statistical moving average)

Test milestone: Photograph a handwritten inventory note → correct items extracted
```

## 6.10 Phase 9: Production Readiness (Weeks 11-12)

```
Security:
- Penetration test RLS policies (verify cross-tenant isolation)
- Rate limit tuning per endpoint
- Input validation audit across all services
- HTTPS configuration

Performance:
- Database indexes tuned (EXPLAIN ANALYZE on slow queries)
- Redis caching on P&L report (invalidate on DSR write)
- Connection pool sizing per service

Observability:
- Structured logging (JSON) across all services
- Correlation ID propagated from Gateway through all services
- Health check dashboards
- Alert rules on error rates

Testing:
- Java: JUnit 5 + Testcontainers (Postgres + RabbitMQ in tests)
- Python: pytest + pytest-asyncio
- Node.js: Vitest
- Integration: API contract tests between services
- E2E: Cypress for critical web flows

CI/CD:
- GitHub Actions: test → build Docker image → push to registry
- Deploy order: infra → auth → gateway → inventory → finance → others

Deployment (Phase 1):
- Railway.app or Render for each service (simple, no k8s needed yet)
- Supabase managed Postgres + Storage
- CloudAMQP managed RabbitMQ
- Upstash managed Redis
```

---

# PART 7: CLAUDE CODE PROMPT

---

## 7.1 Master Kickoff Prompt

Paste this when starting a new Claude Code session with the documents in `/docs`:

```
You are the lead engineer for KitchenLedger, a restaurant management SaaS.

Read both documents in the /docs folder completely before writing any code:
  /docs/KitchenLedger_PRD_Enhanced.md       — Product Requirements
  /docs/KitchenLedger_TRD_Complete_v2.md    — Technical Requirements (THIS document)

These documents are your single source of truth. Do not deviate from the
architecture, schemas, or patterns described in them without flagging it to me.

---

ARCHITECTURE SUMMARY (confirm you understand this):

This is a MICROSERVICE architecture with 8 independent services:
  1. API Gateway     — Node.js + Fastify (port 8080) — routes + JWT verify
  2. Auth Service    — Java + Spring Boot (port 8081) — identity + tenants
  3. Inventory Svc   — Java + Spring Boot (port 8082) — stock + recipes
  4. Finance Svc     — Java + Spring Boot (port 8083) — DSR + expenses + P&L
  5. AI Service      — Python + FastAPI  (port 8084) — OCR + voice + NL
  6. File Service    — Node.js + Fastify (port 8085) — uploads + storage
  7. Notification    — Node.js + Fastify (port 8086) — push + email
  8. Report Service  — Python + FastAPI  (port 8087) — PDF + heavy reports

Frontend:
  - Web: Next.js 14 App Router (apps/web/)
  - Mobile: Expo SDK 51 React Native (apps/mobile/)

Infrastructure:
  - PostgreSQL 16 via Supabase
  - Redis 7
  - RabbitMQ 3.13 (message queue for async events)
  - Supabase Storage for files

---

AFTER reading both documents, do the following:

STEP 1 — CONFIRM UNDERSTANDING
State in your own words:
  - What each of the 8 services is responsible for
  - What database tables each service owns
  - How services communicate (sync vs async)
  - What Phase 0 involves
  - What the first 3 phases build in sequence

STEP 2 — IDENTIFY AMBIGUITIES
Before any code, list:
  - Anything unclear in the specs
  - Any dependency conflicts you notice in the versions
  - Any assumptions you need me to confirm

STEP 3 — BEGIN PHASE 0 (only after I say "Go")

Phase 0 tasks:
  1. Turborepo monorepo initialization
     - services/ (8 service directories)
     - apps/web, apps/mobile
     - packages/types, packages/ui, packages/api-client
  
  2. Each Java service (auth, inventory, finance):
     - Spring Boot 4.0.5 with Java 21
     - pom.xml with all dependencies from TRD section 1.13
     - application.yml with all config from TRD
     - GET /actuator/health → { status: UP }
     - Flyway configured (no migrations yet — just setup)
  
  3. Each Node.js service (gateway, notification, file):
     - Fastify 4 with TypeScript
     - package.json with all dependencies from TRD section 1.13
     - GET /health → { status: "ok" }
  
  4. Each Python service (ai, report):
     - FastAPI 0.115 with Python 3.12
     - requirements.txt from TRD section 1.13
     - GET /health → { status: "ok" }
  
  5. docker-compose.yml with ALL services and infrastructure
     - Exact config from TRD section 1.11
     - Health checks on postgres, redis, rabbitmq
  
  6. RabbitMQ setup script:
     - Exchange: kitchenledger.events (topic, durable)
     - All queues from event catalog (TRD section 1.7)

  7. Verify: docker-compose up → ALL services pass health checks

---

NON-NEGOTIABLE RULES (follow in every session):

CODE STRUCTURE:
  - Java: Controller → Service → Repository. No DB access in controllers.
  - Python: Router → Service → Repository. No DB calls in route handlers.
  - Node.js: Route handler → Service → DB. Thin handlers only.

DATA:
  - All monetary values: BigDecimal (Java) / Decimal (Python). Never float.
  - All timestamps: timezone-aware everywhere.
  - Soft deletes always: set deleted_at, never DELETE.
  - Every domain table has tenant_id. Enable RLS. Create isolation policy.

AUTH:
  - All Java services: trust X-User-Id, X-Tenant-Id, X-User-Role headers
    from Gateway. Do NOT re-validate JWT in services.
  - All routes check role from X-User-Role header.
  - Internal routes (/internal/*) accept requests only from service network.

API RESPONSES (use exactly):
  Success: { "success": true, "data": {...} }
  Paginated: { "success": true, "data": [...], "meta": { page, per_page, total } }
  Error: { "success": false, "error": { "code": "SNAKE_CASE", "message": "..." } }

EVENTS:
  Every RabbitMQ event uses this envelope:
  { event_id, event_type, tenant_id, produced_by, produced_at, version, payload }

AUDIT:
  Every state-changing operation writes an audit log entry.

---

After confirming your understanding, wait for me to say "Go" before writing code.
```

---

## 7.2 Per-Service Session Prompt

Use this template for each individual session when implementing a specific service:

```
We are continuing development of KitchenLedger.
Read /docs/KitchenLedger_TRD_Complete_v2.md for full context.

Current session: Implement [SERVICE NAME]
Phase: [PHASE NUMBER]
Previous session completed: [PREVIOUS SERVICE/FEATURE]

Service spec to implement:
  - Location in TRD: Part [X], Service [N]: [Service Name]
  - Technology: [Java Spring Boot / Python FastAPI / Node.js Fastify]
  - Port: [PORT]
  - Database tables owned: [LIST]

Today's tasks:
  1. [Specific task]
  2. [Specific task]
  3. [Specific task]

Existing code context:
  - /services/gateway/ is complete (routes + JWT middleware)
  - /services/auth-service/ is complete (all endpoints working)
  - Docker Compose is running

Follow all project rules:
  - Use the Response envelope format
  - BigDecimal for money, never float
  - Soft deletes only
  - Role checking via X-User-Role header
  - Write audit logs on every mutation
  - RabbitMQ event for state changes that other services care about

When done, tell me:
  1. What endpoints are now available
  2. How to manually test them (curl commands or Postman steps)
  3. What the next session should implement
```

---

## 7.3 Feature Implementation Priority Matrix

| Feature | Service | Phase | Priority |
|---|---|---|---|
| Tenant registration | Auth | 1 | P0 |
| JWT auth + refresh | Auth | 1 | P0 |
| RBAC enforcement | Auth, Gateway | 1 | P0 |
| Staff invite flow | Auth | 1 | P1 |
| Request routing | Gateway | 1 | P0 |
| Rate limiting | Gateway | 1 | P1 |
| Welcome email | Notification | 2 | P1 |
| Push token registration | Notification | 2 | P1 |
| Inventory item CRUD | Inventory | 3 | P0 |
| Supplier management | Inventory | 3 | P1 |
| Opening stock | Inventory | 3 | P0 |
| Barcode lookup | Inventory | 3 | P1 |
| Mobile sync endpoint | Inventory | 3 | P1 |
| CSV import | Inventory | 3 | P2 |
| Employee management (CRUD) | Staff | 3 | P0 |
| Shift scheduling | Staff | 3 | P0 |
| Clock-in/out attendance | Staff | 3 | P0 |
| Task checklists (open/close) | Staff | 3 | P0 |
| Task photo verification | Staff | 3 | P1 |
| Shift feedback | Staff | 3 | P1 |
| Purchase orders | Inventory | 4 | P1 |
| Stock receipt + 3-way match | Inventory | 4 | P1 |
| Waste logging | Inventory | 4 | P0 |
| Stock count | Inventory | 4 | P0 |
| Low stock alerts | Inventory | 4 | P1 |
| Chart of accounts | Finance | 5 | P1 |
| Vendor management | Finance | 5 | P1 |
| Daily sales report (DSR) | Finance | 5 | P0 |
| Expense logging + OCR | Finance + AI | 5 | P0 |
| AP tracking | Finance | 5 | P1 |
| UPI dynamic QR | Finance | 5 | P1 |
| File upload service | File | 5 | P1 |
| Tip pool management | Staff | 5 | P1 |
| Overtime/break compliance | Staff | 5 | P1 |
| Certifications tracking | Staff | 5 | P2 |
| P&L report | Finance | 6 | P1 |
| Finance dashboard | Finance | 6 | P1 |
| DSR trends | Finance | 6 | P1 |
| PDF report generation | Report | 6 | P2 |
| Performance goals | Staff | 6 | P2 |
| Recipe management | Inventory | 7 | P1 |
| Menu engineering | Inventory | 7 | P2 |
| Stock transfers | Inventory | 7 | P2 |
| Notebook OCR pipeline | AI | 8 | P1 |
| Voice transcription | AI | 8 | P1 |
| NL financial queries | AI | 8 | P2 |
| Demand forecasting | AI | 8 | P2 |
| Anomaly detection | AI | 8 | P2 |
