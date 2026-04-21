# EPIC: DEPLOY — Deployment & DevOps

**Phase:** 5 | **Ongoing**
**Goal:** Production-ready Docker images, GCP Cloud Run deployment, GitHub Actions CI/CD, monitoring, Supabase production setup.
**Depends on:** All services with passing tests (≥ 80% coverage)

---

## DEPLOY-1: Production Dockerfiles

- [ ] **Java services** (auth, inventory, finance, staff) — multi-stage:
  ```dockerfile
  FROM maven:3.9-eclipse-temurin-21-alpine AS build
  WORKDIR /app
  COPY pom.xml .
  RUN mvn dependency:go-offline -q
  COPY src ./src
  RUN mvn package -DskipTests -q

  FROM eclipse-temurin:21-jre-alpine AS runtime
  RUN addgroup -S app && adduser -S app -G app
  WORKDIR /app
  COPY --from=build /app/target/*.jar app.jar
  USER app
  HEALTHCHECK --interval=30s --timeout=5s CMD wget -q --spider http://localhost:{PORT}/actuator/health || exit 1
  ENTRYPOINT ["java", "-jar", "app.jar"]
  ```
- [ ] **Python services** (ai, report) — slim image:
  ```dockerfile
  FROM python:3.12-slim
  RUN addgroup --system app && adduser --system --group app
  WORKDIR /app
  COPY requirements.txt .
  RUN pip install --no-cache-dir -r requirements.txt
  COPY . .
  USER app
  HEALTHCHECK CMD curl -f http://localhost:{PORT}/health || exit 1
  CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "{PORT}"]
  ```
- [ ] **Node.js services** (gateway, notification, file):
  ```dockerfile
  FROM node:22-alpine AS build
  WORKDIR /app
  COPY package*.json .
  RUN npm ci --only=production
  COPY . .
  RUN npm run build

  FROM node:22-alpine AS runtime
  RUN addgroup -S app && adduser -S app -G app
  WORKDIR /app
  COPY --from=build /app/dist ./dist
  COPY --from=build /app/node_modules ./node_modules
  USER app
  HEALTHCHECK CMD wget -q --spider http://localhost:{PORT}/health || exit 1
  CMD ["node", "dist/server.js"]
  ```
- [ ] Add `.dockerignore` per service (exclude: `.env`, `target/`, `node_modules/`, `__pycache__/`, `*.test.*`, `coverage/`)
- [ ] **Test:** `docker build` succeeds for all 9 services. `docker run` health check passes.

---

## DEPLOY-2: Supabase Production Setup

- [ ] Create Supabase project (Pro plan, $25/month), select correct region
- [ ] Run all service schema migrations against Supabase PostgreSQL in dependency order:
  1. Auth schema (V1__auth_schema.sql)
  2. Inventory schema (V1__inventory_schema.sql)
  3. Finance schema (V1__finance_schema.sql + V2__default_accounts.sql)
  4. Staff schema (V1__staff_schema.sql)
  5. AI jobs (Alembic 0002_ai_jobs.py)
  6. Report jobs (Alembic 0002_report_jobs.py)
  7. Notification schema (001_notifications.sql)
  8. File uploads (001_file_uploads.sql)
- [ ] Verify RLS active: `SELECT tablename FROM pg_tables WHERE schemaname='public'` cross-checked with `SELECT * FROM pg_policies`
- [ ] Create `kitchenledger-files` Storage bucket: private, max 10MB per object
- [ ] Configure Supabase Realtime: enable for `daily_sales_reports` + `notifications` tables
- [ ] Enable Point-in-Time Recovery (PITR) on Supabase project
- [ ] Create read-only database user for Report Service (SELECT only on all tables)

---

## DEPLOY-3: GCP Cloud Run Deployment

