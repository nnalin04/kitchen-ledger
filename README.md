# KitchenLedger

All-in-one restaurant management platform built for independent restaurants. KitchenLedger unifies **inventory tracking**, **financial accounting**, and **staff management** into a single affordable product — accessible from a full web dashboard and a mobile app for field operations.

> **Target price:** $39–49/month — a fraction of the $400–800/month teams currently pay for fragmented alternatives.

---

## What It Does

KitchenLedger is designed around the daily reality of running a small restaurant:

- **Inventory** — track every ingredient from purchase order to plate. Know what you have, what you're running low on, what went to waste, and what each dish actually costs.
- **Finance** — record daily sales by payment method, log expenses, track vendor payments, and see your P&L without a spreadsheet.
- **Staff** — schedule shifts, clock staff in and out, assign tasks, track certifications, and calculate tip distribution.
- **AI assistance** — point your camera at a handwritten stock count or an invoice and KitchenLedger digitizes it. Speak a stock entry or query your data in plain language.
- **Reports** — generate P&L summaries, waste analysis, expense breakdowns, and staff hours reports as PDFs or CSVs.
- **Notifications** — real-time push alerts, emails, and WhatsApp messages for low stock, shift reminders, approvals, and task assignments.

---

## How It's Built

The platform is a monorepo with two client apps and nine backend services that communicate through a central API gateway.

```
kitchenledger/
├── apps/
│   ├── web/            # Full management dashboard (browser)
│   └── mobile/         # Field operations app (iOS + Android)
├── packages/
│   ├── types/          # Shared type definitions
│   ├── ui/             # Shared component library
│   └── api-client/     # API client used by both apps
└── services/
    ├── gateway/           # Single entry point for all client traffic
    ├── auth-service/      # Authentication, users, and tenant management
    ├── inventory-service/ # Inventory, suppliers, stock movements, and recipes
    ├── finance-service/   # Sales records, expenses, vendor payments, and P&L
    ├── ai-service/        # OCR, voice input, and natural language queries
    ├── file-service/      # File uploads and secure download links
    ├── notification-service/ # Push, email, and WhatsApp alerts
    ├── report-service/    # Cross-service aggregation and report generation
    └── staff-service/     # Scheduling, attendance, tasks, and HR operations
```

Each service has its own `README.md` explaining how to run it and what it does.

---

## Getting Started

### Prerequisites

- Docker Desktop
- Node.js 22+
- Java 21+
- Python 3.12+

### Run Locally

```bash
# 1. Copy environment variables and fill in required secrets
cp .env.example .env

# 2. Start the infrastructure (database, cache, message broker)
npm run infra:up

# 3. Install all dependencies
npm install

# 4. Start all services in watch mode
npm run dev
```

Verify the stack is healthy:

```bash
curl http://localhost:8080/health
```

---

## Running Tests

```bash
# Run tests across all services
npm run test

# Run tests for a single Java service
cd services/auth-service && mvn test

# Run tests for a single Python service
cd services/ai-service && pytest

# Run tests for a single Node service
cd services/gateway && npx vitest run
```

80% test coverage is required across all services.

---

## Environment Setup

Copy `.env.example` to `.env`. Each service's `README.md` lists the specific variables that service needs. Never commit `.env` to version control.

---

## Reference Docs

- [`docs/KitchenLedger_PRD_Enhanced.md`](docs/KitchenLedger_PRD_Enhanced.md) — product requirements and feature specs
- [`docs/KitchenLedger_TRD_v2_Microservices.md`](docs/KitchenLedger_TRD_v2_Microservices.md) — technical architecture and design decisions
