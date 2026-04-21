# EPIC: FIN — Finance Service

**Phase:** 2 | **Weeks:** 4–9
**Service:** `services/finance-service` (Java 21 + Spring Boot 4.0.5) | **Port:** 8083
**Goal:** Daily sales reconciliation, expense management, vendor payments, accounts payable, P&L report engine, dynamic UPI QR reconciliation, scheduled payment alerts.
**Depends on:** INFRA-3 (skeleton), AUTH (tenant events), Inventory Service (item cost lookups)
**Blocks:** Report Service (needs P&L data), AI Service (expense OCR), Web/Mobile finance screens

---

## FIN-1: Database Schema Migration

- [ ] Write `V1__finance_schema.sql` (exact from TRD §3.7):
  - `accounts` — id, tenant_id, code VARCHAR(20), name, account_type CHECK('revenue','cogs','labor','operating_expense','asset','liability'), parent_id (self-ref FK), is_system BOOLEAN, is_active, sort_order; UNIQUE(tenant_id, code)
  - `vendors` — id, tenant_id, name, contact_name, email, phone, address, payment_terms_days, tax_number, bank_details JSONB, external_supplier_id UUID (link to inventory supplier), is_active, soft-delete
  - `daily_sales_reports` — id, tenant_id, report_date DATE, status CHECK('draft','reconciled','verified'), gross_sales, discounts, comps, voids, net_sales GENERATED ALWAYS AS (gross_sales - discounts - comps - voids) STORED, food_sales, beverage_sales, other_sales, tax_collected, cash/card/upi/delivery/other payment columns, tips_collected, cash_expected, cash_counted, cash_over_short, variance_explanation, guest_count, avg_check_size GENERATED ALWAYS AS (CASE WHEN guest_count>0 THEN ROUND(net_sales/guest_count,2) ELSE 0 END) STORED, table_count, table_turnover_rate, total_labor_hours, total_labor_cost, splh, reconciled_by, reconciled_at, version INT; UNIQUE(tenant_id, report_date)
  - `expenses` — id, tenant_id, account_id FK, vendor_id FK, expense_date, description, amount NUMERIC(12,2), tax_amount, total_amount GENERATED, payment_method CHECK('cash','card','upi','bank_transfer','cheque','other'), payment_status CHECK('paid','pending','overdue'), invoice_number, invoice_date, due_date, receipt_url, ocr_raw_data JSONB, ocr_confidence, is_recurring, recurring_config JSONB, approved_by, created_by, soft-delete
  - `vendor_payments` — id, tenant_id, vendor_id FK, expense_id FK, amount, payment_date, payment_method, reference_number
  - `upi_transactions` — id, tenant_id, report_date, transaction_ref UNIQUE, amount, payer_vpa, status CHECK('pending','success','failed','refunded'), settled_at, raw_webhook JSONB
  - `finance_audit_logs` — id, tenant_id, user_id, event_type, entity_type, entity_id, old_value JSONB, new_value JSONB
  - RLS enable + `tenant_isolation` policy on all tables
  - Indexes: `idx_dsr_tenant_date`, `idx_expenses_tenant_date`, `idx_expenses_vendor`, `idx_expenses_due` (WHERE payment_status='pending')
- [ ] Write `V2__seed_accounts.sql` — 20 default chart-of-accounts entries (seeded via event, not directly by migration):
  - Revenue: Food Sales (4001), Beverage Sales (4002), Other Sales (4003)
  - COGS: Proteins (5001), Produce (5002), Dairy (5003), Dry Goods (5004), Beverages (5005), Alcohol (5006), Packaging (5007)
  - Labor: FOH Wages (6001), BOH Wages (6002), Management (6003), Payroll Taxes (6004), Benefits (6005)
  - Operating: Rent (7001), Utilities (7002), Insurance (7003), Marketing (7004), Repairs (7005), Cleaning (7006), Technology (7007)
- [ ] **Test:** Migration + RLS isolation. Tenant A cannot see Tenant B's DSR rows.

