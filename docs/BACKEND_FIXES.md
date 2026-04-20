# KitchenLedger Backend Fixes — Open Items Only

Last updated: 2026-04-20
Source: comprehensive backend code audit (backend services only)

This document intentionally contains only unfinished backend work. Completed fixes were removed.

---

## How To Use This Backlog

1. Execute in priority order: `CRITICAL` -> `HIGH` -> `MEDIUM`.
2. Each task has implementation scope, exact code references, and test requirements.
3. Do not mark a task done unless all acceptance criteria and listed tests pass.
4. Keep commits scoped by task id (example: `fix(backend): CRIT-01 align rabbit event envelope`).

---

## CRITICAL (must complete before production rollout)

## [x] CRIT-01 — Normalize RabbitMQ event envelope contract across services

**What this fixes**
Cross-service events are currently not consistently parsed, causing dropped business notifications and broken automations.

**Current breakage evidence**
- Notification consumer parses snake_case envelope keys: `event_type`, `tenant_id`.
  - `services/notification-service/src/consumers/event.consumer.ts:52-59`
- Java publishers/listeners use camelCase fields: `eventType`, `tenantId`.
  - `services/inventory-service/src/main/java/com/kitchenledger/inventory/event/EventEnvelope.java:11-18`
  - `services/finance-service/src/main/java/com/kitchenledger/finance/event/EventEnvelope.java:11-18`
  - `services/staff-service/src/main/java/com/kitchenledger/staff/event/EventEnvelope.java:11-18`

**Implementation tasks**
- [x] Decide canonical envelope format (recommended: snake_case to match TRD and non-Java consumers).
- [x] Update Java `EventEnvelope` serialization with explicit JSON aliases/naming strategy.
- [x] Update notification consumer parser to support both formats during migration window.
- [x] Add schema validation in notification consumer before `handleEvent`.
- [x] Add contract tests that publish real envelopes from each publisher service and assert consumer processing.

**Acceptance criteria**
- Any event produced by auth/inventory/finance/staff/ai can be consumed by notification-service without format-specific failures.
- Unknown/malformed envelope is NACKed and moved to DLQ with structured error log.

**Tests to add**
- `services/notification-service/src/__tests__/consumers/event-envelope.contract.test.ts`
- `services/inventory-service/src/test/java/.../event/EventEnvelopeSerializationTest.java`
- `services/finance-service/src/test/java/.../event/EventEnvelopeSerializationTest.java`
- `services/staff-service/src/test/java/.../event/EventEnvelopeSerializationTest.java`

**Estimate**: 8-12 hours

---

## [x] CRIT-02 — Fix push notification fan-out for tenant-wide alerts

**What this fixes**
Critical alerts are persisted but not actually pushed to devices when `userId` is null.

**Current breakage evidence**
- Event handlers set `userId: null` for most critical push cases.
  - `services/notification-service/src/consumers/event.consumer.ts:106-236, 243-260`
- Dispatcher only sends push if `n.userId` is present.
  - `services/notification-service/src/providers/dispatcher.ts:31-39`

**Implementation tasks**
- [ ] Implement tenant-recipient fan-out query (owners/managers by event type).
- [ ] For fan-out events, send one push per recipient while storing one notification record per recipient (or a broadcast model with join table).
- [ ] Keep idempotency guard to avoid duplicate sends when message redelivers.
- [ ] Add metrics counters: attempted, sent, failed, skipped-no-token.

**Acceptance criteria**
- `inventory.stock.low`, `inventory.stock.expiring`, `finance.cash.discrepancy`, `staff.employee.noshow`, `staff.overtime.approaching` produce real push sends to intended tenant recipients.
- Redelivery of same event does not double-send.

**Tests to add**
- `services/notification-service/src/__tests__/providers/dispatcher.fanout.test.ts`
- `services/notification-service/src/__tests__/consumers/event.consumer.push-routing.test.ts`

**Estimate**: 10-14 hours

---

## [x] CRIT-03 — Repair `ai.ocr.completed` payload contract between AI and Inventory

**What this fixes**
AI OCR completion event is published, but inventory prefill flow silently skips due to incompatible payload shape.

**Current breakage evidence**
- AI publishes payload with nested `result` and `file_upload_id`.
  - `services/ai-service/app/workers/tasks.py:89-98`
- Inventory listener expects top-level `reference_id` and `line_items`.
  - `services/inventory-service/src/main/java/com/kitchenledger/inventory/event/InventoryEventListener.java:36-47`

