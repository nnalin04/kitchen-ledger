# KitchenLedger — Codex Instructions

## Project Overview

KitchenLedger is an all-in-one restaurant management platform for small, independent restaurants. It unifies **Inventory Management**, **Finance/Accounts**, and **Staff/HR** into a single cross-platform product (Next.js web + Expo mobile) with real-time sync, offline-first capability, and AI-powered features — OCR for digitizing handwritten notebooks, voice input for inventory counts, and natural language queries. Target price: $39–49/month vs. the $400–800/month competitors charge for fragmented alternatives.

Core differentiator: **complete purchase → inventory → kitchen → plate traceability** at an affordable price point.

Reference docs:
- `docs/KitchenLedger_PRD_Enhanced.md` — full product requirements
- `docs/KitchenLedger_TRD_v2_Microservices.md` — full technical requirements

---

## Architecture

```
kitchenledger/
├── apps/
│   ├── web/            # Next.js 14 (App Router) + TypeScript — full management dashboard
│   └── mobile/         # Expo SDK 51 + React Native + TypeScript — field operations
├── packages/
│   ├── types/          # TypeScript types generated from OpenAPI specs
│   ├── ui/             # Shared component library (Tailwind + Radix UI)
│   └── api-client/     # Generated API clients (fetch-based)
├── services/
│   ├── gateway/        # Node.js + Fastify :8080 — single entry point, JWT verify, rate limit
│   ├── auth-service/   # Java + Spring Boot 4 :8081 — tenants, users, JWT, RBAC
│   ├── inventory-service/ # Java + Spring Boot 4 :8082 — items, suppliers, POs, stock
│   ├── finance-service/   # Java + Spring Boot 4 :8083 — DSR, expenses, AP, P&L
│   ├── ai-service/     # Python + FastAPI :8084 — OCR, voice NL, forecasting
│   ├── file-service/   # Node.js + Fastify :8085 — uploads, pre-signed URLs
│   ├── notification-service/ # Node.js + Fastify :8086 — push, email, WhatsApp
│   ├── report-service/ # Python + FastAPI :8087 — heavy aggregation, PDF/CSV export
│   └── staff-service/  # Java + Spring Boot 4 :8088 — scheduling, attendance, tasks
├── infrastructure/
│   ├── docker-compose.yml  # Full local stack
│   └── rabbitmq/           # Exchange + queue setup script
├── docs/
│   ├── KitchenLedger_PRD_Enhanced.md
│   └── KitchenLedger_TRD_v2_Microservices.md
├── rules/common/           # Always-loaded coding guidelines
├── .Codex/                # Agents, skills, commands, hooks
├── turbo.json
└── package.json
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Web frontend** | Next.js 14, App Router, TypeScript, Tailwind, Radix UI | Full dashboard, reports, management |
| **Mobile frontend** | Expo SDK 51, React Native, TypeScript | Field operations, counting, logging |
| **Shared UI** | TypeScript + Tailwind + Radix UI | `packages/ui` — shared components |
| **Shared types** | TypeScript | `packages/types` — generated from OpenAPI |
| **API Gateway** | Node.js 22 + Fastify | JWT verify, routing, rate limiting, circuit breaker |
| **Auth Service** | Java 21 + Spring Boot 4.0.5 | Tenant registration, users, JWT (RSA), RBAC, sessions |
| **Inventory Service** | Java 21 + Spring Boot 4.0.5 | Items, suppliers, POs, stock movements, recipes, waste |
| **Finance Service** | Java 21 + Spring Boot 4.0.5 | DSR, expenses, AP, P&L, UPI transactions |
| **Staff Service** | Java 21 + Spring Boot 4.0.5 | Scheduling, attendance, tasks, tip pooling, certifications |
| **AI Service** | Python 3.12 + FastAPI + Celery | OCR (Mindee/Google Vision), voice NL, forecasting |
| **Report Service** | Python 3.12 + FastAPI | Heavy aggregation, PDF/CSV, scheduled reports |
| **Notification Service** | Node.js 22 + Fastify | Expo push, Resend email, WhatsApp |
| **File Service** | Node.js 22 + Fastify | Upload handling, Supabase Storage pre-signed URLs |
| **Primary DB** | PostgreSQL 16 via Supabase | All persistent data — RLS on every tenant table |
| **Cache** | Redis 7 | Sessions, rate limiting, deduplication |
| **Message queue** | RabbitMQ 3.13 (topic exchange) | Async inter-service events |
| **Object storage** | Supabase Storage (S3-compatible) | Receipts, photos, exports |
| **Realtime** | Supabase Realtime | Live dashboard updates |
| **Monorepo** | Turborepo | Orchestrated builds across apps/packages/services |

---

## Database Design Rules (Non-Negotiable)

Every table MUST follow these principles from the TRD:

1. `tenant_id UUID NOT NULL` on every domain table
2. Row-Level Security (RLS) enabled on every tenant-scoped table
3. UUID primary keys using `gen_random_uuid()`
4. Soft deletes: `deleted_at TIMESTAMPTZ` — never hard delete
5. Monetary amounts: `NUMERIC(12,2)` — never FLOAT
6. All timestamps: `TIMESTAMPTZ` — timezone-aware
7. Optimistic locking: `version INT` on frequently-updated tables
8. Audit triggers on every write

**Service table ownership** (services NEVER query each other's tables directly — use APIs):
- **Auth**: tenants, users, refresh_tokens, auth_audit_logs
- **Inventory**: inventory_items, suppliers, purchase_orders, stock_receipts, inventory_movements, waste_logs, recipes
- **Finance**: accounts, vendors, daily_sales_reports, expenses, vendor_payments
- **Staff**: employees, shifts, tasks, task_completions, attendance, tip_pools
- **Notification**: notifications, device_tokens
- **AI**: ai_jobs (result in JSONB)
- **File**: file_uploads (metadata only)
- **Report**: report_jobs (reads via read replica)

---

## Auth Flow

```
1. Client → Gateway: POST /api/auth/login
2. Gateway → Auth Service: POST /internal/auth/login
3. Auth Service → Gateway → Client: { access_token (JWT), refresh_token }

