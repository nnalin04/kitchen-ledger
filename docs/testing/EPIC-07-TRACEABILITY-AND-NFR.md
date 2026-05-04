# EPIC-07: Purchase-to-Plate Traceability & Non-Functional Requirements

> **Scope:** KitchenLedger's core differentiator — the complete Purchase → Inventory → Kitchen → Plate chain — plus all non-functional requirements: security (OWASP), data integrity, performance, error handling, rate limiting, idempotency, and offline sync.
> **Services:** All services (Gateway :8080, Inventory :8082, Finance :8083, Staff :8088)
> **Base URL:** `http://localhost:8080`

---

## Table of Contents

1. [Purchase-to-Plate Traceability Scenarios](#1-purchase-to-plate-traceability-scenarios)
2. [AvT Variance Deep Tests](#2-avt-variance-deep-tests)
3. [KOT System Tests](#3-kot-system-tests)
4. [OWASP API Security Top 10](#4-owasp-api-security-top-10)
5. [Data Integrity](#5-data-integrity)
6. [Error Handling Standards](#6-error-handling-standards)
7. [Performance Benchmarks](#7-performance-benchmarks)
8. [Rate Limiting](#8-rate-limiting)
9. [Idempotency](#9-idempotency)
10. [Offline Sync Behavior](#10-offline-sync-behavior)

---

## 1. Purchase-to-Plate Traceability Scenarios

### TC-TRACE-01 — Perfect Chain (Happy Path): All 5 Stages

**PRD Requirement:** "Complete purchase → inventory → kitchen → plate traceability at an affordable price point"

**Stage 1: Purchase (PO)**
```http
POST /api/inventory/purchase-orders
Authorization: Bearer <OWNER_TOKEN>

{
  "supplierId": "<SUPPLIER_ID>",
  "orderDate": "2026-05-04",
  "expectedDeliveryDate": "2026-05-06",
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "orderedQuantity": 20, "unit": "kg", "unitPrice": 315.00 }
  ]
}
```

PO created, status = `SENT`

---

**Stage 2: Inventory Receipt**
```http
POST /api/inventory/purchase-orders/<PO_ID>/receive

{
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "receivedQuantity": 20, "unit": "kg", "condition": "GOOD", "expiryDate": "2026-05-09", "batchNumber": "BATCH-001" }
  ]
}
```

```http
POST /api/inventory/purchase-orders/<PO_ID>/invoice

{
  "invoiceNumber": "METRO-2026-4521",
  "items": [{ "itemId": "<ITEM_ID_CHICKEN>", "invoicedQuantity": 20, "invoicePrice": 315.00 }],
  "invoiceTotal": 6300.00
}
```

Three-way match = `MATCHED`. Stock updated: +20 kg Chicken in Walk-in Fridge.

---

**Stage 3: Kitchen Transfer (Storage → Kitchen)**
```http
POST /api/inventory/stock-transfers
Authorization: Bearer <MANAGER_TOKEN>

{
  "fromLocation": "WALK_IN_FRIDGE",
  "toLocation": "HOT_LINE_KITCHEN",
  "date": "2026-05-07",
  "kotReference": "KOT-20260507-001",
  "items": [{ "itemId": "<ITEM_ID_CHICKEN>", "quantity": 5, "unit": "kg" }],
  "transferredBy": "<managerId>"
}
```

---

**Stage 4: Plate Service (AvT)**
```http
POST /api/inventory/usage-variance

{
  "date": "2026-05-07",
  "recipeId": "<RECIPE_ID_DOSA>",
  "portionsServed": 12,
  "kotReference": "KOT-20260507-001",
  "actualUsage": [
    { "itemId": "<ITEM_ID_CHICKEN>", "actualQuantityGrams": 3700 }
  ]
}
```

Theoretical: 12 × 300g = 3600g. Actual: 3700g. Variance: +2.78% (within threshold).

---

**Stage 5: Full Traceability Query**
```http
GET /api/inventory/traceability?itemId=<ITEM_ID_CHICKEN>&dateFrom=2026-05-04&dateTo=2026-05-07
Authorization: Bearer <OWNER_TOKEN>
```

**Expected Response:**
```json
{
  "itemId": "<ITEM_ID_CHICKEN>",
  "itemName": "Chicken Breast",
  "traceabilityChain": [
    {
      "stage": "PURCHASE",
      "event": "Purchase Order created and sent to Metro Cash & Carry",
      "date": "2026-05-04",
      "quantity": "20 kg",
      "unitCost": 315.00,
      "totalCost": 6300.00,
      "reference": { "type": "purchase_order", "id": "<PO_ID>", "poNumber": "PO-2026-001" }
    },
    {
      "stage": "INVENTORY",
      "event": "Received into Walk-in Fridge — 3-way match MATCHED",
      "date": "2026-05-06",
      "quantity": "20 kg",
      "batchNumber": "BATCH-001",
      "expiryDate": "2026-05-09",
      "reference": { "type": "stock_receipt", "invoiceNumber": "METRO-2026-4521" }
    },
    {
      "stage": "KITCHEN",
      "event": "Transferred from Walk-in Fridge to Hot Line Kitchen",
      "date": "2026-05-07",
      "quantity": "5 kg",
      "reference": { "type": "stock_transfer", "kotReference": "KOT-20260507-001" }
    },
    {
      "stage": "PLATE",
      "event": "12 portions served (Masala Dosa recipe)",
      "date": "2026-05-07",
      "theoreticalUsageGrams": 3600,
      "actualUsageGrams": 3700,
      "variancePercent": 2.78,
      "varianceStatus": "ACCEPTABLE",
      "reference": { "type": "usage_variance", "recipeId": "<RECIPE_ID_DOSA>" }
    }
  ],
  "summary": {
    "totalPurchased": "20 kg",
    "totalReceived": "20 kg",
    "totalTransferredToKitchen": "5 kg",
    "totalServed": "3.7 kg",
    "remaining": "16.3 kg",
    "wasteAndLoss": "0 kg"
  }
}
```

---

### TC-TRACE-02 — Discrepancy Chain: Problems at Every Stage

**Setup:** All stages executed with intentional discrepancies:
- Stage 1: PO for 20 kg
- Stage 2: Only 18 kg received (2 kg short). Invoice at ₹350/kg (11% price increase)
- Stage 3: 6 kg transferred to kitchen
- Stage 4: 15 portions served. Theoretical 4.5 kg, actual 5.2 kg (15.6% over threshold)

**Query traceability:**

**Expected:** All discrepancies surfaced in chain:
```json
{
  "traceabilityChain": [
    {
      "stage": "PURCHASE",
      "quantity": "20 kg ordered"
    },
    {
      "stage": "INVENTORY",
      "quantity": "18 kg received",
      "discrepancies": [
        { "type": "QUANTITY_SHORT", "shortfall": "2 kg", "shortfallValue": 630.00 },
        { "type": "PRICE_CHANGE", "orderedPrice": 315.00, "invoicePrice": 350.00, "changePercent": 11.11 }
      ]
    },
    {
      "stage": "KITCHEN",
      "quantity": "6 kg transferred"
    },
    {
      "stage": "PLATE",
      "theoreticalUsageGrams": 4500,
      "actualUsageGrams": 5200,
      "variancePercent": 15.56,
      "varianceStatus": "CRITICAL"
    }
  ],
  "alerts": [
    "QUANTITY_SHORT: 2 kg missing from delivery",
    "PRICE_CHANGE: 11.11% above negotiated price",
    "VARIANCE_CRITICAL: 15.56% usage variance exceeds 5% threshold — investigate portioning"
  ]
}
```

---

### TC-TRACE-03 — Sub-Recipe Traceability

**Tracking: Tomato → Masala Paste → Masala Dosa → Plate**

**Setup:**
1. Transfer Tomatoes from Dry Storage to Prep Kitchen
2. Record Masala Paste production (uses tomatoes)
3. Transfer Masala Paste to Hot Line
4. Serve Masala Dosas (uses Masala Paste)

**Query tomato traceability:**
```http
GET /api/inventory/traceability?itemId=<ITEM_ID_TOMATO>&dateFrom=2026-05-04&dateTo=2026-05-07
```

**Expected chain:** PURCHASE → INVENTORY → KITCHEN (prep) → SUB-RECIPE (Masala Paste) → KITCHEN (hot line) → PLATE

---

### TC-TRACE-04 — Waste Mid-Chain

**Setup:**
1. Receive 20 kg chicken
2. Transfer 8 kg to kitchen
3. 2 kg spoils in kitchen → waste log created (SPOILAGE)
4. Serve 10 portions using 3 kg

**Traceability query:**

**Expected:** Waste event appears in chain between KITCHEN and PLATE stages:
```json
{
  "stage": "WASTE",
  "event": "2 kg spoiled in Hot Line Kitchen",
  "date": "2026-05-07",
  "reason": "SPOILAGE",
  "estimatedCost": 630.00
}
```

Summary shows: transferred 8 kg, served 3 kg, wasted 2 kg, remaining 3 kg in kitchen

---

### TC-TRACE-05 — Traceability by Batch Number

```http
GET /api/inventory/traceability?batchNumber=BATCH-001
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** All events for this specific batch (FEFO-tracked)

---

### TC-TRACE-06 — Traceability by PO ID

```http
GET /api/inventory/traceability?poId=<PO_ID>
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** All items from this PO, their individual chains

---

### TC-TRACE-07 — Traceability by KOT Reference

```http
GET /api/inventory/traceability?kotReference=KOT-20260507-001
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** All ingredients that went into service for this KOT

---

### TC-TRACE-08 — Item Never Served — Chain Ends at Inventory

**Item in stock, never transferred to kitchen:**

**Expected:** Chain shows only PURCHASE and INVENTORY stages. No KITCHEN or PLATE stages.

---

### TC-TRACE-09 — Multiple Transfers — All Shown

**Setup:** 3 separate transfers of Chicken from Walk-in to Kitchen (Mon, Wed, Fri)

**Expected:** All 3 transfer events appear in KITCHEN stage of chain

---

### TC-TRACE-10 — Traceability Pagination (50+ Events)

```http
GET /api/inventory/traceability?itemId=<ITEM_ID_CHICKEN>&limit=20&page=1
```

**Expected:** 20 events per page, `totalCount` shows full number

---

## 2. AvT Variance Deep Tests

### TC-TRACE-20 — Variance 0% — PERFECT

```http
POST /api/inventory/usage-variance

{
  "portionsServed": 10,
  "actualUsage": [{ "itemId": "<ITEM_ID_CHICKEN>", "actualQuantityGrams": 3000 }]
}
```

Theoretical: 10 × 300g = 3000g. Actual: 3000g.

**Expected:** `variancePercent: 0.00`, `status: "PERFECT"`

---

### TC-TRACE-21 — Variance 2% — ACCEPTABLE

Actual: 3060g (2% over). **Expected:** `status: "ACCEPTABLE"`

---

### TC-TRACE-22 — Variance 5% Exactly — AT THRESHOLD

Actual: 3150g (5% over). **Expected:** `status: "AT_THRESHOLD"` — warning, no critical alert

---

### TC-TRACE-23 — Variance 6% — EXCEEDS THRESHOLD → Alert

Actual: 3180g (6% over). **Expected:** `status: "ALERT"`, investigation notification fired

---

### TC-TRACE-24 — Variance 20% — CRITICAL INVESTIGATION

Actual: 3600g (20% over). **Expected:** `status: "CRITICAL"`, escalation notification

---

### TC-TRACE-25 — Negative Variance (Under-Use) — UNDER_USAGE Flag

Actual: 2700g (10% under theoretical). Some was wasted before plating.

**Expected:** `variancePercent: -10.0`, `status: "UNDER_USAGE"`, different alert type (theft/waste investigation)

---

### TC-TRACE-26 — AvT Report by Date Range

```http
GET /api/inventory/usage-variance/report?recipeId=<RECIPE_ID_DOSA>&dateFrom=2026-05-01&dateTo=2026-05-07
```

**Expected:** All AvT entries for that week, trend (improving/worsening)

---

---

## 3. KOT System Tests

### TC-TRACE-30 — Transfer and Service Must Reference Same KOT

**Transfer 5 kg chicken with KOT-001:**
**Service entry also references KOT-001:**

**Expected:** Transfer and usage variance linked via KOT:
```sql
SELECT st.kot_reference, uv.kot_reference
FROM stock_transfers st
JOIN usage_variances uv ON st.kot_reference = uv.kot_reference
WHERE st.kot_reference = 'KOT-20260507-001';
-- Both rows returned
```

---

### TC-TRACE-31 — Service Entry Without KOT Reference

```http
POST /api/inventory/usage-variance

{
  "portionsServed": 5,
  "actualUsage": [{ "itemId": "<ITEM_ID_CHICKEN>", "actualQuantityGrams": 1500 }]
}
```

(No kotReference provided)

**Expected:** `HTTP 201` — kotReference is optional (manual entry), but flagged as unlinked

---

---

## 4. OWASP API Security Top 10

### TC-NFR-01 — BOLA: Access Own Resource

```http
GET /api/inventory/items/<ITEM_ID_CHICKEN>
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 200`** ✓

---

### TC-NFR-02 — BOLA: Access Cross-Tenant Resource

```http
GET /api/inventory/items/<ITEM_ID_RICE_B>
Authorization: Bearer <OWNER_TOKEN>
```

(ITEM_ID_RICE_B belongs to Biryani Hub)

**Expected: `HTTP 404`** — NOT 403 (don't reveal existence of cross-tenant resources)

---

### TC-NFR-03 — BOLA: UUID Prevents ID Enumeration

All IDs are UUIDs — cannot predict next ID. Sequential IDs like `1, 2, 3` are absent.

```http
GET /api/inventory/items/1
GET /api/inventory/items/2
```

**Expected:** Both `HTTP 404` (no sequential integer IDs)

---

### TC-NFR-04 — Broken Authentication: No Token

```http
GET /api/inventory/items
(No Authorization header)
```

**Expected: `HTTP 401`**

---

### TC-NFR-05 — Broken Object Property Level Auth: Cannot Change Own Role

```http
PATCH /api/staff/employees/<EMPLOYEE_ID_ANITA>
Authorization: Bearer <STAFF_TOKEN>

{
  "role": "OWNER",
  "hourlyRate": 99999.00
}
```

**Expected:** Either `HTTP 403` or fields silently ignored (role and sensitive fields protected)

```sql
SELECT role, hourly_rate FROM employees WHERE id = '<EMPLOYEE_ID_ANITA>';
-- role still 'KITCHEN_STAFF', hourly_rate unchanged
```

---

### TC-NFR-06 — Cannot Modify tenant_id via API

```http
PATCH /api/inventory/items/<ITEM_ID_CHICKEN>

{
  "tenantId": "<TENANT_B_ID>",
  "currentStock": 999
}
```

**Expected:** `tenantId` field silently ignored. Item remains in Tenant A.

```sql
SELECT tenant_id FROM inventory_items WHERE id = '<ITEM_ID_CHICKEN>';
-- Still = TENANT_A_ID
```

---

### TC-NFR-07 — Unrestricted Resource Consumption: Bulk Upload Limit

```http
POST /api/inventory/items/bulk
Authorization: Bearer <OWNER_TOKEN>

{
  "items": [/* 10,001 items */]
}
```

**Expected: `HTTP 400`** — bulk import limit enforced (e.g., max 1000 items per request)

---

### TC-NFR-08 — Unrestricted Resource Consumption: File Size Limit

```http
POST /api/files/upload
Content-Type: multipart/form-data

file: [100MB_image.jpg]
```

**Expected: `HTTP 413`** — Payload Too Large

---

### TC-NFR-09 — SSRF: Webhook URL Targeting Internal Service

```http
POST /api/inventory/suppliers/<SUPPLIER_ID>/webhook

{
  "callbackUrl": "http://localhost:8081/internal/auth/admin"
}
```

**Expected: `HTTP 400`** — internal IP/localhost URLs blocked

---

### TC-NFR-10 — SQL Injection: Item Name

```http
POST /api/inventory/items

{
  "name": "'; DROP TABLE inventory_items; --",
  "currentStock": 5,
  "purchaseUnit": "kg"
}
```

**Expected: `HTTP 201`** — Payload stored safely as literal string

```sql
SELECT name FROM inventory_items ORDER BY created_at DESC LIMIT 1;
-- name = "'; DROP TABLE inventory_items; --" (literal)
-- inventory_items table still intact and queryable
```

---

### TC-NFR-11 — SQL Injection: Search/Filter Param

```http
GET /api/inventory/items?name='; DELETE FROM inventory_items; --
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 200`** — Returns empty results; SQL injection escaped via parameterized query

---

### TC-NFR-12 — XSS: Payload in Restaurant Name

```http
POST /api/auth/register

{
  "restaurantName": "<img src=x onerror=alert(1)>",
  "email": "xss2@test.com",
  "password": "TestPass@123"
}
```

**Expected: `HTTP 201`** — stored as literal

**API Response:**
```json
{ "restaurant": { "name": "<img src=x onerror=alert(1)>" } }
```

Client-side rendering must escape — stored as raw string, escaped in HTML context.

---

### TC-NFR-13 — Security Headers on All Responses

```bash
curl -I http://localhost:8080/api/inventory/items -H "Authorization: Bearer <TOKEN>"
```

**Expected headers:**
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Cache-Control: no-store  (on auth/sensitive endpoints)
```

---

### TC-NFR-14 — Actuator Endpoints Not Publicly Accessible

```http
GET http://localhost:8082/actuator/env
GET http://localhost:8082/actuator/beans
GET http://localhost:8082/actuator/threaddump
GET http://localhost:8082/actuator/httptrace
```

**Expected:** All return `HTTP 401` or `HTTP 404`

```http
GET http://localhost:8082/actuator/health
```

**Expected: `HTTP 200`** — health endpoint only is public

---

### TC-NFR-15 — CORS: Evil Origin Blocked

```bash
curl -H "Origin: http://evil.com" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS \
     http://localhost:8080/api/auth/login
```

**Expected:** `Access-Control-Allow-Origin` header does NOT include `http://evil.com`

---

---

## 5. Data Integrity

### TC-NFR-20 — All Monetary Columns are NUMERIC(12,2)

```sql
SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN (
    'amount', 'gross_sales', 'net_sales', 'avg_cost', 'par_level',
    'total_amount', 'menu_price', 'total_cost', 'hourly_rate',
    'cash_over_short', 'splh', 'avg_check_size'
  );
-- EVERY row: data_type = 'numeric', numeric_precision = 12, numeric_scale = 2
-- NONE should be 'double precision' or 'real'
```

---

### TC-NFR-21 — Monetary Precision: No Floating Point Drift

```sql
-- Store 1000 expenses each ₹0.01
-- SUM should be exactly ₹10.00
WITH expense_sum AS (
  SELECT SUM(amount) as total
  FROM expenses
  WHERE tenant_id = '<TENANT_ID>' AND amount = 0.01
)
SELECT total, total = 10.00 AS is_exact FROM expense_sum;
-- is_exact = true (NUMERIC arithmetic, not floating point)
```

---

### TC-NFR-22 — All Primary Keys are UUID v4

```sql
SELECT id FROM inventory_items WHERE tenant_id = '<TENANT_ID>' LIMIT 5;
-- All IDs match UUID v4 format: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx
```

**API Response verification:** Every `id` field in responses matches regex:
`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`

---

### TC-NFR-23 — Soft Delete Enforced — No Hard Deletes

```http
DELETE /api/inventory/items/<ITEM_ID_OIL>
Authorization: Bearer <OWNER_TOKEN>
```

```sql
-- Row still exists
SELECT name, deleted_at FROM inventory_items WHERE id = '<ITEM_ID_OIL>';
-- deleted_at IS NOT NULL

-- Row not visible in list
```

```http
GET /api/inventory/items
```
**Expected:** Cooking Oil NOT in response

---

### TC-NFR-24 — Soft Delete: Historical References Preserved

```sql
-- After deleting Cooking Oil item, waste logs referencing it still exist
SELECT COUNT(*) FROM waste_logs WHERE item_id = '<ITEM_ID_OIL>';
-- Count > 0 (history preserved even though item is "deleted")
```

---

### TC-NFR-25 — All Tables Have tenant_id Column

```sql
SELECT table_name
FROM information_schema.columns
WHERE column_name = 'tenant_id'
  AND table_schema = 'public'
ORDER BY table_name;
```

**Expected:** ALL of these tables must appear:
`inventory_items, suppliers, purchase_orders, waste_logs, recipes, inventory_counts, daily_sales_reports, expenses, vendor_payments, employees, shifts, tasks, shift_feedback, tip_pools, attendance, certifications, notifications, ai_jobs, file_uploads, audit_logs`

---

### TC-NFR-26 — RLS Enabled on All Tenant Tables

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
```

**Expected:** ALL tenant-scoped tables have `rowsecurity = true`

---

### TC-NFR-27 — Optimistic Locking: Concurrent Update Conflict

**Get current version:**
```http
GET /api/inventory/items/<ITEM_ID_CHICKEN>
```
Returns `"version": 3`

**Two concurrent updates with same version:**
```http
PATCH /api/inventory/items/<ITEM_ID_CHICKEN>
{ "currentStock": 18, "version": 3 }

PATCH /api/inventory/items/<ITEM_ID_CHICKEN>
{ "currentStock": 22, "version": 3 }
```

**Expected:** First succeeds `HTTP 200`. Second gets:
```json
{
  "error": "OPTIMISTIC_LOCK_CONFLICT",
  "message": "Item was modified by another user. Please refresh and try again.",
  "currentVersion": 4
}
```

---

### TC-NFR-28 — Version Increments Monotonically

```sql
SELECT id, version, updated_at FROM inventory_items
WHERE id = '<ITEM_ID_CHICKEN>'
ORDER BY updated_at;
-- version: 1, 2, 3, 4... (strictly increasing, never decreasing)
```

---

### TC-NFR-29 — All Timestamps in TIMESTAMPTZ

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name IN ('created_at', 'updated_at', 'deleted_at', 'timestamp', 'expires_at')
  AND table_name IN ('inventory_items', 'audit_logs', 'shifts', 'refresh_tokens');
-- ALL should be 'timestamp with time zone' (NOT 'timestamp without time zone')
```

---

### TC-NFR-30 — created_at Auto-Set by DB, Not Client

```http
POST /api/inventory/items

{
  "name": "Test Item",
  "purchaseUnit": "kg",
  "created_at": "2020-01-01T00:00:00Z"  // attempt to forge timestamp
}
```

**Expected:** `created_at` in response is current time (server-set), not 2020

---

---

## 6. Error Handling Standards

### TC-NFR-40 — Validation Error Format (HTTP 400)

```http
POST /api/inventory/items
Authorization: Bearer <OWNER_TOKEN>

{ "name": "", "currentStock": "not_a_number" }
```

**Expected: `HTTP 400`**
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Validation failed",
  "timestamp": "2026-05-04T10:00:00Z",
  "fields": [
    { "field": "name", "message": "Name is required" },
    { "field": "currentStock", "message": "Must be a non-negative number" }
  ]
}
```

**Must NOT contain:** `java.lang.`, `NullPointerException`, stack traces

---

### TC-NFR-41 — 404 Not Found Format

```http
GET /api/inventory/items/00000000-0000-4000-8000-000000000000
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 404`**
```json
{
  "error": "NOT_FOUND",
  "message": "Resource not found",
  "timestamp": "2026-05-04T10:00:00Z"
}
```

**Must NOT reveal:** Table name, column name, SQL query

---

### TC-NFR-42 — 500 Internal Error: No Stack Trace Exposed

**Trigger internal error (e.g., DB connection temporarily lost):**

**Expected: `HTTP 500`**
```json
{
  "error": "INTERNAL_ERROR",
  "message": "An unexpected error occurred. Please try again.",
  "timestamp": "2026-05-04T10:00:00Z"
}
```

**Must NOT contain:**
- `java.lang.RuntimeException`
- `at com.kitchenledger.inventory`
- `org.springframework`
- Database connection string
- Port numbers of internal services (8081, 8082, etc.)
- Table or column names from stack traces

---

### TC-NFR-43 — HTTP Status Code Correctness Matrix

| Scenario | Expected Code |
|---|---|
| Successful GET | 200 |
| Successful POST (created) | 201 |
| AI job accepted | 202 |
| Validation error | 400 |
| Unauthenticated | 401 |
| Wrong role | 403 |
| Resource not found | 404 |
| Duplicate resource | 409 |
| Request body too large | 413 |
| Unsupported media type | 415 |
| Business rule violation | 422 |
| Rate limit exceeded | 429 |
| Internal server error | 500 |

Test each scenario and verify correct code.

---

### TC-NFR-44 — Consistent Error Format Across All Services

Test error responses from each service and verify same JSON structure:
- Gateway (Node.js)
- Auth Service (Spring Boot)
- Inventory Service (Spring Boot)
- Finance Service (Spring Boot)
- Staff Service (Spring Boot)
- AI Service (FastAPI)
- File Service (Node.js)

All must return errors in the same format:
```json
{ "error": "ERROR_CODE", "message": "Human readable", "timestamp": "ISO8601" }
```

---

---

## 7. Performance Benchmarks

### TC-NFR-50 — GET /inventory/items (<100 items) — Under 200ms

```bash
time curl -s -o /dev/null http://localhost:8080/api/inventory/items \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected:** Response in < 200ms (cold), < 50ms (warm cache)

---

### TC-NFR-51 — GET /finance/dashboard — Under 1000ms

```bash
time curl -s -o /dev/null "http://localhost:8080/api/finance/dashboard?date=2026-05-04" \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected:** < 1000ms (may involve joins across multiple tables)

---

### TC-NFR-52 — GET /finance/reports/pnl (Monthly) — Under 3000ms

```bash
time curl -s -o /dev/null "http://localhost:8080/api/finance/reports/pnl?period=monthly&month=2026-05" \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected:** < 3000ms (complex aggregation)

---

### TC-NFR-53 — Pagination: 1000 Items with Limit 20

**Setup:** Create 1000 inventory items

```bash
time curl -s -o /dev/null "http://localhost:8080/api/inventory/items?page=1&limit=20" \
  -H "Authorization: Bearer <TOKEN>"
```

**Expected:** < 500ms even with 1000 items (uses OFFSET/LIMIT, index on tenant_id)

---

### TC-NFR-54 — Maximum Pagination Limit Enforced

```http
GET /api/inventory/items?limit=10000
```

**Expected:** Response uses max allowed (e.g., 500), with `"limitApplied": 500`

---

### TC-NFR-55 — All Health Checks Return Under 500ms

```bash
for port in 8080 8081 8082 8083 8084 8085 8086 8087 8088; do
  time curl -s -o /dev/null "http://localhost:$port/health" || \
  time curl -s -o /dev/null "http://localhost:$port/actuator/health"
done
```

**Expected:** All < 500ms

---

---

## 8. Rate Limiting

### TC-NFR-60 — Auth Endpoint Rate Limiting

```bash
for i in {1..30}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:8080/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
done
```

**Expected:** After ~10 requests/min per IP, responses become `429`

**Headers on 429:**
```
Retry-After: 60
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <timestamp>
```

---

### TC-NFR-61 — API Endpoint Rate Limiting (100/min per JWT)

```bash
for i in {1..110}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    http://localhost:8080/api/inventory/items \
    -H "Authorization: Bearer <OWNER_TOKEN>"
done
```

**Expected:** After 100 requests, `429` responses

---

### TC-NFR-62 — AI Endpoint Rate Limiting (20/min per tenant)

```bash
for i in {1..25}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:8080/api/ai/nl-query \
    -H "Authorization: Bearer <OWNER_TOKEN>" \
    -d '{"query":"test"}'
done
```

**Expected:** After 20 requests, `429`

---

### TC-NFR-63 — Rate Limit Resets After Window

After rate limit triggered, wait for window to expire (60 seconds):

```http
POST /api/auth/login (after 60s cooldown)
```

**Expected: `HTTP 401`** (wrong credentials) — not `429` (rate limit reset)

---

---

## 9. Idempotency

### TC-NFR-70 — POST Clock-In Twice for Same Shift

```http
POST /api/staff/attendance/clock-in
{ "shiftId": "<SHIFT_ID>", "timestamp": "2026-05-04T09:00:00+05:30" }

POST /api/staff/attendance/clock-in
{ "shiftId": "<SHIFT_ID>", "timestamp": "2026-05-04T09:00:00+05:30" }
```

**Expected:** Second request returns current attendance state (not duplicate):
- Either `HTTP 200` with existing attendance record
- Or `HTTP 409` "Already clocked in for this shift"

```sql
SELECT COUNT(*) FROM attendance WHERE shift_id = '<SHIFT_ID>';
-- Count = 1 (not 2)
```

---

### TC-NFR-71 — Webhook Idempotency (UPI Payment)

```http
POST /api/finance/webhooks/upi-payment
{ "eventId": "event-unique-001", "amount": 847.00, "qrReference": "..." }

POST /api/finance/webhooks/upi-payment
{ "eventId": "event-unique-001", "amount": 847.00, "qrReference": "..." }
```

**Expected:** Second webhook rejected:
```json
{ "status": "ALREADY_PROCESSED", "originalProcessedAt": "<timestamp>" }
```

```sql
SELECT COUNT(*) FROM transactions WHERE qr_reference = '<qrReference>';
-- Count = 1 (not 2)
```

---

### TC-NFR-72 — Mark All Notifications Read — Idempotent

```http
POST /api/notifications/read-all
POST /api/notifications/read-all  (second time)
```

**Expected:** Both return `HTTP 200`. No error on second call.

---

---

## 10. Offline Sync Behavior

### TC-NFR-80 — Client Submits Queued Operations After Reconnect

**Scenario:** Mobile device goes offline, queues 3 operations:
1. Waste log entry (offline)
2. Clock-out (offline)
3. Task completion (offline)

On reconnect:
```http
POST /api/sync/operations
Authorization: Bearer <STAFF_TOKEN>
Content-Type: application/json

{
  "clientId": "device-uuid-anita-001",
  "operations": [
    {
      "operationId": "op-client-001",
      "type": "CREATE",
      "entity": "waste_log",
      "payload": {
        "itemId": "<ITEM_ID_TOMATO>",
        "quantity": 1,
        "reason": "PREP_WASTE",
        "offlineTimestamp": "2026-05-04T14:30:00+05:30"
      }
    },
    {
      "operationId": "op-client-002",
      "type": "UPDATE",
      "entity": "attendance",
      "entityId": "<ATTENDANCE_ID>",
      "payload": { "clockOut": "2026-05-04T17:05:00+05:30" }
    },
    {
      "operationId": "op-client-003",
      "type": "UPDATE",
      "entity": "task",
      "entityId": "<TASK_ID>",
      "payload": { "status": "COMPLETED", "completedAt": "2026-05-04T09:25:00+05:30" }
    }
  ]
}
```

**Expected: `HTTP 200`**
```json
{
  "processed": 3,
  "results": [
    { "operationId": "op-client-001", "status": "SUCCESS", "entityId": "<new_waste_log_id>" },
    { "operationId": "op-client-002", "status": "SUCCESS" },
    { "operationId": "op-client-003", "status": "SUCCESS" }
  ]
}
```

---

### TC-NFR-81 — Additive Operations Never Conflict

**Scenario:** Two devices both record stock received (+20 units and +15 units) while offline.

**Both sync:**
```json
[
  { "type": "STOCK_RECEIVED", "itemId": "<ITEM_ID_CHICKEN>", "quantity": 20 },
  { "type": "STOCK_RECEIVED", "itemId": "<ITEM_ID_CHICKEN>", "quantity": 15 }
]
```

**Expected:** Stock increases by 35 total. No conflict. Additive operations are order-independent.

```sql
SELECT current_stock FROM inventory_items WHERE id = '<ITEM_ID_CHICKEN>';
-- Increased by exactly 35
```

---

### TC-NFR-82 — Last-Write-Wins for Notes/Descriptions

**Two devices both update an item's description while offline:**
- Device 1: `"notes": "Use by May 9"`
- Device 2: `"notes": "Check freshness before use"`

Both sync. Last write (by timestamp) wins.

**Expected:** One of the two notes is saved. No merge conflict error. `HTTP 200`.

---

### TC-NFR-83 — True Conflict on Same Field — Flagged for Review

**Two devices update same inventory item's current_stock (non-additive):**
- Device 1 (count at 09:00): `currentStock: 18`
- Device 2 (count at 09:05): `currentStock: 20`

Both sync. Same field, different values.

**Expected:** Conflict flagged:
```json
{
  "operationId": "op-conflicting",
  "status": "CONFLICT",
  "conflictDetails": {
    "field": "currentStock",
    "device1Value": 18,
    "device2Value": 20,
    "requiresManagerReview": true
  }
}
```

---

## GO/NO-GO Checklist — Traceability & NFR Epic

| Test | Required |
|---|---|
| TC-TRACE-01 Perfect 5-stage chain | MANDATORY |
| TC-TRACE-02 Discrepancy chain visible | MANDATORY |
| TC-TRACE-08 Chain ends where activity ends | MANDATORY |
| TC-NFR-02 Cross-tenant returns 404 | MANDATORY |
| TC-NFR-10 SQL injection safe | MANDATORY |
| TC-NFR-11 Search param injection safe | MANDATORY |
| TC-NFR-13 Security headers present | MANDATORY |
| TC-NFR-14 Actuator endpoints protected | MANDATORY |
| TC-NFR-20 All monetary columns NUMERIC(12,2) | MANDATORY |
| TC-NFR-23 Soft delete enforced | MANDATORY |
| TC-NFR-25 tenant_id on all tables | MANDATORY |
| TC-NFR-26 RLS on all tables | MANDATORY |
| TC-NFR-27 Optimistic lock conflict | MANDATORY |
| TC-NFR-40 Validation error format correct | MANDATORY |
| TC-NFR-42 500 error no stack trace | MANDATORY |
| TC-NFR-43 HTTP status code matrix | MANDATORY |
| TC-NFR-60 Auth rate limiting | MANDATORY |
| TC-NFR-71 Webhook idempotency | MANDATORY |
| TC-NFR-80 Offline sync basic | RECOMMENDED |
| TC-NFR-81 Additive operations no conflict | RECOMMENDED |