**Implementation tasks**
- [ ] Define versioned OCR-completed schema in shared contract doc (`v1`/`v2`).
- [ ] Update AI publisher to include fields inventory requires (`reference_id`, normalized `line_items`) or update inventory listener to read from `result`.
- [ ] Enforce schema validation on both producer and consumer.
- [ ] Add backward compatibility handling until all environments are migrated.
- [ ] Add dead-letter diagnostic reason when payload cannot be mapped.

**Acceptance criteria**
- Upload -> OCR complete -> inventory prefill executes for supported doc types without manual payload patching.
- Invalid payload transitions to DLQ with actionable log context.

**Tests to add**
- `services/ai-service/tests/workers/test_ocr_event_payload.py`
- `services/inventory-service/src/test/java/.../event/InventoryEventListenerTest.java` (valid + invalid payloads)
- End-to-end integration test across ai-service and inventory-service (docker compose profile)

**Estimate**: 8-10 hours

---

## [x] CRIT-04 — Make report service internal dependencies real (not best-effort empty fallbacks)

**What this fixes**
Several report types currently return partial/empty data because report-service calls internal endpoints that do not exist.

**Current breakage evidence**
- Report worker calls non-existent endpoints:
  - `/internal/inventory/counts` and `/internal/inventory/recipes`
  - `/internal/audit/logs`
  - `services/report-service/app/workers/tasks.py:145-147, 189-191, 229-231`
- Audit route calls internal audit endpoints not implemented in source services:
  - `services/report-service/app/routers/reports.py:382-386`
- Existing internal controllers expose only:
  - Inventory: items/waste routes (`services/inventory-service/src/main/java/com/kitchenledger/inventory/controller/InternalInventoryController.java:41-105`)
  - Finance: dsr/expenses (`services/finance-service/src/main/java/com/kitchenledger/finance/controller/InternalFinanceController.java:35-66`)
  - Staff: attendance (`services/staff-service/src/main/java/com/kitchenledger/staff/controller/InternalStaffController.java:44-76`)

**Implementation tasks**
- [ ] Finalize internal API contract for report dependencies (request params + response schema + pagination).
- [ ] Implement missing endpoints in inventory/finance/staff for required report sources.
- [ ] Remove silent fallback-to-empty behavior for hard dependencies; return explicit partial-failure metadata.
- [ ] Add retries/timeouts with bounded fallback policy per endpoint.

**Acceptance criteria**
- All report types listed in report service are backed by real source endpoints.
- Missing upstream data is reported as structured report generation failure, not silently empty report.

**Tests to add**
- `services/report-service/tests/workers/test_fetch_data_contracts.py`
- `services/inventory-service/src/test/java/.../controller/InternalInventoryControllerIT.java` (counts/recipes/audit)
- `services/finance-service/src/test/java/.../controller/InternalFinanceControllerIT.java` (audit)
- `services/staff-service/src/test/java/.../controller/InternalStaffControllerIT.java` (audit)

**Estimate**: 16-24 hours

---

## HIGH PRIORITY (core backend features incomplete vs PRD)

## [x] HIGH-01 — Complete Purchase Order lifecycle implementation (`draft -> sent -> partial -> received -> closed`)

**What this fixes**
PO status enum includes full lifecycle, but service logic skips `partial` and `closed`, causing workflow mismatch.

**Current gap evidence**
- Enum has statuses: `draft, sent, partial, received, closed, cancelled`.
  - `services/inventory-service/src/main/java/com/kitchenledger/inventory/model/enums/PurchaseOrderStatus.java:3-4`
- Service only transitions to `sent`, `received`, `cancelled`.
  - `services/inventory-service/src/main/java/com/kitchenledger/inventory/service/PurchaseOrderService.java:70-106`

**Implementation tasks**
- [ ] Add partial-receipt flow with per-line received qty tracking.
- [ ] Transition to `partial` when some but not all quantities are received.
- [ ] Transition to `received` when all lines received.
- [ ] Add explicit close action (`received -> closed`) with guardrails.
- [ ] Emit status-change events with previous/new status.

**Acceptance criteria**
- Full lifecycle can be executed through API without manual DB changes.
- Over-receipt rule enforced (unless explicit override role).

**Tests to add**
- `services/inventory-service/src/test/java/.../service/PurchaseOrderServiceLifecycleTest.java`
- API integration tests for each state transition + invalid transitions.

**Estimate**: 12-18 hours

---