---

## FIN-2: JPA Entities, Repositories & DTOs

- [ ] All JPA entities with exact field types; `DailySalesReport` entity includes `@Version` field
- [ ] `DsrStatus` enum (DRAFT, RECONCILED, VERIFIED), `PaymentStatus` enum (PAID, PENDING, OVERDUE), `AccountType` enum
- [ ] Custom repository queries:
  - `DailySalesReportRepository` — `findByTenantIdAndReportDate`, `aggregateRevenue(tenantId, start, end)`, `findTrendData(tenantId, days)`
  - `ExpenseRepository` — `sumByAccountType(tenantId, start, end, accountType)`, `findByTenantIdAndDueDateBetween`, `sumByVendorId`
- [ ] Request DTOs: `SaveDsrRequest`, `ReconcileDsrRequest`, `CreateExpenseRequest`, `RecordPaymentRequest`
- [ ] Response DTOs: `DsrResponse`, `PLReportResponse` (nested sections), `ExpenseResponse`, `VendorResponse`, `APAgingResponse`, `DashboardKpiResponse`
- [ ] MapStruct mappers

---

## FIN-3: Chart of Accounts & Vendor Management

- [ ] `AccountService.java`:
  - Full CRUD — owner only for create/update/delete
  - Cannot delete: `is_system=true` accounts, or accounts with any linked expenses
  - Account tree: `getAccountTree(tenantId)` — hierarchical response (parent-child nesting)
- [ ] `VendorService.java` + `VendorController.java`:
  - Full CRUD with soft delete
  - `getVendorBalance(tenantId, vendorId)` — aggregate unpaid expenses grouped by aging bucket (0-30, 31-60, 61-90, 90+): `days_outstanding = TODAY - expense_date`
- [ ] `AccountSeedService.java`:
  - `seedDefaultAccounts(tenantId)` — insert 20 default accounts from V2 definitions; called by `FinanceEventListener.onTenantCreated()`; idempotent (check existing count before inserting)
- [ ] **Test:** Seed accounts on tenant.created → 20 accounts exist. Delete system account → 400. Delete account with linked expenses → 400.

---

## FIN-4: Daily Sales Report (DSR)

- [ ] `DailySalesReportService.java` (exact from TRD §3.9):
  - `getOrCreateDraft(tenantId, date)`:
    - Reject future dates (throw `BadRequestException`)
    - Find existing or create new DSR with status=DRAFT
  - `saveDsr(tenantId, date, userId, request)`:
    - Upsert DSR fields; recalculate `cash_expected = cash_sales + card_sales + upi_sales` (or per tenant config)
    - Validate payment methods sum matches gross_sales - discounts - comps - voids
  - `reconcile(tenantId, date, userId)`:
    - Require `cash_counted IS NOT NULL`
    - `cash_over_short = cash_counted - cash_expected`
    - If `|cash_over_short| > tenant.settings.cash_variance_threshold` AND `variance_explanation` blank → 422
    - Set status=RECONCILED, reconciled_by, reconciled_at
    - Publish `finance.dsr.reconciled` event (with net_sales, date, currency)
    - Write `finance_audit_logs` entry
  - `getDsrTrends(tenantId, days)` — last N DSRs for trend sparkline data
- [ ] `DailySalesReportController.java`:
  - `GET /api/finance/daily-reports` — list with date range filter
  - `GET /api/finance/daily-reports/{date}` — get-or-create
  - `PUT /api/finance/daily-reports/{date}` — save form
  - `POST /api/finance/daily-reports/{date}/reconcile`
  - `GET /api/finance/daily-reports/trends`
- [ ] `GET /api/finance/dashboard` — KPI summary:
  - Yesterday net_sales vs. same day last week (% change)
  - cash_over_short for yesterday
  - food_cost_% = last 7d COGS / last 7d net_sales × 100
  - labor_cost_% = last 7d labor expenses / last 7d net_sales × 100
  - avg splh for last 7d
  - guest_count yesterday
