# KitchenLedger Logic & Correctness Audit

**Date:** 2026-04-25  
**Scope:** Internal logic, API contracts, data integrity, event handling  
**Services Audited:** gateway, auth-service, inventory-service, finance-service, staff-service, ai-service, report-service, notification-service, file-service

---

## CRITICAL BUGS

### 1. API Route Version Mismatch: `/api/inventory/*` vs `/api/v1/inventory/*`

**Severity:** CRITICAL - All inventory endpoints fail at gateway  
**Location:**
- **Client:** `apps/web/lib/api/inventory.api.ts:5-60` — calls `/api/inventory/items`, `/api/inventory/suppliers`, etc.
- **Server:** All inventory controllers in `services/inventory-service/src/main/java/com/kitchenledger/inventory/controller/*.java` — use `@RequestMapping("/api/v1/inventory/*")`

**Issue:** Web client makes requests to `/api/inventory/*` but services expose `/api/v1/inventory/*`. Gateway proxy routes `/api/inventory` to `INVENTORY_SERVICE_URL`, but the upstream service returns 404 on all requests.

**Impact:** All inventory operations from web UI fail silently or return 404. Business operations like stock receipt, waste logging, purchase orders, stock counts are non-functional.

**Affected endpoints:**
- `inventoryApi.items.*` — all CRUD operations
- `inventoryApi.suppliers.*` — all CRUD operations  
- `inventoryApi.purchaseOrders.*` — all CRUD operations
- `inventoryApi.receipts.*` — all CRUD operations
- `inventoryApi.counts.*` — all CRUD operations
- `inventoryApi.waste.*` — all CRUD operations
- `inventoryApi.recipes.*` — all CRUD operations

---

### 2. Staff API Route Version Mismatch: `/api/staff/*` vs `/api/v1/staff/*`

**Severity:** CRITICAL - All staff endpoints fail at gateway  
**Location:**
- **Client:** `apps/web/lib/api/staff.api.ts:5-62` — calls `/api/staff/employees`, `/api/staff/shifts`, etc.
- **Server:** All staff controllers — use `@RequestMapping("/api/v1/staff/*")`

**Issue:** Same pattern as inventory. Web client calls `/api/staff/*` but services expose `/api/v1/staff/*`.

**Impact:** All staff operations fail: employee management, shift scheduling, attendance tracking, certifications, task management, tip pools.

**Affected endpoints:** All in `staffApi.*`

---

### 3. Exception Handling with Empty Catch Block in AI Service OCR Task

**Severity:** CRITICAL - Silent failures in background jobs  
**Location:** `services/ai-service/app/workers/tasks.py:136-138`

```python
try:
    job = _get_job(db, job_id)
    _mark_failed(db, job, str(exc)[:500])
except Exception:
    pass  # Silent failure — job remains in 'processing' forever
```

**Issue:** When a job already fails (line 125), the recovery block attempts to mark it as failed in the DB. If THAT fails (e.g., DB is down, job was deleted), the exception is silently swallowed. The original job remains in 'processing' status indefinitely.

**Impact:** Failed OCR jobs orphaned in 'processing' state. They will accumulate until `cleanup_stuck_jobs` runs 30+ minutes later.

---

### 4. Silent Failures in Report Service _fetch_data Function

**Severity:** HIGH - Data loss and inaccurate reports  
**Location:** `services/report-service/app/workers/tasks.py:107-237`

The `_safe_list_get()` function (lines 107-113) silently returns `[]` on any error, including:
- Network timeouts
- 500 server errors from upstream services
- Malformed JSON responses
- Missing required fields

**Issue:** Reports are generated with empty datasets when upstream services are unavailable, without logging the failure or notifying the user. P&L, waste, expense, and other critical reports will show zero values.

**Example:** If inventory-service is down:
```python
data = _safe_list_get(f"{settings.inventory_service_url}/internal/inventory/waste", common)
# Returns [] on ANY error
```

A user requesting a waste report gets a PDF with no data but completes successfully.

**Impact:** Financial reports, variance reports, and performance metrics are silently inaccurate. Decision-making based on empty/wrong reports.

---

## MISSING IMPLEMENTATIONS / STUBS

### 1. Enum Fallback Returns null in Inventory Service

**Severity:** MEDIUM - Risk of NullPointerException  
**Location:**
- `services/inventory-service/src/main/java/com/kitchenledger/inventory/model/enums/TransferStatus.java` — `fromValue()` returns `null`
- `services/inventory-service/src/main/java/com/kitchenledger/inventory/model/enums/CountStatus.java` — `fromValue()` returns `null`
- `services/inventory-service/src/main/java/com/kitchenledger/inventory/model/enums/CountType.java` — `fromValue()` returns `null`

**Issue:** These enum utility methods return `null` instead of throwing an exception or providing a default. Callers must null-check the result.