- [ ] GCP project setup: enable APIs (Cloud Run, Artifact Registry, Cloud SQL Admin, Memorystore, Secret Manager)
- [ ] Create Artifact Registry repositories: one per service (`kitchenledger/auth-service`, etc.)
- [ ] Configure Secret Manager secrets: `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `INTERNAL_SERVICE_SECRET`, `OPENAI_API_KEY`, `RESEND_API_KEY`, `EXPO_ACCESS_TOKEN`, `SUPABASE_SERVICE_KEY`, `MINDEE_API_KEY`, `GOOGLE_CLOUD_CREDENTIALS`
- [ ] Create Cloud Memorystore (Redis) instance (1GB, private VPC)
- [ ] Configure VPC connector for Cloud Run → Memorystore + Supabase private access
- [ ] Write `infrastructure/gcp/deploy.sh`:
  ```bash
  #!/bin/bash
  # Build + push + deploy all services
  for service in auth-service inventory-service finance-service staff-service \
                 ai-service report-service gateway notification-service file-service; do
    docker build -t gcr.io/$PROJECT/$service:$TAG ./services/$service
    docker push gcr.io/$PROJECT/$service:$TAG
    gcloud run deploy $service --image gcr.io/$PROJECT/$service:$TAG \
      --region $REGION --no-allow-unauthenticated --vpc-connector $VPC_CONNECTOR \
      --set-secrets="..." --min-instances=0
  done
  ```
- [ ] Gateway + Auth Service: set `--min-instances=1` (no cold start on login)
- [ ] Set Cloud Run CPU/memory per service: Java = 1 CPU / 512MB, Python = 0.5 CPU / 256MB, Node.js = 0.25 CPU / 128MB
- [ ] Configure Cloud Run domain mapping: `api.kitchenledger.app` → Gateway service

---

## DEPLOY-4: GitHub Actions CI/CD

- [ ] `.github/workflows/ci.yml` — triggers on PR to `main`:
  ```yaml
  jobs:
    test-java:
      strategy: matrix: [auth-service, inventory-service, finance-service, staff-service]
      steps: checkout → setup-java 21 → mvn test → upload JaCoCo report → fail if coverage < 80%

    test-python:
      strategy: matrix: [ai-service, report-service]
      steps: checkout → setup-python 3.12 → pip install → pytest --cov --cov-fail-under=80

    test-node:
      strategy: matrix: [gateway, notification-service, file-service]
      steps: checkout → setup-node 22 → npm ci → npx vitest run --coverage → fail if < 80%

    test-web:
      steps: checkout → setup-node 22 → npm ci → npx tsc --noEmit → npx vitest run

    lint:
      steps: ESLint (Node/Web), spotless (Java), ruff (Python)
  ```
- [ ] `.github/workflows/deploy.yml` — triggers on push to `main`:
  ```yaml
  jobs:
    deploy:
      steps:
        - Authenticate to GCP (Workload Identity)
        - Build + push all Docker images to Artifact Registry (matrix, parallel)
        - Deploy services in order: auth → inventory/finance/staff (parallel) → gateway → notification/report/file (parallel) → ai
        - Run smoke test: curl {GATEWAY_URL}/health → verify all services "ok"
        - On failure: send Slack alert
  ```
- [ ] Set all secrets in GitHub repository Settings → Secrets

---

## DEPLOY-5: Monitoring & Observability

- [ ] **Structured logging** in all services:
  - Java: `logback-spring.xml` with JSON encoder (`logstash-logback-encoder`); include `tenant_id`, `request_id` in MDC
  - Python: `structlog` with JSON renderer; include `tenant_id`, `job_id`
  - Node.js: `pino` JSON transport (already in Gateway); ensure all services use pino
- [ ] **Cloud Monitoring** alert policies:
  - Error rate > 5% per service for 5 consecutive minutes → PagerDuty alert
  - p99 latency > 2s for Gateway for 5 minutes → alert
  - RabbitMQ queue depth > 100 for any queue for 10 minutes → alert
  - Supabase connection pool > 80% for 5 minutes → alert
- [ ] **Health dashboard** (Cloud Monitoring dashboard):
  - Per-service: request count, error rate, p50/p99 latency
  - RabbitMQ: queue depths, message rate
  - Redis: memory usage, hit rate
  - Supabase: active connections, slow query count
- [ ] Expose `/actuator/metrics` (Java) + Prometheus-compatible `/metrics` (Python via `prometheus-fastapi-instrumentator`)
