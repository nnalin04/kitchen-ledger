# KitchenLedger Backend Fixes — Open Items Only

Last updated: 2026-04-20
Source: Round 3 comprehensive backend audit (all prior round items are complete and removed)

This document contains only unfinished backend work discovered in Round 3 audit. All Round 1 (CRIT-01–CRIT-04) and Round 2 (HIGH-01–HIGH-06, MED-01–MED-04) items are complete.

---

## How To Use This Backlog

1. Execute in priority order: `CRITICAL` -> `HIGH` -> `MEDIUM` -> `LOW`.
2. Each task has implementation scope, exact code references, and test requirements.
3. Do not mark a task done unless all acceptance criteria and listed tests pass.
4. Keep commits scoped by task id (example: `fix(backend): NC-1 fix outbox replay envelope`).

---

## CRITICAL (must complete before production rollout)

---

### [x] NC-1 — OutboxReplayJob sends raw inner payload instead of full EventEnvelope

**What this fixes**
Every event that goes through the outbox fallback path is delivered as a bare payload Map, not a wrapped EventEnvelope. Consumers that expect the standard envelope (with `event_type`, `tenant_id`, `event_id`, `produced_at`, etc.) will fail to parse these replayed events, dropping them silently or routing them to the DLQ with no actionable log.

**Current breakage evidence**
- `StaffEventPublisher.saveToOutbox()` stores only the inner payload Map, not the full envelope:
  - `services/staff-service/src/main/java/com/kitchenledger/staff/event/StaffEventPublisher.java`
- `OutboxReplayJob.replayPending()` reads the stored JSON back and sends it as-is:
  ```java
  Map<String, Object> payload = objectMapper.readValue(event.getPayload(), new TypeReference<>() {});
  rabbitTemplate.convertAndSend(exchange, event.getRoutingKey(), payload); // sends bare Map
  ```
  - Same pattern in all four Java services:
    - `services/auth-service/src/main/java/com/kitchenledger/auth/event/OutboxReplayJob.java`
    - `services/inventory-service/src/main/java/com/kitchenledger/inventory/event/OutboxReplayJob.java`
    - `services/finance-service/src/main/java/com/kitchenledger/finance/event/OutboxReplayJob.java`
    - `services/staff-service/src/main/java/com/kitchenledger/staff/event/OutboxReplayJob.java`

**Implementation tasks**
- [ ] Change every `saveToOutbox()` call to serialize the full `EventEnvelope` object (not just `payload`) into the `event_outbox.payload` column.
- [ ] Update `OutboxReplayJob.replayPending()` in all four services to deserialize the stored JSON into `EventEnvelope` and publish that object, not the inner Map.
- [ ] Add a DB migration or backfill script to convert any existing outbox rows that stored only the inner payload (mark them as permanently failed with a reason, or re-wrap them if possible).
- [ ] Add a structured log line when outbox replay publishes an event so replay can be observed in production.

**Acceptance criteria**
- An event that enters the outbox (e.g., because RabbitMQ was unavailable) is delivered to consumers with a fully-valid envelope identical to what a live publish produces.
- Consumers process replayed events without format-specific errors.
- Existing rows that cannot be re-wrapped are moved to a failed state with a `reason` log, not silently skipped.

**Tests to add**
- `services/staff-service/src/test/java/.../event/OutboxReplayJobTest.java` — assert replayed message has correct EventEnvelope fields
- Same for auth, inventory, finance OutboxReplayJob
- Integration test: simulate RabbitMQ outage → verify outbox write → restore connection → verify consumer receives valid envelope

**Estimate**: 6–10 hours

---

### [x] NC-2 — `auth.password.reset.requested` event is published but never routed or handled

**What this fixes**
The forgot-password flow publishes an event that has no RabbitMQ binding and no handler in notification-service. Password-reset emails are never sent. Users who click "Forgot Password" receive no email.

**Current breakage evidence**
- `PasswordResetService.forgotPassword()` calls `eventPublisher.publishPasswordResetRequested(user, rawToken)`:
  - `services/auth-service/src/main/java/com/kitchenledger/auth/service/PasswordResetService.java`
- `AuthEventPublisher.publishPasswordResetRequested()` publishes to routing key `auth.password.reset.requested` but:
  - `infrastructure/rabbitmq/setup.sh` has no `bind notification-service "auth.password.reset.requested"` line
  - `services/notification-service/src/consumers/event.consumer.ts` has no `case 'auth.password.reset.requested':` in its switch
- The event is published into the void — no consumer ever receives it.

**Implementation tasks**
- [ ] Add binding in `infrastructure/rabbitmq/setup.sh`:
  ```bash
  bind notification-service "auth.password.reset.requested"
  ```
- [ ] Add handler in `services/notification-service/src/consumers/event.consumer.ts`:
  ```typescript
  case 'auth.password.reset.requested':
    await handlePasswordReset(payload);
    break;
  ```
- [ ] Implement `handlePasswordReset()` that sends a transactional email via Resend with the reset link constructed from `payload.reset_token` and the tenant's configured domain.
- [ ] Ensure the reset token is NOT logged at INFO level (security — see NL-5).
- [ ] Verify the `auth.password.reset.requested` queue is declared with `x-dead-letter-exchange` argument (see NM-3).