**Impact:** Potential NullPointerException if not handled. Silent data corruption if null values are persisted.

---

### 2. TODO Comment in Finance UPI Service

**Location:** `services/finance-service/src/main/java/com/kitchenledger/finance/service/UpiService.java`

```java
"merchant@upi",  // TODO: fetch from tenant settings
```

**Issue:** Hardcoded merchant UPI ID. Should be fetched from tenant configuration but is not implemented.

**Impact:** All UPI transactions use the wrong merchant ID. Cannot process UPI payments correctly or distinguish by tenant.

---

## CONTRACT MISMATCHES

### 1. RabbitMQ Event Envelope Format Inconsistency

**Severity:** MEDIUM - Event consumption fragility  
**Location:**
- **Published:** Finance, Inventory, Staff, Auth services use `EventEnvelope` wrapper with camelCase fields: `eventId`, `eventType`, `tenantId`, `payload`
- **Consumed:** Notification service normalizes both camelCase and snake_case via `normalizeEnvelope()` (line 48-59 of `event.consumer.ts`)

**Issue:** Consumers must implement defensive parsing to handle both formats. If a new service publishes with wrong field names, it silently fails parsing and gets logged as error but message is NACKed.

**Risk:** Notification service is brittle and silently loses events if field naming changes upstream.

---

### 2. AI Service OCR Event Contract Mismatch

**Severity:** MEDIUM - Inventory service misses required fields  
**Location:**
- **AI Service publishes** `ai.ocr.completed` with payload containing `reference_id`, `document_type`, `line_items` (task.py:43-50)
- **Inventory Service listens** on `ai.ocr.completed` but only appears to consume via internal call (no consumer found in code)

**Issue:** The event contract is defined but there is no consumer implementation in inventory-service. Check if OCR events are actually consumed or if the listener is missing.

---

### 3. Finance DSR Event Published with Wrong Field Names

**Severity:** LOW-MEDIUM - Notification service handles gracefully but unclear intent  
**Location:** `services/finance-service/src/main/java/com/kitchenledger/finance/event/FinanceEventPublisher.java:66-76`

```java
"net_sales": dsr.getNetSales() != null ? dsr.getNetSales().toPlainString() : "0",
```

vs. Notification consumer (event.consumer.ts:226):

```typescript
body: `Sales report for ${payload.report_date ?? payload.date} reconciled. Net: ${payload.currency} ${payload.net_sales}`,
```

**Issue:** The event publishes `net_sales` but consumer also checks `payload.date` as fallback for `report_date`. Field naming is inconsistent.

---

## DATA INTEGRITY ISSUES

### 1. Missing JPA @Column Name Mapping for Snake_Case Database Columns

**Severity:** MEDIUM - Silent data loss on camelCase fields  
**Location:** Multiple entities in inventory-service may have field name → column name mismatches

**Example check needed:**
- Entity field: `receivedQuantity` — DB column: `received_quantity`  
- Entity field: `unitPrice` — DB column: `unit_price`
- Entity field: `invoiceNumber` — DB column: `invoice_number`

If `@Column(name="...")` is missing, Hibernate will look for `receivedQuantity` column (camelCase) and fail or return null.

**Action:** Verify all JPA entities in finance, staff, auth services have correct `@Column(name=...)` annotations matching migration SQL.

---

### 2. No Pagination on Internal Service List Endpoints

**Severity:** MEDIUM - OOM risk for large datasets  
**Location:** `services/inventory-service/src/main/java/com/kitchenledger/inventory/controller/InternalInventoryController.java`

- Line 51: `listItems()` returns `List<InventoryItemResponse>` — no pagination
- Line 73: `belowPar()` returns `List<InventoryItemResponse>` — no pagination
- Line 84: `listWaste()` returns `List<WasteLogResponse>` — no pagination
- Line 120: `listCounts()` returns `List<Map<String, Object>>` — no pagination

**Issue:** These endpoints are called by report-service to generate reports. For a large multi-location chain with thousands of items/transactions, returning all results in memory can cause OOM.

**Impact:** Report generation fails for large tenants. Memory exhaustion on report-service.

---

### 3. Report Generation Silently Caps Data at 50 Rows

**Severity:** MEDIUM - Incomplete reports  
**Location:** `services/report-service/app/workers/tasks.py:262`

```python
for row in data[:50]:  # cap at 50 rows to avoid overflow
```

**Issue:** When generating a PDF, only the first 50 rows of data are included. If a report has 500 items, 450 are silently dropped. No error, no truncation warning.

**Impact:** Reports are incomplete and appear complete to the user. Decision-making based on partial data.

---

## MISSING ERROR HANDLING

### 1. Unhandled Exception in Report Service PDF Upload

**Severity:** MEDIUM - Silent job failure  
**Location:** `services/report-service/app/workers/tasks.py:274-282`