## [x] HIGH-02 — Implement PAR formula and auto-suggested PO generation

**What this fixes**
Low stock detection exists, but PRD-required PAR formula and auto-order suggestion are not implemented end-to-end.

**Implementation tasks**
- [ ] Persist `avg_daily_usage`, `lead_time_days`, `safety_stock`, computed `par_level` per item.
- [ ] Add recalculation job: `(avg_daily_usage * lead_time_days) + safety_stock`.
- [ ] Generate PO suggestion records when stock < PAR.
- [ ] Expose suggestion endpoints for manager review/approve.
- [ ] Publish `inventory.stock.low` with suggestion reference.

**Acceptance criteria**
- Items below PAR have deterministic suggested PO quantities.
- Suggestions are tenant-scoped and auditable.

**Tests to add**
- Service tests for threshold calculations.
- Repository tests for low-stock query performance with tenant+status indexes.
- Controller tests for suggestion create/list/approve.

**Estimate**: 14-20 hours

---

## [x] HIGH-03 — Enforce FEFO (not FIFO) for perishable inventory consumption

**What this fixes**
Perishable deduction currently lacks explicit FEFO allocation guarantees.

**Implementation tasks**
- [ ] Add batch/lot expiry-aware allocation service.
- [ ] Ensure deduction paths (waste, recipe usage, transfer) consume earliest-expiry batch first.
- [ ] Introduce override/audit path for manual non-FEFO adjustments.

**Acceptance criteria**
- For multiple batches of same item, earliest expiry batch is deducted first.
- Override actions produce audit log entries.

**Tests to add**
- Unit tests for batch allocation ordering.
- Integration tests for mixed batch inventories and edge cases (equal expiry, expired stock).

**Estimate**: 12-16 hours

---

## [x] HIGH-04 — Staff scheduling rule completion (clopen, publish window, cross-midnight, no-show detection)

**What this fixes**
Shift engine currently allows invalid operational scenarios and misses no-shows for published shifts.

**Current gap evidence**
- Rejects any shift where `start_time >= end_time`, so cross-midnight shifts are impossible.
  - `services/staff-service/src/main/java/com/kitchenledger/staff/service/ShiftService.java:50-52`
- No clopen prevention or minimum 2-week publish rule in service logic.
  - `services/staff-service/src/main/java/com/kitchenledger/staff/service/ShiftService.java:48-99`
- No-show job checks only `scheduled` status, not published/confirmed states.
  - `services/staff-service/src/main/java/com/kitchenledger/staff/job/NoShowDetectionJob.java:43-46`

**Implementation tasks**
- [ ] Add cross-midnight shift model (`shift_end_datetime` or `ends_next_day` semantics).
- [ ] Add clopen rule check (configurable minimum rest gap).
- [ ] Enforce publish window rule (>=14 days unless override permission).
- [ ] Update no-show query to include relevant live statuses and avoid duplicate event emission.

**Acceptance criteria**
- Shift spanning 11 PM-3 AM is valid and correctly reported.
- Clopen scheduling is blocked by default.
- Publishing a schedule inside 14-day window requires authorized override.

**Tests to add**
- `services/staff-service/src/test/java/.../service/ShiftServiceRulesTest.java`
- `services/staff-service/src/test/java/.../job/NoShowDetectionJobTest.java`

**Estimate**: 14-22 hours

---

## [x] HIGH-05 — Expand Finance DSR model to PRD-required fields

**What this fixes**
Current DSR entity does not capture full PRD reconciliation and channel breakdown requirements.

**Current gap evidence**
- Current DSR fields are limited compared with PRD (missing explicit comps, voids, gift cards, wallet breakdown, tips collected breakdown, guest/avg-check derived guardrails, manager auth references for void/comp/discount workflows).
  - `services/finance-service/src/main/java/com/kitchenledger/finance/model/DailySalesReport.java:29-127`

**Implementation tasks**
- [ ] Add missing DSR columns via migration (with backfill/default strategy).
- [ ] Split payment channels to required granularity.
- [ ] Add manager-authorization linkage for void/comp/discount records.
- [ ] Add reconciliation threshold config and alert trigger linkage.

**Acceptance criteria**
- DSR API can ingest and return all required PRD dimensions without custom fields.
- Reconciliation behavior uses configurable threshold and produces consistent discrepancy events.

**Tests to add**
- Migration + repository compatibility tests.
- DSR controller/service tests for full payload validation and persistence.

**Estimate**: 16-24 hours

---