Subsequent requests:
1. Client → Gateway (Authorization: Bearer <token>)
2. Gateway: verifies JWT signature (Auth Service public key)
   → Adds X-User-Id, X-Tenant-Id, X-User-Role headers
   → Forwards to target service
3. Target service: trusts Gateway headers, sets DB session app.current_tenant_id
```

Internal services DO NOT verify JWTs themselves — Gateway is the single verification point.

---

## Inter-Service Communication

**Synchronous (REST):** API Gateway proxies to services. Internal calls use `INTERNAL_SERVICE_SECRET` header.

**Asynchronous (RabbitMQ topic exchange):** Event envelope:
```json
{
  "event_id": "uuid",
  "event_type": "inventory.stock.low",
  "tenant_id": "uuid",
  "produced_by": "inventory-service",
  "produced_at": "2024-01-15T10:30:00Z",
  "version": "1.0",
  "payload": {}
}
```

Key events: `auth.tenant.created`, `inventory.stock.low`, `inventory.receipt.confirmed`, `finance.expense.created`, `ai.ocr.completed`, `report.generated`

---

## Dev Conventions

### All Services
- Conventional commits: `type(scope): description` (e.g., `feat(inventory): add PAR auto-reorder`)
- Files max 800 lines; functions max 50 lines; nesting max 4 levels
- Validate at ALL boundaries — Zod (Node), Pydantic (Python), Jakarta Bean Validation (Java)
- No hardcoded secrets — fail fast at startup if required env vars are missing
- Error messages must not leak stack traces, DB schemas, or internal service names to clients

### Java / Spring Boot Services
- Spring Boot 4.0.5, Java 21, Maven
- All endpoints under `/api/v1/` (public) or `/internal/` (service-to-service)
- Controller → Service → Repository pattern (no business logic in controllers)
- Spring Data JPA for DB; `@Transactional` on service methods that span multiple writes
- RBAC enforced with `@PreAuthorize` at the service layer
- Every service exposes `/actuator/health` (used by Docker healthcheck)
- Unit tests: JUnit 5 + Mockito; Integration tests: `@SpringBootTest` + Testcontainers

### Python / FastAPI Services
- Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2 (async), Alembic
- Celery + Redis for async task queue (AI service)
- All routes use Pydantic response models — no raw dicts returned
- Background tasks go through Celery, not FastAPI BackgroundTasks for anything >1s
- Tests: pytest + httpx (async client) + pytest-asyncio

### Node.js / Fastify Services (Gateway, Notification, File)
- Node.js 22, Fastify v4, TypeScript, Zod for schema validation
- Gateway uses `@fastify/http-proxy` for routing; circuit breaker via `opossum`
- All routes register JSON schemas for request/response validation
- Tests: Vitest + supertest

### Web App (Next.js)
- Next.js 14 App Router, TypeScript strict mode
- Server Components by default; `'use client'` only where necessary (forms, hooks, interactive)
- Tailwind CSS + Radix UI via `packages/ui`; no inline styles
- SWR or React Query for client-side data fetching
- All API calls through `packages/api-client` — never `fetch` directly in components

### Mobile App (Expo)
- Expo SDK 51, React Native, TypeScript strict mode
- Expo Router for navigation
- Offline-first: queue mutations locally when offline, sync on reconnect
- All API calls through `packages/api-client`

---

## Environment

**Start full local stack:**
```bash
npm run infra:up          # starts postgres, redis, rabbitmq (docker-compose)
npm run dev               # turborepo starts all services in dev mode
```

**Check health:**
```bash
npm run health            # curl :8080/health
```

**Env vars:** Copy `.env.example` → `.env` in repo root. Key secrets:
- `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` — RSA key pair for Auth Service
- `INTERNAL_SERVICE_SECRET` — shared secret between Gateway and internal services
- `OPENAI_API_KEY`, `MINDEE_API_KEY`, `GOOGLE_CLOUD_CREDENTIALS` — AI service
- `RESEND_API_KEY` — transactional email
- `EXPO_ACCESS_TOKEN` — mobile push notifications
- `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_STORAGE_URL` — production DB/storage

**Docker Compose service ports:**
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

## Dev Loop

```
1. npm run infra:up              # infra running
2. (edit code in a service)
3. npm run dev                   # turborepo watches all services
4. npm run test                  # run tests for changed packages
5. When green: /commit-push      # conventional commit + push
6. Before merging: /qa-report    # GO/NO-GO
7. Before deploy: /security-audit + /deploy-check [env]
```

---

## Testing

| Scope | Command |
|---|---|
| All tests | `npm run test` |
| Single service | `cd services/auth-service && mvn test` |
| Python service | `cd services/ai-service && pytest` |
| Node service | `cd services/gateway && npx vitest` |
| Web app | `cd apps/web && npx vitest` |
| E2E | `/e2e-run` (requires full stack up) |

**Coverage mandate:** 80% minimum. Use `/test-coverage` to get a gap analysis.

---

## Available Skills

| Skill | When to Use |
|---|---|
| `/pm [task]` | Start here for any work — routes to specialist agents |
| `/prd [focus]` | Generate/refine product requirements |
| `/api-design` | Design REST API contracts before implementing |
| `/api-docs` | Generate OpenAPI 3.0 spec from existing routes |
| `/backend-patterns` | Common patterns, anti-patterns for services |
| `/database-migrations` | Safe DB migration patterns (Flyway/Alembic) |
| `/springboot-patterns` | Spring Boot conventions and patterns |
| `/springboot-security` | Spring Security, RBAC, JWT config |
| `/springboot-tdd` | TDD workflow for Java services |
| `/springboot-verification` | Full verification suite for Spring Boot |
| `/python-patterns` | Python idioms for FastAPI/Celery |
| `/python-testing` | pytest, fixtures, async testing |
| `/docker-patterns` | Dockerfile, Compose, multi-stage builds |
| `/tdd-workflow` | Red → Green → Refactor cycle |
| `/code-review` | Spawns `reviewer` agent on changed files |
| `/security-audit [scope]` | OWASP audit via `security-engineer` agent |
| `/security-review` | Code-level security review |
| `/security-scan` | Automated vulnerability scanning |
| `/qa-report` | Full test suite GO/NO-GO via `qa-tester` agent |
| `/test-coverage` | Coverage matrix + gap analysis |
| `/e2e-test [flow]` | Full E2E testing orchestration |
| `/deploy-check [env]` | Pre-deploy checklist |
| `/docker-patterns` | Docker/Compose best practices |
| `/deployment-patterns` | Blue/green, rolling deployment strategies |
| `/service-logs [service]` | Container logs + crash diagnosis |
| `/env-audit [env]` | Audit env files for missing secrets |
| `/rollback [env]` | Root-cause assessment + guided rollback |
| `/performance-analysis` | Bottleneck detection across services |
| `/project-status` | Health dashboard: todos, git velocity, risks |
| `/standup` | Yesterday, today, blockers |
| `/commit-push [msg]` | Stage + conventional commit + push |
| `/build-fix` | Incrementally fix build/type errors |
| `/verification-loop` | Repeated verify-fix cycle until green |
| `/retrospective` | Extract learnings → update agent/skill files |
| `/ui-ux-pro-max` | Design intelligence: 50+ styles, 161 palettes, 57 font pairs, 99 UX guidelines, 25 chart types — use when designing dashboard, KPI cards, P&L charts, mobile screens |
| `/design-system` | Three-layer token architecture (primitive→semantic→component) — use when building `packages/ui` shared library |
| `/brand` | Brand voice, visual identity, consistency audits — use when establishing KitchenLedger's visual identity |
| `/ui-review [screen]` | Accessibility audit (WCAG 2.1 AA), touch target sizes, empty states — mobile-critical |
| `/ui-styling` | shadcn/ui + Tailwind component implementation for Next.js web app |
| `/systematic-debugging` | Structured debugging for hard bugs |
| `/bug-report [title]` | Document + triage a bug |
| `/memory [store\|query]` | Cross-session memory store |

---

## Agents (`.Codex/agents/`)

| Agent | Role | When |
|---|---|---|
| `reviewer` | Deep code review across all 5 tech stacks — KitchenLedger-specific rules for tenant isolation, monetary precision, RLS, RabbitMQ envelope format | After writing code |
| `code-reviewer` | Plan-aligned review — checks implementation against the original planning doc or step description | After completing a planned step |
| `qa-tester` | E2E testing, GO/NO-GO verdicts | Before merging |
| `security-engineer` | OWASP audit, vulnerability review | Before deploy, on new auth/infra code |
| `devops-engineer` | Docker, deploy, incident response | Infra changes, outages |
| `architect` | System design, scalability, ADRs | New service, major feature |
| `tdd-guide` | TDD coaching, test strategy | Starting a new feature |
| `database-reviewer` | PostgreSQL query optimization, schema, RLS | DB migrations, slow queries |
| `planner` | Task breakdown, sprint planning | Before complex work |
| `build-error-resolver` | Build failures, dependency issues | When builds are broken |
| `refactor-cleaner` | Refactoring, dead code removal | Tech debt sessions |
| `doc-updater` | Keeping docs in sync with code | After significant changes |

Use `/pm [describe task]` as the entry point — it routes to the right agent(s).

---

## Orchestration

**Rule:** Use agents only when there's a genuine role conflict — a fresh perspective that the implementing engineer can't provide.

**Parallel agent use cases for this project:**
- When building a new feature: `planner` (design) + `tdd-guide` (test strategy) in parallel
- Code complete: `reviewer` + `security-engineer` in parallel
- Before deploy: `qa-tester` + `devops-engineer` in parallel

---

## Hooks (`.Codex/hooks/`)

| Hook | Trigger | What it does |
|---|---|---|
| `pre-tool-use.sh` | Every `Bash` call | Adds `-i` to bare `rm` (interactive confirm), expands `ll`→`ls -lah`, warns on writes to `/etc`, `/usr`, `/opt` |

---

## Security Rules (Always Active)

Before any commit, verify:
- [ ] No hardcoded secrets
- [ ] All inputs validated (Zod / Pydantic / Jakarta validation)
- [ ] SQL: parameterized queries only (JPA/SQLAlchemy — no raw string interpolation)
- [ ] Auth headers (X-User-Id, X-Tenant-Id, X-User-Role) only trusted from Gateway
- [ ] `tenant_id` in every DB query — no cross-tenant data leakage
- [ ] Rate limiting on all public endpoints (Gateway enforces via Redis)
- [ ] Error responses never include stack traces or DB schema details
- [ ] RLS policies verified after any schema change

If a security issue is found: **STOP**, use `security-engineer` agent, fix before continuing.

---

## Key Files

| File | Purpose |
|---|---|
| `infrastructure/docker-compose.yml` | Full local stack — start with `npm run infra:up` |
| `infrastructure/rabbitmq/setup.sh` | Creates topic exchange + all consumer queues |
| `docs/KitchenLedger_PRD_Enhanced.md` | Full product requirements |
| `docs/KitchenLedger_TRD_v2_Microservices.md` | Full technical spec |
| `turbo.json` | Turborepo pipeline configuration |
| `rules/common/security.md` | Mandatory security checklist |
| `rules/common/coding-style.md` | File size limits, immutability, error handling |
| `rules/common/testing.md` | 80% coverage mandate, TDD workflow |
| `rules/common/development-workflow.md` | Research → Plan → TDD → Review pipeline |
| `.Codex/settings.json` | Hook activation |
| `.Codex/agents/` | 11 specialist agents |
| `.Codex/skills/` | 60 reusable skills |
| `.Codex/commands/` | Slash commands |
| `.Codex/memory/learnings.md` | Running log — append during sessions |

---

## Session Management

```
Start of session:    /resume-session     → load previous context
Before major change: /checkpoint create  → snapshot
After hard problem:  /learn-eval         → extract pattern with quality gate
End of session:      /save-session       → capture state + next steps
```

Every 5–10 tasks: `/retrospective` to promote learnings → `patterns.md`