```python
def _upload_pdf(job_id: str, tenant_id: str, pdf_bytes: bytes) -> str:
    client = _get_supabase()
    bucket = "reports"
    path   = f"{tenant_id}/{job_id}.pdf"
    client.storage.from_(bucket).upload(path, pdf_bytes,
                                        file_options={"content-type": "application/pdf"})
    result = client.storage.from_(bucket).create_signed_url(path, expires_in=86400)
    return result.get("signedURL") or result.get("signedUrl", "")
```

**Issue:** No try-catch around Supabase API calls. If upload fails, the exception propagates up and causes the task to retry. No specific error handling for upload vs. signing errors.

**Impact:** Transient Supabase outages cause unnecessary task retries. Final errors after retries may not include meaningful error messages.

---

### 2. Unhandled HTTP Timeouts in Notification Service

**Severity:** MEDIUM - Silent notification failures  
**Location:** `services/notification-service/src/clients/auth.client.ts:18-31`

```typescript
const res = await fetch(`${config.AUTH_SERVICE_URL}/internal/auth/users?${params}`,
  { headers: INTERNAL_HEADERS }
);
```

**Issue:** No timeout specified on fetch(). If auth-service is slow/hung, the notification service hangs indefinitely waiting for response. Only generic catch-all on line 28.

**Impact:** Notifications fail to send while waiting for auth-service.Notification queues back up.

---

### 3. Missing Error Handling on RestTemplate Calls in Staff Service

**Severity:** LOW-MEDIUM - Check for try-catch coverage  
**Location:** `services/staff-service/src/main/java/com/kitchenledger/staff/client/AuthServiceClient.java`

Need to verify that RestTemplate calls to external services (auth-service, etc.) have proper exception handling. If not, 5xx errors from upstream will propagate as unhandled exceptions.

---

## MINOR ISSUES

### 1. Empty Exception Handler in AI Service Task Cleanup

**Location:** `services/ai-service/app/workers/tasks.py:273-276`

```python
except Exception:
    db.rollback()
    logger.exception("cleanup_stuck_jobs failed")
    raise
```

Good practice to log and re-raise, but this ensures cleanup failures are visible.

---

### 2. Report Service Uses Sync Database Connection in Async Task

**Severity:** LOW - Performance concern  
**Location:** `services/report-service/app/workers/tasks.py:64-105`

```python
def _db_conn():
    """Open a synchronous psycopg2 connection for status updates."""
    return psycopg2.connect(settings.database_url)
```

Used inside Celery async tasks. Should use async context managers to avoid blocking the worker thread.

---

### 3. Finance Event Publisher Saves Outbox on Publish Failure

**Location:** `services/finance-service/src/main/java/com/kitchenledger/finance/event/FinanceEventPublisher.java:269-281`

Recovery logic attempts to save events to outbox table. If outbox save also fails, the error is logged but event is LOST (line 279).

**Mitigation:** Good logging, but outbox table must not be down if RabbitMQ is down.

---

## RECOMMENDATIONS

### Immediate (P0)

1. **Fix API route versions:** Update `inventoryApi.ts` and `staffApi.ts` to use `/api/v1/inventory/` and `/api/v1/staff/` paths OR update Java controllers to remove `/v1`.

2. **Add error handling to silent failures:**
   - Report service `_safe_list_get()` → log and bubble up errors instead of silently returning `[]`
   - AI service exception handler → remove `pass`, log and re-raise
   - Report PDF generator → cap at 50 rows but warn in error_message

3. **Fix UPI merchant ID:** Load from tenant settings table instead of hardcoding.

### High (P1)

4. **Add pagination to internal endpoints:** All list endpoints in `InternalInventoryController` and similar should accept `limit` and `offset` parameters.

5. **Verify JPA @Column mappings:** Audit all entities against migration SQL to ensure field → column name consistency.

6. **Verify AI OCR event consumption:** Confirm inventory-service actually consumes `ai.ocr.completed` or remove the RabbitMQ binding.

7. **Add timeouts to fetch() calls:** Notification service HTTP calls need explicit timeout (e.g., 5s).

### Medium (P2)

8. **Convert report service to async DB:** Use async context managers instead of sync psycopg2 in Celery tasks.

9. **Improve report data fetch error visibility:** Include upstream service name and HTTP status in error messages.

10. **Document RabbitMQ event contracts:** Formalize event schemas and ensure all services publish the same field format (snake_case vs camelCase).

---

## CHECKLIST

- [ ] Test inventory and staff API routes with web UI
- [ ] Review report service error logs for silent failures
- [ ] Verify all internal endpoints work under load (>10k items)
- [ ] Audit JPA entity @Column annotations
- [ ] Run AI service cleanup job and verify processing timeouts
- [ ] Check RabbitMQ dead-letter queues for dropped events
- [ ] Load test notification service with slow auth-service
- [ ] Verify outbox replay works after RabbitMQ recovery