**Acceptance criteria**
- Calling `POST /api/v1/auth/forgot-password` results in a password-reset email being delivered to the user.
- If notification-service is unavailable, the event enters the outbox and is retried.
- If the event cannot be processed after retries, it lands in the DLQ with a structured error log (not silently dropped).

**Tests to add**
- `services/notification-service/src/__tests__/consumers/password-reset.handler.test.ts` — unit test handler with mock email client
- `services/auth-service/src/test/java/.../service/PasswordResetServiceTest.java` — assert event is published on `forgotPassword()` call
- Contract test: auth-service publishes envelope; notification-service handler receives and processes it

**Estimate**: 4–6 hours

---

## HIGH PRIORITY (correctness and data integrity)

---

### [ ] NH-1 — Cross-service Flyway migration dependency on `audit_trigger_fn()` has no ordering guarantee

**What this fixes**
`audit_trigger_fn()` is defined in `services/auth-service` migration `V2__audit_triggers.sql`. The inventory, finance, and staff services all call this function in their own `V2`/`V3`/`V4` trigger migrations. If any of those services run their migration before auth-service has run its V2, the migration fails with `function audit_trigger_fn() does not exist` and the service cannot start.

**Current breakage evidence**
- Function definition lives in auth-service only:
  - `services/auth-service/src/main/resources/db/migration/V2__audit_triggers.sql`
- All three other services create triggers that reference it:
  - `services/inventory-service/src/main/resources/db/migration/V3__audit_triggers.sql`
  - `services/finance-service/src/main/resources/db/migration/V3__audit_triggers.sql`
  - `services/staff-service/src/main/resources/db/migration/V2__audit_triggers.sql`
- Docker Compose and CI have no enforced startup ordering that ensures auth-service migrates before others.

**Implementation tasks**
- [ ] Move `audit_trigger_fn()` creation out of auth-service into a shared `V1__shared_functions.sql` migration applied via a dedicated schema migration step (or a shared Flyway baseline that all services reference).
- [ ] Alternatively, make each service's trigger migration idempotent by including `CREATE OR REPLACE FUNCTION audit_trigger_fn() ...` inline so there is no cross-service dependency.
- [ ] Add a Docker Compose `depends_on` with `condition: service_healthy` from inventory/finance/staff to auth-service to guarantee migration order in local dev.
- [ ] Add a CI smoke test: run each service's Flyway migration in isolation against a clean DB and assert it completes without error.

**Acceptance criteria**
- Each service's migrations can be applied to a clean DB in any order without error.
- `docker-compose up` reliably starts all services without migration race failures.

**Tests to add**
- CI migration isolation test: for each Java service, spin up a Testcontainers PostgreSQL, run Flyway migrate, assert schema version matches expected head — no dependency on other services.

**Estimate**: 4–8 hours

---

### [x] NH-2 — `ShiftService.delete()` performs a hard delete, violating soft-delete rule

**What this fixes**
Deleting a shift removes the row entirely, breaking any `attendance` records that FK-reference `shifts.id`, and violating the project-wide soft-delete mandate. This causes FK constraint violations and loses historical scheduling data.

**Current breakage evidence**
- Hard delete in service:
  - `services/staff-service/src/main/java/com/kitchenledger/staff/service/ShiftService.java` — `delete()` method
  ```java
  shiftRepository.delete(shift); // hard delete — breaks FK refs from attendance
  ```
- Attendance table has `shift_id UUID REFERENCES shifts(id)` — FK will violate or cascade-delete attendance records.
- All other entity deletions in the codebase use `entity.setDeletedAt(Instant.now()); repository.save(entity)`.

**Implementation tasks**
- [ ] Replace `shiftRepository.delete(shift)` with:
  ```java
  shift.setDeletedAt(Instant.now());
  shiftRepository.save(shift);
  ```
- [ ] Confirm `Shift` entity has a `deleted_at` column mapped in JPA (add if missing).
- [ ] Ensure all shift queries use `WHERE deleted_at IS NULL` (via `@Where` annotation or explicit JPQL).
- [ ] Check `ShiftController` and any other callers for the same pattern.

**Acceptance criteria**
- `DELETE /api/v1/shifts/{id}` sets `deleted_at` and returns 204; the shift row remains in DB.
- Attendance records with a FK to the soft-deleted shift remain intact.
- Soft-deleted shifts do not appear in any listing queries.

**Tests to add**
- `services/staff-service/src/test/java/.../service/ShiftServiceTest.java` — assert delete sets `deleted_at` and does not remove the row
- Repository-level test: confirm soft-deleted shift not returned by `findAll()` but present with a raw query

**Estimate**: 2–4 hours

---

### [x] NH-3 — `TipPoolService.distribute()` is a no-op stub — no calculation performed

**What this fixes**
Calling the tip distribution endpoint marks the pool as `distributed=true` and sets `distributedAt`, but never calculates how much each employee receives, never writes any distribution records, and never credits employee accounts. Tip distribution is entirely missing.

**Current breakage evidence**
- `TipPoolService.distribute()` in:
  - `services/staff-service/src/main/java/com/kitchenledger/staff/service/TipPoolService.java`
  - Method sets `distributed=true` and `distributedAt = Instant.now()` then saves — no math, no per-employee records.
