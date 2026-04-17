# KitchenLedger

All-in-one restaurant management platform for independent restaurants. Unifies **Inventory**, **Finance/Accounts**, and **Staff/HR** into a single product — web dashboard (Next.js) + mobile app (Expo) — with AI-powered OCR, voice input, and natural language queries.

**Target price:** $39–49/month vs. $400–800/month for fragmented alternatives.

---

## Architecture

```
kitchenledger/
├── apps/
│   ├── web/               # Next.js 14 (App Router) — management dashboard
│   └── mobile/            # Expo SDK 51 + React Native — field operations
├── packages/
│   ├── types/             # Shared TypeScript types (generated from OpenAPI)
│   ├── ui/                # Shared component library (Tailwind + Radix UI)
│   └── api-client/        # Generated API clients
└── services/
    ├── gateway/           # Fastify :8080 — JWT verify, rate limit, routing
    ├── auth-service/      # Spring Boot :8081 — tenants, users, JWT, RBAC
    ├── inventory-service/ # Spring Boot :8082 — items, suppliers, POs, stock
    ├── finance-service/   # Spring Boot :8083 — DSR, expenses, AP, P&L
    ├── ai-service/        # FastAPI :8084 — OCR, voice NL, forecasting
    ├── file-service/      # Fastify :8085 — uploads, pre-signed URLs
    ├── notification-service/ # Fastify :8086 — push, email, WhatsApp
    ├── report-service/    # FastAPI :8087 — heavy aggregation, PDF/CSV
    └── staff-service/     # Spring Boot :8088 — scheduling, attendance, tasks
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Web frontend | Next.js 14, TypeScript, Tailwind, Radix UI |
| Mobile frontend | Expo SDK 51, React Native, TypeScript |
| Java services | Java 21 + Spring Boot 4.0.5 + Spring Data JPA |
| Python services | Python 3.12 + FastAPI + Celery + SQLAlchemy 2 |
| Node services | Node.js 22 + Fastify v4 + TypeScript |
| Database | PostgreSQL 16 via Supabase (RLS on every tenant table) |
| Cache | Redis 7 |
| Message queue | RabbitMQ 3.13 (topic exchange) |
| Object storage | Supabase Storage |
| Monorepo | Turborepo |

---

## Prerequisites

- Docker Desktop (for local infra)
- Node.js 22
- Java 21 (Temurin recommended)
- Python 3.12

---

## Local Development

```bash
# 1. Copy environment variables
cp .env.example .env
# Fill in required secrets (see Environment Variables below)

# 2. Start infrastructure (PostgreSQL, Redis, RabbitMQ)
npm run infra:up

# 3. Install all dependencies
npm install

# 4. Start all services in watch mode
npm run dev
```

Check health:
```bash
curl http://localhost:8080/health
```

---

## Running Tests

```bash
# All services
npm run test

# Single Java service
cd services/auth-service && mvn test

# Single Python service
cd services/ai-service && pytest

# Single Node service
cd services/gateway && npx vitest run
```

**Coverage mandate:** 80% minimum across all services.

---

## Environment Variables

Copy `.env.example` → `.env`. Required secrets:

| Variable | Purpose |
|---|---|
| `JWT_PRIVATE_KEY` | RSA private key — Auth Service signs JWTs |
| `JWT_PUBLIC_KEY` | RSA public key — Gateway verifies JWTs |
| `INTERNAL_SERVICE_SECRET` | Shared secret for inter-service calls |
| `OPENAI_API_KEY` | AI Service — voice NL queries |
| `MINDEE_API_KEY` | AI Service — OCR receipt parsing |
| `RESEND_API_KEY` | Notification Service — transactional email |
| `EXPO_ACCESS_TOKEN` | Notification Service — mobile push |
| `SUPABASE_URL` | Database + Storage URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `SUPABASE_STORAGE_URL` | Storage endpoint |

---

## Service Ports

| Service | Port |
|---|---|
| API Gateway | 8080 |
| Auth Service | 8081 |
| Inventory Service | 8082 |
| Finance Service | 8083 |
| AI Service | 8084 |
| File Service | 8085 |
| Notification Service | 8086 |
| Report Service | 8087 |
| Staff Service | 8088 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| RabbitMQ AMQP | 5672 |
| RabbitMQ UI | 15672 |

---

## Reference Docs

- [`docs/KitchenLedger_PRD_Enhanced.md`](docs/KitchenLedger_PRD_Enhanced.md) — Full product requirements
- [`docs/KitchenLedger_TRD_v2_Microservices.md`](docs/KitchenLedger_TRD_v2_Microservices.md) — Full technical spec
