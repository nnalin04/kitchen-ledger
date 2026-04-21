# EPIC: TEST — Cross-Service & E2E Testing

**Phase:** 5 | **Ongoing** (unit/integration tests written within each service epic; E2E added here)
**Goal:** Verify end-to-end flows across all services, catch contract regressions, validate performance targets.
**Depends on:** All services deployed (full stack up)

---

## TEST-1: E2E Test Suite — Happy Paths (Playwright)

- [ ] Set up Playwright in `apps/web` test config:
  - `playwright.config.ts` — base URL `http://localhost:8080`, 3 retries, video on failure
  - Test user seeds: `e2e/fixtures/seed.ts` — create tenant + users via API before each test suite

- [ ] **E2E-1: Tenant Onboarding**
  - Register new tenant → setup wizard completes all 5 steps → verify `onboarding_done=true`
  - Owner invites a manager → manager receives invite email (mock Resend) → accepts → logs in
  - Verify manager can access inventory but not finance P&L

- [ ] **E2E-2: Daily Operations Flow**
  - Add inventory item with PAR level → verify low-stock alert when stock 0
  - Create supplier → create PO → send PO → receive delivery → confirm receipt → verify stock increased
  - Log waste for received item → verify stock decreased + movement created
  - Create DSR → fill all payment fields → reconcile → verify status = RECONCILED

- [ ] **E2E-3: Finance Flow**
  - Create expense with receipt photo → OCR fills vendor + amount → save → vendor payment recorded → P&L shows updated COGS
  - Create vendor → link to expense → record payment → verify AP aging balance decreases

- [ ] **E2E-4: Staff Scheduling**
  - Create 3 employees → create shifts for next week → publish schedule → verify notification created for each employee
  - Clock in employee → verify status = clocked_in → clock out → verify attendance record with total_hours
  - Create opening checklist task with requires_photo → complete with photo URL → verify completed_at set

- [ ] **E2E-5: AI OCR Flow**
  - Upload test notebook image (fixture) → OCR job created → poll until complete → confirm items → verify inventory updated

- [ ] **E2E-6: Tip Pool**
  - Create tip pool for today → add 3 employees with BY_HOURS rule → calculate → verify payout sum = total_tips → distribute → verify status = DISTRIBUTED

---

## TEST-2: Contract Tests Between Services

- [ ] `finance.tenant.created` consumer contract:
  - Publish `auth.tenant.created` with known tenant_id → verify Finance Service seeds exactly 20 accounts
- [ ] `notification.stock.low` consumer contract:
  - Publish `inventory.stock.low` with tenant_id + item data → verify Notification Service creates push notification records for owner + manager users
- [ ] `inventory.ocr.completed` consumer contract:
  - Publish `ai.ocr.completed` with context_type=inventory + result → verify Inventory Service updates stock records
- [ ] `finance.ocr.completed` consumer contract:
  - Publish `ai.ocr.completed` with context_type=expense + result → verify Finance Service updates expense fields

---

## TEST-3: Performance & Load Tests

- [ ] **P1 — Inventory list query:** 10,000 items per tenant → paginated query `GET /api/inventory/items` → p99 < 200ms; verify with `EXPLAIN ANALYZE`
- [ ] **P2 — RLS isolation:** 10 tenants, 1,000 rows each → concurrent requests → verify no cross-tenant row returned (automated assertion on all responses)
- [ ] **P3 — DSR reconcile concurrency:** 5 simultaneous reconcile requests for different tenants → all succeed, no data mixing
- [ ] **P4 — OCR throughput:** 5 concurrent Celery OCR jobs → all complete within 60s
- [ ] **P5 — Report generation:** P&L over 365 days of DSR + expense data → PDF generated in < 30 seconds

---

## TEST-4: Security Smoke Tests

- [ ] Verify RLS: direct PostgreSQL query without `app.current_tenant_id` set → returns 0 rows (not all-tenant)
- [ ] IDOR attempt: tenant A requests `/api/inventory/items/{id}` where id belongs to tenant B → 404 (not 403 — don't leak existence)
- [ ] JWT tamper: modify tenant_id claim → Gateway rejects with 401
- [ ] Internal endpoint abuse: `POST /internal/auth/verify-token` without `X-Internal-Secret` → 403