- No `tip_pool_distributions` table exists in any migration.
- No per-employee allocation logic anywhere in the service.

**Implementation tasks**
- [ ] Add DB migration for `tip_pool_distributions` table: `id`, `tenant_id`, `tip_pool_id`, `employee_id`, `amount NUMERIC(12,2)`, `distributed_at`, `created_at`. Enable RLS.
- [ ] Implement allocation algorithm in `TipPoolService.distribute()`:
  - Fetch all eligible employees for the pool (by role/shift/config).
  - Calculate share per employee based on configured method (equal split, hours-weighted, point-based).
  - Write one `tip_pool_distributions` row per employee in the same transaction.
  - Mark pool `distributed=true` only after all rows are written.
- [ ] Return per-employee breakdown in the API response.
- [ ] Publish a `staff.tip.distributed` event with tenant, pool, and total amount.

**Acceptance criteria**
- `POST /api/v1/tip-pools/{id}/distribute` writes one distribution row per eligible employee.
- Total distributed amount equals the pool's `total_amount` (within rounding tolerance).
- Re-calling distribute on an already-distributed pool returns 409 Conflict.
- Distribution is atomic — partial failure rolls back all rows.

**Tests to add**
- `services/staff-service/src/test/java/.../service/TipPoolServiceTest.java` — assert correct per-employee amounts for equal split, hours-weighted, and edge cases (single employee, zero pool)
- Controller integration test for the distribute endpoint
- Repository test: assert distribution rows are written and queryable per employee

**Estimate**: 10–14 hours

---

### [x] NH-4 — `StockReceiptService.confirm()` has TOCTOU race — concurrent confirms double-count inventory

**What this fixes**
Two concurrent HTTP requests to confirm the same stock receipt can both pass the `if (receipt.isConfirmed())` guard and both apply inventory increments, resulting in double-counted stock.

**Current breakage evidence**
- `StockReceiptService.confirm()` at the optimistic check:
  - `services/inventory-service/src/main/java/com/kitchenledger/inventory/service/StockReceiptService.java`
  ```java
  if (receipt.isConfirmed()) throw new ConflictException("Already confirmed");
  // gap here — second thread passes the same check
  receipt.setConfirmed(true);
  // inventory incremented for both threads
  ```
- No `SELECT FOR UPDATE` or `@Version` optimistic lock on `StockReceipt` entity.

**Implementation tasks**
- [ ] Add a `version INT` column to `stock_receipts` via migration and map it with `@Version` on the entity — Spring Data JPA will throw `OptimisticLockingFailureException` on concurrent update.
- [ ] Alternatively (or additionally), use `shiftRepository.findByIdForUpdate(id)` (`SELECT FOR UPDATE`) inside the `@Transactional` confirm method to serialize concurrent confirms at the DB level.
- [ ] Catch `OptimisticLockingFailureException` in the controller and return 409 Conflict with a message the client can act on.
- [ ] Confirm the `@Transactional` boundary covers both the guard check and the inventory increment.

**Acceptance criteria**
- Sending two simultaneous confirm requests for the same receipt results in exactly one success (200) and one conflict (409).
- Inventory is incremented exactly once regardless of concurrent access.

**Tests to add**
- `services/inventory-service/src/test/java/.../service/StockReceiptServiceTest.java` — concurrent confirm test using two threads; assert inventory incremented once
- Unit test for `OptimisticLockingFailureException` → 409 mapping in controller advice

**Estimate**: 4–6 hours

---

### [ ] NH-5 — `event_outbox` table has `tenant_id` column but no RLS policy

**What this fixes**
The outbox table stores sensitive event payloads (including user data, financial amounts, token values) scoped by tenant. Without RLS, a compromised DB session could read or write cross-tenant outbox rows.

**Current breakage evidence**
- Migration adds `tenant_id` column but no RLS:
  - `services/auth-service/src/main/resources/db/migration/V3__event_outbox.sql` (and equivalent in inventory, finance, staff)
  - Has `tenant_id UUID NOT NULL` but no `ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY` or policy.
- All other domain tables in the project have RLS enabled per the non-negotiable DB design rules.

**Implementation tasks**
- [ ] Add a follow-up migration in each Java service to enable RLS on `event_outbox`:
  ```sql
  ALTER TABLE event_outbox ENABLE ROW LEVEL SECURITY;
  CREATE POLICY event_outbox_tenant_isolation ON event_outbox
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);
  ```
- [ ] Confirm the `OutboxReplayJob` sets `app.current_tenant_id` before querying outbox rows (it may need to iterate per-tenant or use a privileged role that bypasses RLS for the job context).

**Acceptance criteria**
- Direct DB session with a non-superuser role cannot read another tenant's outbox rows.
- `OutboxReplayJob` still successfully reads and replays all pending rows across tenants using its privileged service role.

**Tests to add**
- Migration smoke test: verify RLS policy exists on `event_outbox` after migration
- DB-level integration test: assert cross-tenant outbox read is rejected

**Estimate**: 3–5 hours

---

### [ ] NH-6 — `AttendanceService.checkOvertimeApproaching()` hardcodes timezone `Asia/Kolkata`

**What this fixes**
Multi-tenant SaaS serving restaurants in multiple timezones. Overtime calculations using a hardcoded timezone produce wrong results (and compliance failures) for any tenant not in `Asia/Kolkata`.

