# KitchenLedger — Master Task Breakdown Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build KitchenLedger end-to-end — 9 microservices, web app, mobile app, and shared packages.
**Architecture:** API Gateway → 4 Java Spring Boot services + 2 Python FastAPI services + 3 Node.js Fastify services; PostgreSQL + Redis + RabbitMQ; Next.js 14 web + Expo SDK 51 mobile.

---

## Epic Files

Each file below covers one service or layer. Open the relevant file when working on that area.

| File | Epic | Phase | Tech | Tickets |
|---|---|---|---|---|
| [INFRA.md](epics/INFRA.md) | Infrastructure & Scaffolding | 0 — Week 1–2 | Docker Compose, all 9 skeletons, RSA keys | 6 |
| [AUTH.md](epics/AUTH.md) | Auth Service | 1 — Week 2–3 | Java, Spring Boot, JWT RS256, RBAC | 9 |
| [GW.md](epics/GW.md) | API Gateway | 1 — Week 2–3 | Node.js, Fastify, JWT middleware, rate limiting | 3 |
| [INV.md](epics/INV.md) | Inventory Service | 2 — Week 4–9 | Java, Spring Boot, FEFO, ABC, recipes | 13 |
| [FIN.md](epics/FIN.md) | Finance Service | 2 — Week 4–9 | Java, Spring Boot, DSR, P&L, UPI QR | 12 |
| [STAFF.md](epics/STAFF.md) | Staff Service | 2 — Week 4–9 | Java, Spring Boot, scheduling, tips, attendance | 11 |
| [AI.md](epics/AI.md) | AI Service | 3 — Week 9–12 | Python, FastAPI, Celery, OpenAI, Google Vision | 7 |
| [NOTIF.md](epics/NOTIF.md) | Notification Service | 3 — Week 9–11 | Node.js, Fastify, Expo push, Resend email | 5 |
| [REPORT.md](epics/REPORT.md) | Report Service | 3 — Week 10–12 | Python, FastAPI, Celery, reportlab, pandas | 4 |
| [FILE.md](epics/FILE.md) | File Service | 3 — Week 10–11 | Node.js, Fastify, sharp, Supabase Storage | 4 |
| [WEB.md](epics/WEB.md) | Web App | 4 — Week 10–18 | Next.js 14, Tailwind, shadcn/ui, Recharts | 14 |
| [MOB.md](epics/MOB.md) | Mobile App | 4 — Week 10–18 | Expo SDK 51, WatermelonDB, offline-first | 9 |
| [PKG.md](epics/PKG.md) | Shared Packages | 4 — Week 10–14 | TypeScript types, shared UI, API client | 3 |
| [TEST.md](epics/TEST.md) | Cross-Service & E2E Tests | 5 — Ongoing | Playwright, contract tests, load tests | 4 |
| [DEPLOY.md](epics/DEPLOY.md) | Deployment & DevOps | 5 — Ongoing | Docker, GCP Cloud Run, GitHub Actions, monitoring | 5 |

**Total tickets: ~109 stories across 15 epics**

---

## Phase Summary

| Phase | Epics | Weeks | Exit Criteria |
|---|---|---|---|
| **0 — Foundation** | INFRA | 1–2 | All 9 services start, pass health checks |
| **1 — Auth & Routing** | AUTH, GW | 2–3 | Login/register/JWT works; all routes proxied |
| **2 — Core Domain** | INV, FIN, STAFF | 4–9 | All domain services ≥ 80% test coverage |
| **3 — Supporting Services** | AI, NOTIF, REPORT, FILE | 9–12 | AI features, notifications, PDF reports working |
| **4 — Frontend** | WEB, MOB, PKG | 10–18 | Full UI on web + mobile (parallel to Phase 2/3) |
| **5 — Production** | TEST, DEPLOY | Ongoing | CI/CD green, deployed to Cloud Run, monitored |

---

## Implementation Approach

**Subagent-Driven (recommended):**
- Open the relevant epic file
- Pick the next unchecked story
- Dispatch a fresh subagent with the story content as context
- Review the output before moving to the next story

**Key cross-cutting rules (apply everywhere):**
- Every domain table: `tenant_id UUID NOT NULL` + RLS policy + `deleted_at` soft delete
- Monetary values: `NUMERIC(12,2)` — never FLOAT; `BigDecimal` in Java
- Auth headers (`X-User-Id`, `X-Tenant-Id`, `X-User-Role`) trusted only from Gateway
- Event publishing: Transactional Outbox pattern — write event in same DB transaction, background job publishes
- Error responses: always `{ success: false, error: { code, message, field_errors? } }` — never expose stack traces
- Coverage: ≥ 80% line coverage on every service before moving to next phase