- [ ] **Test:** Create DSR → fill → reconcile. Cash variance above threshold without explanation → 422. Event published on reconcile. Same date twice → same record updated.

---

## FIN-5: Expense Management

- [ ] `ExpenseService.java`:
  - `createExpense(tenantId, userId, request)`:
    - Validate `account_id` belongs to tenant
    - Validate `vendor_id` belongs to tenant (if provided)
    - Set `created_by`, `payment_status = PAID` if `due_date` is null or in past, else PENDING
  - `updateExpense(tenantId, expenseId, userId, request)`:
    - Write audit log if amount, vendor, or account changes
    - Cannot update if soft-deleted
  - `softDelete(tenantId, expenseId, userId)` — owner only; set `deleted_at`
- [ ] `ExpenseController.java`:
  - Filter params: `start_date`, `end_date`, `account_id`, `vendor_id`, `payment_status`, `page`, `size`
- [ ] **Test:** Create expense linked to account and vendor. Filter by pending. Soft delete → gone from list. Audit log written on amount change.

---

## FIN-6: Vendor Payments & Accounts Payable

- [ ] `VendorPaymentService.java`:
  - `recordPayment(tenantId, vendorId, userId, request)`:
    - Create `VendorPayment` record
    - If `expense_id` provided: update linked expense `payment_status = PAID`
  - `getPaymentHistory(tenantId, vendorId)` — paginated payment list
- [ ] `AccountsPayableService.java`:
  - `getSummary(tenantId)` — total outstanding AP + totals per aging bucket
  - `getAgingDetail(tenantId)` — per-vendor aging table: vendor name + totals for each bucket + oldest outstanding invoice date
- [ ] `VendorPaymentController.java` + AP endpoints
- [ ] **Test:** Record payment → linked expense changes to PAID. AP aging: expense 45 days old → appears in 31-60 bucket.

---

## FIN-7: P&L Report Engine

- [ ] `PLReportService.java` (exact from TRD §3.8):
  - `generate(tenantId, start, end, compareStart, compareEnd)`:
    - Primary period + optional comparison period
    - Returns `PLReportResponse` with primary + comparison side-by-side
  - `computePL(tenantId, start, end)` → `PLData`:
    - Revenue: `dsrRepo.aggregateRevenue()` → sum net_sales, food_sales, beverage_sales by period
    - COGS: `expenseRepo.sumByAccountType(tenantId, start, end, "cogs")` → list of `AccountSummary{name, amount}`
    - Labor: same with "labor"
    - Operating: same with "operating_expense"
    - Derived: `grossProfit = netSales - totalCogs`, `primeCost = totalCogs + totalLabor`, `netProfit = grossProfit - totalLabor - totalOperating`
    - Benchmarks from tenant settings (defaults: food 28-35%, labor 25-35%, prime 55-65%, net 3-10%)
    - `getBenchmarkStatus(actual, min, max)` → GOOD / WARNING / DANGER
  - All calculations use `BigDecimal` with `HALF_UP` rounding
- [ ] `GET /api/finance/reports/pl?start=YYYY-MM-DD&end=YYYY-MM-DD&compare_start=...&compare_end=...` — [owner only]
- [ ] `GET /api/finance/reports/expenses` — expense breakdown by account category for period
- [ ] `GET /api/finance/reports/cash-flow` — 30-day cash projection (paid expenses as base)
- [ ] `GET /api/finance/reports/tax` — GST collected per period [owner]
- [ ] **Test:** Seed 30 days of DSRs + expenses → generate P&L → verify: revenue totals, COGS %, labor %, prime cost, net profit. food_cost=32% → GOOD benchmark. food_cost=40% → WARNING.

---

## FIN-8: Dynamic UPI QR