**Current breakage evidence**
- Hardcoded timezone in two places:
  - `services/staff-service/src/main/java/com/kitchenledger/staff/service/AttendanceService.java` — `checkOvertimeApproaching()` method
  ```java
  ZoneId zone = ZoneId.of("Asia/Kolkata"); // appears twice
  ```
- `Tenant` entity/table in auth-service has a `timezone` field but `AttendanceService` never reads it.

**Implementation tasks**
- [ ] Add `timezone VARCHAR(64)` to the `tenants` table (if not already present) with a default of `UTC`.
- [ ] Expose a `GET /internal/auth/tenants/{tenantId}` endpoint (or extend the existing one) to return `timezone`.
- [ ] In `AttendanceService`, resolve the tenant's timezone via an internal call to auth-service (cache per tenant to avoid hot-path N+1).
- [ ] Replace both hardcoded `ZoneId.of("Asia/Kolkata")` usages with `ZoneId.of(tenant.getTimezone())`.
- [ ] Apply the same fix anywhere else in the codebase that hardcodes a timezone (grep `Asia/Kolkata`).

**Acceptance criteria**
- Overtime check uses the tenant's configured timezone, not a hardcoded one.
- A tenant configured to `America/New_York` gets correct overtime windows for their local time.

**Tests to add**
- `services/staff-service/src/test/java/.../service/AttendanceServiceTest.java` — test overtime calculation with multiple tenant timezone configurations
- Parameterized test: `UTC`, `America/New_York`, `Asia/Kolkata` — each produces the correct window

**Estimate**: 4–6 hours

---

## MEDIUM PRIORITY (stability, correctness, and operability)

---

### [ ] NM-1 — `publishUserInvited()` payload missing `full_name` and `tenant_name`

**What this fixes**
Invite emails address recipients by their email address instead of their name because the event payload doesn't include `full_name` or `tenant_name`. Poor UX and unprofessional for a restaurant management product.

**Current breakage evidence**
- `AuthEventPublisher.publishUserInvited()` payload contains only `user_id`, `email`, `role`, `invite_token`:
  - `services/auth-service/src/main/java/com/kitchenledger/auth/event/AuthEventPublisher.java`
- Notification-service invite handler has no `full_name` or `tenant_name` to use in email template.

**Implementation tasks**
- [ ] Add `full_name` and `tenant_name` fields to the `publishUserInvited()` payload.
- [ ] Update the notification-service invite email handler to use `payload.full_name` in the greeting and `payload.tenant_name` in the subject/body.
- [ ] Update the contract test for this event to assert the new fields are present.

**Acceptance criteria**
- Invite email body contains the invitee's name and the restaurant's name, not just the email address.

**Tests to add**
- Update `services/notification-service/src/__tests__/consumers/user-invited.handler.test.ts` to assert `full_name` and `tenant_name` are used in email template
- `services/auth-service/src/test/java/.../event/AuthEventPublisherTest.java` — assert `publishUserInvited()` payload contains required fields

**Estimate**: 2–3 hours

---

### [ ] NM-2 — `generatePoNumber()` collision probability too high for production volume

**What this fixes**
PO numbers use a 4-character random hex suffix (65,536 combinations). At 100 POs/day per tenant, the birthday paradox gives ~7% collision probability within ~300 POs. Collisions cause duplicate PO numbers in a tenant's records — an accounting and audit problem.

**Current breakage evidence**
- `PurchaseOrderService.generatePoNumber()`:
  - `services/inventory-service/src/main/java/com/kitchenledger/inventory/service/PurchaseOrderService.java`
  ```java
  String suffix = UUID.randomUUID().toString().substring(0, 4).toUpperCase(); // only 65,536 values
  ```

**Implementation tasks**
- [ ] Replace with a sequence-based or timestamp+random hybrid that guarantees uniqueness per tenant:
  - Option A: Use a per-tenant DB sequence or a `nextval('po_number_seq')` to generate monotonically increasing numbers.
  - Option B: Encode timestamp-millis + 4-char random: e.g., `PO-20240115-A3F9` — 16M combinations per millisecond.
- [ ] Add a `UNIQUE(tenant_id, po_number)` constraint in migration to enforce uniqueness at the DB level regardless of generation strategy.
- [ ] Handle the (now extremely rare) constraint violation with a retry.

**Acceptance criteria**
- PO number uniqueness is enforced by DB constraint — no duplicates possible, even under concurrent creation.
- PO numbers are human-readable and sortable by date.

**Tests to add**
- `services/inventory-service/src/test/java/.../service/PurchaseOrderServiceTest.java` — assert PO numbers are unique across 1,000 concurrent generations for same tenant

**Estimate**: 3–4 hours

---

### [ ] NM-3 — Notification-service `assertQueue` missing `x-dead-letter-exchange` argument

**What this fixes**
If the queue was previously declared without the `x-dead-letter-exchange` argument and the service restarts with it added, RabbitMQ throws `PRECONDITION_FAILED` and the connection drops. Currently the queue declaration has no DLQ routing, so permanently failed events are discarded.