## [x] HIGH-06 — Remove report-service no-op baseline migration ambiguity

**What this fixes**
`0001_baseline` is still a no-op, making environment bootstrap and migration lineage ambiguous.

**Current evidence**
- Baseline migration has `pass` for upgrade/downgrade.
  - `services/report-service/alembic/versions/0001_baseline.py:17-23`

**Implementation tasks**
- [ ] Replace no-op baseline with deterministic initial schema migration strategy.
- [ ] Document upgrade path for existing environments already stamped at `0001`.
- [ ] Ensure `report_jobs` schema is reproducible from clean DB with no manual SQL.

**Acceptance criteria**
- Fresh DB migration creates complete report schema.
- Existing DBs can migrate without destructive reset.

**Tests to add**
- Migration smoke test in CI (empty DB -> head).
- Downgrade/upgrade test for report-service migration chain.

**Estimate**: 6-10 hours

---

## MEDIUM PRIORITY (stability, operability, and CI hardening)

## [x] MED-01 — Add readiness endpoints (`/ready`) across backend services

**What this fixes**
Health checks exist, but readiness probes are missing; deploy orchestration cannot distinguish startup vs ready-to-serve.

**Current evidence**
- Gateway health route exists (`/health`) with aggregated checks.
  - `services/gateway/src/routes/health.ts:22-53`
- No explicit `/ready` implementation found in backend services.

**Implementation tasks**
- [ ] Add `/ready` per service (DB/Rabbit/Redis/external dependency minimal checks).
- [ ] Update docker-compose and deployment probes to use `/ready` for readiness, `/health` for liveness.

**Acceptance criteria**
- During startup and dependency outages, `/health` and `/ready` differ correctly.

**Tests to add**
- Minimal integration tests for readiness route behavior under dependency mock failures.

**Estimate**: 8-12 hours

---

## [x] MED-02 — Add `.dockerignore` to all backend services

**What this fixes**
No service-level `.dockerignore` files were found, increasing image bloat and risk of copying dev/test artifacts.

**Current evidence**
- `find services -maxdepth 2 -name .dockerignore` returned no results.

**Implementation tasks**
- [ ] Add `.dockerignore` in each service directory.
- [ ] Exclude: `.env*`, tests (if not needed at runtime), caches, build outputs, VCS files.

**Acceptance criteria**
- Image build contexts shrink materially.
- Sensitive local files are not sent to Docker daemon.

**Estimate**: 3-4 hours

---

## [x] MED-03 — Stop publishing mutable `:latest` images from main build workflow

**What this fixes**
Mutable `latest` tags reduce rollback safety and reproducibility.

**Current evidence**
- Build workflow publishes both SHA tag and `:latest`.
  - `.github/workflows/build.yml:42-45`

**Implementation tasks**
- [ ] Keep immutable tags (`sha`, optionally semver/release).
- [ ] Restrict `latest` to explicit release workflow only (optional).
- [ ] Update deploy manifests to consume immutable tags.

**Acceptance criteria**
- Production deployments reference immutable image tags only.

**Estimate**: 2-4 hours

---

## [x] MED-04 — Add contract and end-to-end test coverage for cross-service event/report flows

**What this fixes**
Most failures above are integration-contract failures not caught by current tests.

**Implementation tasks**
- [ ] Add consumer contract tests for every Rabbit event consumed.
- [ ] Add report dependency contract tests per internal endpoint.
- [ ] Add one nightly E2E backend workflow covering:
  - OCR completion -> inventory prefill
  - cash discrepancy -> notification push fan-out
  - report job -> upstream fetch -> generated output

**Acceptance criteria**
- Contract mismatch causes CI failure before merge.

**Estimate**: 16-24 hours

---

## Suggested Execution Order (immediate)

1. `CRIT-01` event envelope normalization
2. `CRIT-03` OCR payload contract repair
3. `CRIT-02` notification push fan-out
4. `CRIT-04` report internal dependency completion
5. `HIGH-01` PO lifecycle
6. `HIGH-04` staff scheduling rule completion
7. `HIGH-05` DSR field parity
8. Remaining high/medium tasks

---

## Definition of Done (for every task above)

A task is complete only when all are true:
- [ ] Code changes merged for all impacted services
- [ ] Required migrations created and applied locally
- [ ] New tests added and passing in CI
- [ ] No cross-tenant leakage introduced
- [ ] Audit logs/events updated where behavior changed
- [ ] `docs/BACKEND_FIXES.md` checkbox marked complete with PR link