- [ ] `UpiService.java`:
  - `generateDynamicQr(tenantId, amount, description)`:
    - Generate `transaction_ref` (UUID)
    - Build UPI intent URL: `upi://pay?pa={tenant.upi_id}&pn={restaurant_name}&am={amount}&tr={ref}&tn={description}`
    - Create `upi_transactions` record with status=PENDING
    - Return QR image (use `zxing` library to generate QR code as PNG bytes → save to File Service → return URL)
  - `handleWebhook(body, hmacSignature)`:
    - Verify HMAC-SHA256 signature against `UPI_WEBHOOK_SECRET` env var
    - Find `upi_transactions` by `transaction_ref`
    - Update status=SUCCESS, settled_at, payer_vpa, raw_webhook
    - Find DSR for `report_date` → increment `upi_sales` by amount → update
- [ ] `POST /api/finance/upi/generate-qr` — [owner, manager]
- [ ] `POST /api/webhooks/upi-payment` — no auth, HMAC verified, idempotent (same ref = no-op if already SUCCESS)
- [ ] **Test:** Generate QR for ₹847 → transaction record created. Simulate webhook → DSR upi_sales updated. Replay same webhook → idempotent (no double-count).

---

## FIN-9: Scheduled Jobs

- [ ] `FinanceScheduledJobs.java` (from TRD §3.11):
  - `checkPaymentDueAlerts()` — `@Scheduled(cron = "0 0 8 * * *")`:
    - Find expenses WHERE `due_date = TODAY + 3 days AND payment_status = 'pending'`
    - Publish `finance.payment.due` event per expense
  - `markOverduePayments()` — `@Scheduled(cron = "0 0 1 * * *")`:
    - `UPDATE expenses SET payment_status='overdue' WHERE due_date < CURRENT_DATE AND payment_status='pending'`
    - Publish `finance.payment.overdue` for each newly updated expense
  - `sendWeeklyFinanceSummary()` — `@Scheduled(cron = "0 0 9 * * MON")`:
    - Compute 7-day P&L per tenant
    - Publish event → Report Service generates PDF → Notification Service sends
- [ ] **Test:** Seed expense with due_date = 3 days from now → run job → event published. Seed overdue expense → run mark-overdue job → status updated to overdue.

---

## FIN-10: RabbitMQ Event Consumer

- [ ] `FinanceEventListener.java`:
  - Queue binding: `finance-service` queue, routing keys: `auth.tenant.created`, `ai.ocr.completed`
  - `onTenantCreated(event)`:
    - Call `accountSeedService.seedDefaultAccounts(event.tenantId)`
    - Check Redis key `seeded:{tenantId}` before processing (idempotency guard)
    - Set Redis key after successful seed
  - `onOcrCompleted(event)`:
    - If `event.payload.context_type != "expense"` → ignore
    - Find expense by `event.payload.reference_id`
    - Update: `vendor_id` (match by name), `amount`, `invoice_number`, `invoice_date`, `ocr_raw_data`, `ocr_confidence`
- [ ] **Test:** Publish `auth.tenant.created` → accounts seeded. Publish twice → seeded only once (idempotency). Publish `ai.ocr.completed` with expense context → expense fields updated.

---

## FIN-11: Internal Endpoint

- [ ] `GET /internal/finance/pl-data?tenant_id=&start=&end=` — for Report Service; INTERNAL_SERVICE_SECRET required
- [ ] `POST /internal/finance/accounts/seed` — called on tenant.created event (alternate synchronous path for testing)

---

## FIN-12: Tests

- [ ] Unit tests (Mockito):
  - DSR reconcile: cash variance threshold logic, all edge cases
  - P&L computation: net_sales, COGS %, labor %, prime cost, benchmark statuses
  - AP aging: correct bucket assignment for 1/30/31/60/61/90/91+ day old expenses
  - `BigDecimal` precision: no floating-point rounding errors in P&L totals
- [ ] Integration tests (Testcontainers):
  - DSR lifecycle: create → fill payment breakdown → reconcile → event published
  - P&L with real DSR + expense data: verify all section totals
  - Expense overdue job: seed past-due expense → run job → status = overdue → event published
  - Event consumer: publish `auth.tenant.created` → 20 accounts seeded
- [ ] Coverage gate: **≥ 80% line coverage**