**Current breakage evidence**
- Queue declaration in notification-service consumer:
  - `services/notification-service/src/consumers/event.consumer.ts`
  ```typescript
  channel.assertQueue(QUEUE_NAME, { durable: true }); // missing x-dead-letter-exchange
  ```
- `infrastructure/rabbitmq/setup.sh` declares the DLX but the consumer does not reference it at queue-assert time.

**Implementation tasks**
- [ ] Update `assertQueue` to include dead-letter configuration:
  ```typescript
  channel.assertQueue(QUEUE_NAME, {
    durable: true,
    arguments: {
      'x-dead-letter-exchange': 'kitchenledger.dlx',
      'x-dead-letter-routing-key': QUEUE_NAME,
    },
  });
  ```
- [ ] Verify the `kitchenledger.dlx` exchange and dead-letter queue exist in `setup.sh` (they do — this just wires the consumer queue to use them).
- [ ] If the queue already exists without these args in any environment, add a queue deletion + redeclaration step to `setup.sh` as part of the migration runbook.

**Acceptance criteria**
- Messages that fail processing after max retries are routed to the DLQ rather than discarded.
- Service restarts without `PRECONDITION_FAILED` errors.

**Tests to add**
- `services/notification-service/src/__tests__/consumers/event.consumer.test.ts` — mock channel and assert `assertQueue` is called with the correct `arguments` object

**Estimate**: 2–3 hours

---

### [ ] NM-4 — `ExpenseService.createFromOcr()` uses nil UUID as `createdBy`

**What this fixes**
`new UUID(0L, 0L)` (all-zeros UUID) is used as the `createdBy` value when creating expenses from OCR. This is not a valid user ID, risks FK constraint violations if `expenses.created_by` references `users.id`, and produces audit logs with a meaningless actor.

**Current breakage evidence**
- `ExpenseService.createFromOcr()`:
  - `services/finance-service/src/main/java/com/kitchenledger/finance/service/ExpenseService.java`
  ```java
  UUID systemUser = new UUID(0L, 0L); // nil UUID — not a real user
  expense.setCreatedBy(systemUser);
  ```
- The OCR job runs asynchronously via Celery; the originating user context must be threaded through the `ai.ocr.completed` event payload.

**Implementation tasks**
- [ ] Add `initiated_by_user_id` to the `ai.ocr.completed` event payload in ai-service.
- [ ] In `InventoryEventListener` (which handles `ai.ocr.completed`), extract `initiated_by_user_id` and pass it through to `ExpenseService.createFromOcr()`.
- [ ] Replace `new UUID(0L, 0L)` with the actual user UUID from the event payload.
- [ ] If the user ID is genuinely unavailable (system-initiated), use a designated system-user UUID that exists in the `users` table, not the nil UUID.

**Acceptance criteria**
- Expenses created from OCR have a valid, traceable `created_by` user ID.
- No FK constraint violations on `expenses.created_by`.
- Audit logs for OCR-created expenses reference a meaningful actor.

**Tests to add**
- `services/finance-service/src/test/java/.../service/ExpenseServiceTest.java` — assert `createFromOcr()` uses the user ID from the event payload, not a nil UUID

**Estimate**: 3–5 hours

---

### [ ] NM-5 — `AttendanceService.listByEmployee()` returns unbounded list — no pagination

**What this fixes**
Loading all attendance records for an employee with no limit returns an unbounded result set. A restaurant with 2 years of daily records has ~730 rows per employee; a 50-person team means 36,500 rows in a single query response. This causes OOM risk, slow API responses, and excessive DB load.

**Current breakage evidence**
- `AttendanceService.listByEmployee()`:
  - `services/staff-service/src/main/java/com/kitchenledger/staff/service/AttendanceService.java`
  - Returns `List<Attendance>` with no `Pageable` parameter.

**Implementation tasks**
- [ ] Change `listByEmployee()` signature to accept `Pageable pageable` and return `Page<Attendance>`.
- [ ] Update `AttendanceController` to accept `page`, `size`, `sort` query params and construct a `Pageable`.
- [ ] Default page size: 30 records. Max page size: 100 (reject larger with 400).
- [ ] Add a date-range filter (`fromDate`, `toDate`) to support common use case of viewing a pay period.

**Acceptance criteria**
- `GET /api/v1/attendance?employeeId=…` returns paginated response with `page`, `size`, `totalElements`, `totalPages`.
- Request with `size > 100` returns 400 Bad Request.
- Response time for large datasets stays under 200ms.

**Tests to add**
- `services/staff-service/src/test/java/.../service/AttendanceServiceTest.java` — assert pagination parameters are forwarded to repository
- Controller test: assert default page size, max page size enforcement, and pagination metadata in response

**Estimate**: 3–4 hours

---

### [ ] NM-6 — `StockReceiptService.prefillFromOcr()` silently picks wrong inventory item

**What this fixes**
OCR prefill uses `ILIKE` with `PageRequest.of(0, 1)` — it takes the first alphabetical match with no relevance ranking. If "Chicken Breast" and "Chicken Wings" both match "Chicken", the prefill silently picks one at random (by DB sort order), potentially recording stock movement against the wrong item with no warning.

**Current breakage evidence**
- `StockReceiptService.prefillFromOcr()`:
  - `services/inventory-service/src/main/java/com/kitchenledger/inventory/service/StockReceiptService.java`
  ```java
  Pageable top1 = PageRequest.of(0, 1);
  List<InventoryItem> matches = itemRepository.findByNameContainingIgnoreCaseAndTenantId(name, tenantId, top1);
  // silently uses matches.get(0) if present — no confidence check
  ```

**Implementation tasks**
- [ ] If exactly one item matches, proceed with prefill (no change).
- [ ] If multiple items match, return them all as `suggestions` in the response and set a `requires_confirmation: true` flag — do not auto-select.
- [ ] If zero items match, return `matched: false` so the UI can prompt the user to create or map a new item.
- [ ] Log the match count and selected item at DEBUG level for observability.

**Acceptance criteria**
- Ambiguous OCR matches are surfaced to the user for confirmation, not silently resolved.
- Unambiguous matches (exactly one result) continue to auto-fill as before.
- Zero matches return a structured `no_match` response, not a 500 or empty prefill.

**Tests to add**
- `services/inventory-service/src/test/java/.../service/StockReceiptServiceTest.java`:
  - Assert single match → auto-prefill
  - Assert multiple matches → returns suggestions + `requires_confirmation: true`
  - Assert zero matches → returns `matched: false`

**Estimate**: 3–5 hours

---

### [ ] NM-7 — `NoShowDetectionJob` has zero test coverage

**What this fixes**
The no-show detection job runs every 15 minutes in production and marks shifts as `no_show`, firing `staff.employee.noshow` events. Zero tests means regressions go undetected (e.g., wrong time threshold, wrong status filter, double event emission).

**Current breakage evidence**
- No test file exists for:
  - `services/staff-service/src/main/java/com/kitchenledger/staff/job/NoShowDetectionJob.java`
- Job logic includes time-zone-sensitive comparisons and cross-repository coordination.

**Implementation tasks**
- [ ] Write `NoShowDetectionJobTest.java` covering:
  - Shift past threshold with no clock-in → marked `no_show`, event published
  - Shift past threshold but clocked in → not marked
  - Shift not yet past threshold → not touched
  - Already `no_show` shift → not re-marked, no duplicate event
  - Job runs with no overdue shifts → no DB writes, no events

**Acceptance criteria**
- 100% branch coverage on `detectNoShows()`.
- No duplicate `no_show` marking for already-processed shifts.

**Tests to add**
- `services/staff-service/src/test/java/.../job/NoShowDetectionJobTest.java`

**Estimate**: 3–5 hours

---

### [ ] NM-8 — `CertificationExpiryJob`, `CertificationController`, `CertificationService` have zero test coverage

**What this fixes**
Certification expiry is a compliance feature (food-handler card expiry, health certificates). Untested logic here can cause missed alerts or incorrect cert status transitions, creating real liability.

**Current breakage evidence**
- No test files for:
  - `services/staff-service/src/main/java/com/kitchenledger/staff/job/CertificationExpiryJob.java`
  - `services/staff-service/src/main/java/com/kitchenledger/staff/controller/CertificationController.java`
  - `services/staff-service/src/main/java/com/kitchenledger/staff/service/CertificationService.java`

**Implementation tasks**
- [ ] `CertificationExpiryJobTest.java`: cert expiring in 7 days → event published; cert already expired → auto-marked expired; no expiring certs → no-op.
- [ ] `CertificationServiceTest.java`: create, update, delete (soft), list by employee, expiry date validation.
- [ ] `CertificationControllerIT.java`: CRUD endpoints with auth; assert tenant isolation.

**Acceptance criteria**
- All three classes at ≥80% line/branch coverage.
- Expiry logic tested with boundary dates (today, tomorrow, 7 days out, yesterday).

**Tests to add**
- `services/staff-service/src/test/java/.../job/CertificationExpiryJobTest.java`
- `services/staff-service/src/test/java/.../service/CertificationServiceTest.java`
- `services/staff-service/src/test/java/.../controller/CertificationControllerIT.java`

**Estimate**: 5–8 hours

---

### [ ] NM-9 — `OutboxReplayJob` has zero tests and no duplicate-replay guard

**What this fixes**
The outbox replay job runs every 5 minutes. Without tests, replay logic regressions are invisible. Without a `SELECT FOR UPDATE` or status lock on outbox rows, two concurrent job executions (e.g., in multi-instance deploy) can replay the same event twice, causing duplicate notifications, double inventory increments, etc.

**Current breakage evidence**
- No test file for `OutboxReplayJob` in any of the four Java services.
- `replayPending()` queries `WHERE status = 'PENDING'` and processes rows, but the status update happens after publish — concurrent invocations both pick up the same rows.

**Implementation tasks**
- [ ] Add `SELECT ... FOR UPDATE SKIP LOCKED` (or equivalent with Spring Data) when fetching pending outbox rows to prevent concurrent replay of the same event.
- [ ] Write `OutboxReplayJobTest.java` for each service covering: successful replay marks row `SENT`, publish failure increments `retry_count`, max retries exceeded marks row `FAILED`, concurrent replay test.

**Acceptance criteria**
- Two simultaneous job executions never publish the same outbox event twice.
- Failed publish after max retries marks the row `FAILED` with a `last_error` message.

**Tests to add**
- `services/auth-service/src/test/java/.../event/OutboxReplayJobTest.java`
- Same for inventory, finance, staff OutboxReplayJob

**Estimate**: 6–8 hours

---

### [ ] NM-10 — Error messages reference non-existent override endpoints

**What this fixes**
`ShiftService.publish()` and `PurchaseOrderService.close()` return error messages like "Use force-publish override" and "Use force-close override" but no such endpoints exist. Operators following error message guidance will get 404s, causing confusion and failed workflows.

**Current breakage evidence**
- `services/staff-service/src/main/java/com/kitchenledger/staff/service/ShiftService.java` — `publish()` error message
- `services/inventory-service/src/main/java/com/kitchenledger/inventory/service/PurchaseOrderService.java` — `close()` error message

**Implementation tasks**
- [ ] Either implement the override endpoints referenced in the error messages:
  - `POST /api/v1/shifts/{id}/force-publish` (requires MANAGER role)
  - `POST /api/v1/purchase-orders/{id}/force-close` (requires MANAGER role)
- [ ] Or remove the override hint from the error messages if overrides are not planned.
- [ ] If implementing: enforce `@PreAuthorize("hasRole('MANAGER')")`, log the override action as an audit event, add to OpenAPI spec.

**Acceptance criteria**
- Every error message that references an endpoint points to an endpoint that actually exists.
- Override actions (if implemented) are audited and role-gated.

**Tests to add**
- Controller tests for the force-publish and force-close endpoints
- Assert 403 for non-MANAGER roles; assert 200 + audit log for MANAGER role

**Estimate**: 4–8 hours (2–3 hours if just removing the hint from error messages)

---

### [ ] NM-11 — `audit_trigger_fn()` reads `app.current_user_id` which is never SET — all audit logs have NULL `user_id`

**What this fixes**
The audit trigger captures who made every write. But because no application code ever sets `SET LOCAL app.current_user_id = '<id>'` in the DB session, every audit log row has `user_id = NULL`. The audit trail is useless for compliance and incident investigation.

**Current breakage evidence**
- Audit trigger function reads the session variable:
  - `services/auth-service/src/main/resources/db/migration/V2__audit_triggers.sql`
  ```sql
  NEW.changed_by = current_setting('app.current_user_id', TRUE)::UUID
  ```
- Gateway sets `X-User-Id` header and all Java services read it, but none execute `SET LOCAL app.current_user_id = ...` before DB operations.
- `app.current_tenant_id` IS set correctly (via JPA interceptor/filter) — `current_user_id` is the missing counterpart.

**Implementation tasks**
- [ ] Add `app.current_user_id` to the same JPA interceptor/Hibernate session filter that already sets `app.current_tenant_id`.
  - Example: in a `@RequestScope` bean or `HandlerInterceptor`, after extracting `X-User-Id` from the request, execute:
    ```sql
    SET LOCAL app.current_user_id = '<user-id>';
    ```
- [ ] Verify this setting propagates to the DB session used by JPA (must run within the same transaction/connection).
- [ ] Confirm audit log rows written after the fix have a non-null `changed_by`.

**Acceptance criteria**
- Every audited write produces an audit log row with a non-null, valid `user_id`.
- Background jobs (outbox replay, scheduled jobs) set a designated system-user UUID for `app.current_user_id`.

**Tests to add**
- Integration test: perform a create/update/delete operation via a controller endpoint; assert the resulting audit log row has `changed_by = <requesting user's UUID>`
- Background job test: assert outbox replay writes use the system-user UUID

**Estimate**: 4–6 hours

---

## LOW PRIORITY (polish and hardening)

---

### [ ] NL-1 — Currency hardcoded to `"INR"` in all event payloads

**What this fixes**
All RabbitMQ event payloads that include monetary amounts hardcode `"currency": "INR"`. Multi-tenant SaaS needs to use the tenant's configured currency. Any tenant not using INR will have incorrect currency labels on notifications, reports, and downstream integrations.

**Current breakage evidence**
- `StaffEventPublisher`, `InventoryEventPublisher`, `FinanceEventPublisher`, `AuthEventPublisher` all include `"currency": "INR"` in hardcoded payload builders.

**Implementation tasks**
- [ ] Add `currency VARCHAR(3)` to the `tenants` table if not present (default `"INR"` for existing tenants).
- [ ] Fetch `tenant.getCurrency()` in each publisher and include it in event payloads.
- [ ] Cache tenant config per tenant ID to avoid per-event DB lookups.

**Tests to add**
- Publisher unit tests: assert `currency` in payload matches the mocked tenant's configured currency, not hardcoded `"INR"`

**Estimate**: 4–6 hours

---

### [ ] NL-2 — `NoShowDetectionJob.detectNoShows()` loads all overdue shifts without pagination

**What this fixes**
At high shift volume, loading all overdue shifts in a single query creates a large in-memory list and a slow DB scan. Should process in batches to stay memory-bounded.

**Current breakage evidence**
- `services/staff-service/src/main/java/com/kitchenledger/staff/job/NoShowDetectionJob.java`
  ```java
  List<Shift> overdueShifts = shiftRepository.findByStatusIn...(...); // no LIMIT
  ```

**Implementation tasks**
- [ ] Change the repository query to use `Pageable` with a batch size of 100.
- [ ] Process batches in a loop until no more results.
- [ ] Add a log line at the start of each run reporting how many shifts were evaluated.

**Tests to add**
- Test that job processes all shifts even when total count exceeds one batch size

**Estimate**: 2–3 hours

---

### [ ] NL-3 — `OverduePaymentJob` and `ExpiryCheckJob` abort remaining tenants on single-tenant failure

**What this fixes**
If one tenant's data causes an exception, the job stops processing all remaining tenants. One bad tenant poisons the batch for the entire platform.

**Current breakage evidence**
- `services/finance-service/src/main/java/com/kitchenledger/finance/job/OverduePaymentJob.java`
- `services/inventory-service/src/main/java/com/kitchenledger/inventory/job/ExpiryCheckJob.java`
- Both iterate over all tenants in a single loop with no per-tenant try-catch.

**Implementation tasks**
- [ ] Wrap each tenant's processing block in a try-catch.
- [ ] On exception: log `ERROR` with `tenantId` and exception summary, increment a failure metric counter, continue to next tenant.
- [ ] After processing all tenants, if any failures occurred, log a summary and optionally alert.

**Tests to add**
- Job unit test: one tenant throws → job completes for all other tenants; failure is logged

**Estimate**: 2–3 hours

---

### [ ] NL-4 — RabbitMQ reconnect uses flat 5-second delay — should use exponential backoff

**What this fixes**
When RabbitMQ is unavailable and the connection is lost, all Node.js services (gateway, notification-service, file-service) retry with a flat 5-second delay. During sustained outages, this hammers the broker unnecessarily and can create thundering-herd reconnect storms when RabbitMQ comes back up.

**Current breakage evidence**
- Reconnect logic in all Node.js service RabbitMQ clients uses `setTimeout(connect, 5000)`.

**Implementation tasks**
- [ ] Replace flat delay with exponential backoff: `Math.min(baseDelay * 2^attempt, maxDelay)` where `baseDelay=1000ms`, `maxDelay=30000ms`.
- [ ] Add jitter (`Math.random() * 0.3`) to spread reconnects across service instances.
- [ ] Log the backoff delay and attempt number on each retry.

**Tests to add**
- Unit test for backoff helper: assert delay progression and max cap
- Connection manager test: assert reconnect is called with increasing delay on repeated failures

**Estimate**: 2–3 hours

---

### [ ] NL-5 — Raw invite token travels in plaintext through RabbitMQ payload and outbox DB

**What this fixes**
`publishUserInvited()` includes the raw `invite_token` in the event payload. This token is stored in the `event_outbox` DB table and transmitted through RabbitMQ. Anyone with DB read access or RabbitMQ management access can see valid invite tokens and use them to gain unauthorized access.

**Current breakage evidence**
- `AuthEventPublisher.publishUserInvited()` includes `rawToken` in the payload map:
  - `services/auth-service/src/main/java/com/kitchenledger/auth/event/AuthEventPublisher.java`
- The raw token is then serialized into the `event_outbox` table and published to RabbitMQ.

**Implementation tasks**
- [ ] Remove `invite_token` from the RabbitMQ event payload entirely.
- [ ] Instead, have notification-service call back to auth-service's internal API to generate a short-lived signed invite URL at email-send time: `GET /internal/auth/invites/{userId}/link`.
- [ ] The invite link generation endpoint should return a pre-signed URL valid for 48 hours, generated on-demand, without storing the raw token in any message queue.
- [ ] Audit existing `event_outbox` rows and `notifications` table for stored raw tokens — scrub if found.

**Acceptance criteria**
- No raw cryptographic tokens appear in RabbitMQ payloads, outbox DB rows, or notification records.
- Invite emails still contain a working link.

**Tests to add**
- `services/auth-service/src/test/java/.../event/AuthEventPublisherTest.java` — assert `invite_token` field is NOT present in the published payload
- `services/notification-service/src/__tests__/consumers/user-invited.handler.test.ts` — assert handler fetches invite URL via internal API, not from payload

**Estimate**: 4–6 hours

---

## Suggested Execution Order

1. `NC-1` — outbox replay sends broken envelopes (silent data loss in production)
2. `NC-2` — forgot-password emails never sent (user-facing breakage)
3. `NH-4` — stock receipt TOCTOU race (inventory double-count)
4. `NH-3` — tip pool distribute is a no-op stub (core feature missing)
5. `NH-2` — hard delete on shifts (data integrity)
6. `NH-6` — hardcoded timezone (multi-tenant correctness)
7. `NH-1` — migration ordering race (deploy reliability)
8. `NH-5` — outbox RLS gap (security)
9. `NM-11` — audit logs all have NULL user_id (compliance)
10. `NM-9` — outbox replay duplicate guard + tests
11. `NM-3` — notification-service DLQ misconfiguration
12. `NM-7`, `NM-8` — no-show and certification test coverage
13. Remaining medium and low priority items

---

## Definition of Done (for every task above)

A task is complete only when all are true:
- [ ] Code changes merged for all impacted services
- [ ] Required migrations created and applied locally
- [ ] New tests added and passing in CI
- [ ] No cross-tenant leakage introduced
- [ ] Audit logs/events updated where behavior changed
- [ ] `docs/BACKEND_FIXES.md` checkbox marked complete with PR link
