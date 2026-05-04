# KitchenLedger — System Integration Test Plan

> Tests the platform as a **complete system**, not individual services.  
> Each scenario is a realistic business event that crosses multiple services simultaneously.  
> These tests must pass **in addition to** the epic-level tests — they verify the glue, not the features.

---

## What This Covers (and Why It's Different)

| Epic files | System integration (this file) |
|---|---|
| Test one feature in isolation | Test a full business event end-to-end |
| Verify service A returns correct HTTP response | Verify service A's event triggers service B which updates service C |
| Single API call | Chain of 5–10 calls that mirror real user behavior |
| Mock or stub dependencies | Full live stack required |

The 7 epic files answer: "Does each feature work?"  
This file answers: "Does the restaurant work?"

---

## Scope Clarification: Epics vs Extended Modules

### What the 7 epics cover (Phase 1 — implemented)

| # | Epic | PRD Section |
|---|---|---|
| 1 | Auth & Multi-Tenancy | Cross-cutting |
| 2 | Inventory Management | 3.1 |
| 3 | Finance & Accounts | 3.2 |
| 4 | Staff & HR | 3.3 |
| 5 | AI Features | Section 4 |
| 6 | Notifications & Audit | 3.5 |
| 7 | Traceability + NFR | Cross-cutting |

### What is NOT yet testable (Phase 2/3 — not implemented)

| Module | PRD Section | Phase |
|---|---|---|
| Front of House (FOH) guest lifecycle | 3.4 #1 | Phase 2 |
| Bar & Beverage (pour cost %, spirit inventory) | 3.4 #8 | Phase 2 |
| Maintenance & Engineering (equipment PM) | 3.4 #7 | Phase 2 |
| Quality Control / HACCP compliance | 3.4 #12 | Phase 2 |
| Marketing & Loyalty / CRM | 3.4 #4 | Phase 3 |
| Multi-location / Commissary | 3.4 #13 | Phase 3 |
| POS Integration | 3.4 (implied) | Phase 3 |
| QuickBooks/Xero export | 3.2 | Phase 2 |
| LSTM demand forecasting | 4.3 Phase 3 | Phase 3 |

**These are excluded from testing. Do not raise failures for missing Phase 2/3 features.**

---

## Prerequisites

```bash
# Full stack running
npm run infra:up
npm run dev

# All 9 services green
curl http://localhost:8080/health          # Gateway
curl http://localhost:8081/actuator/health # Auth
curl http://localhost:8082/actuator/health # Inventory
curl http://localhost:8083/actuator/health # Finance
curl http://localhost:8084/health          # AI
curl http://localhost:8085/health          # File
curl http://localhost:8086/health          # Notification
curl http://localhost:8087/health          # Report
curl http://localhost:8088/actuator/health # Staff
```

### Personas and Base Data

Before running any scenario, register the tenant and get tokens:

```http
POST http://localhost:8080/api/auth/register
Content-Type: application/json

{
  "restaurantName": "Dosa Palace",
  "ownerEmail": "priya@dosapalace.com",
  "password": "SecurePass@123",
  "currency": "INR",
  "timezone": "Asia/Kolkata"
}
```

```http
POST http://localhost:8080/api/auth/login   → PRIYA_TOKEN (Owner)
POST http://localhost:8080/api/auth/login   → RAVI_TOKEN  (Manager, invited)
POST http://localhost:8080/api/auth/login   → ANITA_TOKEN (Kitchen Staff, invited)
```

Store `tenantId`, `PRIYA_TOKEN`, `RAVI_TOKEN`, `ANITA_TOKEN` for use throughout.

---

## Scenario Index

| # | Scenario | Services Touched | Duration to Execute |
|---|---|---|---|
| SIT-01 | New Restaurant Onboarding | Auth, Inventory, Staff, Notification | 15 min |
| SIT-02 | Full Operating Day (6am–11pm) | All 9 | 45 min |
| SIT-03 | Supplier Delivery + Three-Way Match + Notification | Inventory, Finance, Notification, Audit | 20 min |
| SIT-04 | Recipe Cost Change Ripple | Inventory, Finance, Notification | 15 min |
| SIT-05 | OCR Notebook → Inventory + Expense | AI, File, Inventory, Finance, Audit | 20 min |
| SIT-06 | Voice Waste Log → Stock → P&L Impact | AI, Inventory, Finance, Notification | 15 min |
| SIT-07 | Staff No-Show → Task Reassignment | Staff, Notification, Audit | 10 min |
| SIT-08 | Month-End Close | Finance, Report, Notification | 20 min |
| SIT-09 | Multi-Tenant Isolation Under Load | Auth, All services | 20 min |
| SIT-10 | Offline Mobile Sync | Inventory, Staff, Finance | 25 min |
| SIT-11 | Critical Alert Cascade | Inventory, Finance, Staff, Notification | 15 min |
| SIT-12 | Purchase-to-Plate Full Trace | Inventory, Finance, Staff, AI | 30 min |

---

## SIT-01 — New Restaurant Onboarding

**Narrative:** Priya signs up, configures her restaurant, invites staff, and adds her first items. By the end, a notification should be in-app and the audit log should have every action recorded.

**Services:** Auth → Inventory → Staff → Notification → Audit

---

## Implementation Coverage Note

A codebase audit was run against the PRD. The system is **~92% implemented**. The following 3 Phase 1 features are missing — tests that touch them are marked `[SKIP — NOT IMPLEMENTED]`:

| Feature | Missing | Tests Affected |
|---|---|---|
| Geofencing | No GPS provider | SIT-02 clock-in geofence step |
| FLSA Overtime | No 1.5× calculation | SIT-12 payroll overtime math |
| WhatsApp/SMS | Only push+email exist | Any WhatsApp notification steps |

Everything else in this document is testable against the current implementation.

---

### Step 1 — Tenant Registration

```http
POST /api/auth/register
{
  "restaurantName": "Dosa Palace",
  "ownerEmail": "priya@dosapalace.com",
  "password": "SecurePass@123",
  "currency": "INR",
  "timezone": "Asia/Kolkata",
  "country": "IN"
}
→ 201 { tenantId, accessToken, refreshToken }
```

DB verify:
```sql
SELECT id, name, currency, timezone, status 
FROM tenants WHERE name = 'Dosa Palace';
-- Expect: status = 'ACTIVE', currency = 'INR'
```

### Step 2 — Invite Manager

```http
POST /api/auth/users/invite
Authorization: Bearer PRIYA_TOKEN
{
  "email": "ravi@dosapalace.com",
  "role": "MANAGER",
  "name": "Ravi Kumar"
}
→ 201 { userId, inviteToken }
```

Verify notification service received invite email:
```sql
SELECT type, recipient_email, status 
FROM notifications 
WHERE tenant_id = $tenantId AND type = 'USER_INVITED';
-- Expect: 1 row, status = 'SENT'
```

### Step 3 — Ravi Accepts Invite + Sets Password

```http
POST /api/auth/accept-invite
{ "inviteToken": "...", "password": "RaviPass@456" }
→ 200 { accessToken }
```

### Step 4 — Invite Kitchen Staff

```http
POST /api/auth/users/invite
Authorization: Bearer PRIYA_TOKEN
{
  "email": "anita@dosapalace.com",
  "role": "KITCHEN_STAFF",
  "name": "Anita Sharma"
}
→ 201
```

### Step 5 — Add Inventory Items

```http
POST /api/inventory/items
Authorization: Bearer PRIYA_TOKEN
{
  "name": "Urad Dal",
  "category": "GRAINS",
  "unit": "kg",
  "currentStock": 50,
  "parLevel": 20,
  "abcCategory": "A",
  "unitCost": 120.00,
  "storageLocation": "Dry Store - Shelf 1",
  "isPerishable": false
}
→ 201 { itemId: "urad-dal-id" }
```

Add 4 more items (Idli Rice, Coconut Oil, Tomatoes, Chicken Breast).

### Step 6 — Verify Cross-Service Audit

```http
GET /api/audit/logs?limit=20
Authorization: Bearer PRIYA_TOKEN
```

Expected audit entries (in order):
```json
[
  { "action": "TENANT_REGISTERED", "userId": "priya-id" },
  { "action": "USER_INVITED",      "targetEmail": "ravi@dosapalace.com" },
  { "action": "USER_JOINED",       "userId": "ravi-id" },
  { "action": "USER_INVITED",      "targetEmail": "anita@dosapalace.com" },
  { "action": "ITEM_CREATED",      "resourceId": "urad-dal-id" }
]
```

**Pass criteria:** All 5 audit entries present, all `tenant_id` fields match, no entry from another tenant visible.

---

## SIT-02 — Full Operating Day

**Narrative:** A complete Tuesday at Dosa Palace — from opening checks through service to end-of-day reconciliation. This is the primary system integration test.

**Services:** All 9

---

### 6:00 AM — Morning Opening

#### Staff Clock-In

> **Note:** `clockInMethod: "GEOFENCE"` — geofencing GPS validation is NOT YET IMPLEMENTED.  
> Use `clockInMethod: "MANUAL"` for now. The attendance record will still be created correctly.

```http
POST /api/staff/attendance/clock-in
Authorization: Bearer ANITA_TOKEN
{
  "shiftId": "morning-shift-id",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "clockInMethod": "MANUAL"
}
→ 200 { attendanceId, status: "ON_TIME", scheduledStart: "06:00" }
```

#### Morning Inventory Count (Mobile)

```http
POST /api/inventory/counts
Authorization: Bearer ANITA_TOKEN
{
  "type": "CYCLE",
  "abcFilter": "A",
  "countedBy": "anita-id"
}
→ 201 { countId }

POST /api/inventory/counts/{countId}/items
{
  "items": [
    { "itemId": "urad-dal-id", "counted": 48.5 },
    { "itemId": "idli-rice-id", "counted": 72.0 },
    { "itemId": "chicken-breast-id", "counted": 12.0 }
  ]
}
→ 200 { variances: [{ itemId: "chicken-breast-id", expected: 14.0, actual: 12.0, variance: -2.0, variancePct: -14.3 }] }
```

Expected: variance report shows chicken breast 14.3% below expected → triggers anomaly alert.

#### Morning Task Checklist

```http
POST /api/staff/tasks/{task-id}/complete
Authorization: Bearer ANITA_TOKEN
{
  "completedAt": "2026-05-05T06:45:00+05:30",
  "photoUrl": "https://storage.supabase.co/kitchen-checklist-6am.jpg",
  "notes": "Walk-in temp: 3°C, all good"
}
→ 200 { status: "COMPLETED" }
```

---

### 8:00 AM — Supplier Delivery

#### Receive Goods Against PO

```http
POST /api/inventory/purchase-orders/{po-id}/receive
Authorization: Bearer RAVI_TOKEN
{
  "receivedAt": "2026-05-05T08:00:00+05:30",
  "items": [
    { "itemId": "tomatoes-id",       "quantityReceived": 25.0, "batchNumber": "TOM-20260505", "expiryDate": "2026-05-09" },
    { "itemId": "chicken-breast-id", "quantityReceived": 20.0, "batchNumber": "CHK-20260505", "expiryDate": "2026-05-07" }
  ],
  "invoiceNumber": "SUP-INV-1042",
  "invoiceAmount": 4800.00
}
→ 200 { receiptId, matchStatus: "MATCHED", stockUpdated: true }
```

Verify stock updated:
```sql
SELECT current_stock FROM inventory_items 
WHERE id = 'chicken-breast-id' AND tenant_id = $tenantId;
-- Expect: 12.0 (morning count) + 20.0 (delivery) = 32.0
```

Verify FEFO batch recorded:
```sql
SELECT batch_number, expiry_date, quantity 
FROM inventory_batches 
WHERE item_id = 'chicken-breast-id' 
ORDER BY expiry_date ASC;
-- Expect: CHK-20260505 expiring 2026-05-07 is first (earliest)
```

---

### 10:00 AM — Kitchen Prep

#### Kitchen Transfer (KOT System)

```http
POST /api/inventory/transfers
Authorization: Bearer ANITA_TOKEN
{
  "kotReference": "KOT-0501-001",
  "fromLocation": "DRY_STORE",
  "toLocation": "KITCHEN",
  "items": [
    { "itemId": "urad-dal-id",  "quantity": 5.0 },
    { "itemId": "idli-rice-id", "quantity": 8.0 }
  ]
}
→ 201 { transferId, kotReference: "KOT-0501-001" }
```

Verify stock deducted from store, KOT linkage recorded:
```sql
SELECT t.kot_reference, ti.item_id, ti.quantity
FROM inventory_transfers t
JOIN inventory_transfer_items ti ON ti.transfer_id = t.id
WHERE t.kot_reference = 'KOT-0501-001';
-- Expect: 2 rows with correct quantities
```

#### Voice Waste Log

```http
POST /api/ai/voice/process
Authorization: Bearer ANITA_TOKEN
Content-Type: multipart/form-data
audio: [recording: "Two kg urad dal spoiled, found mold"]

→ 202 { jobId: "voice-job-id" }
```

Poll until COMPLETED:
```http
GET /api/ai/jobs/voice-job-id
→ 200 {
  "status": "COMPLETED",
  "result": {
    "action": "WASTE_LOG",
    "items": [{ "name": "Urad Dal", "quantity": 2.0, "unit": "kg", "reason": "SPOILAGE" }],
    "confirmationRequired": true
  }
}
```

User confirms:
```http
POST /api/ai/voice/confirm
{ "jobId": "voice-job-id", "approved": true }
→ 200 { wasteLogId: "wl-001" }
```

Verify chain reaction:
```sql
-- 1. Waste log created
SELECT id, quantity, reason FROM waste_logs WHERE id = 'wl-001';
-- Expect: quantity = 2.0, reason = 'SPOILAGE'

-- 2. Inventory deducted
SELECT current_stock FROM inventory_items WHERE name = 'Urad Dal' AND tenant_id = $tenantId;
-- Expect: 48.5 - 2.0 (waste) - 5.0 (kitchen transfer) = 41.5

-- 3. Audit log entry
SELECT action, payload FROM audit_logs WHERE resource_type = 'WASTE_LOG' AND resource_id = 'wl-001';
-- Expect: action = 'WASTE_LOG_CREATED'
```

---

### 12:00 PM — Lunch Service

#### Expense Entry (Mid-Day Vegetable Purchase)

```http
POST /api/finance/expenses
Authorization: Bearer RAVI_TOKEN
{
  "amount": 850.00,
  "category": "COGS",
  "subcategory": "PRODUCE",
  "vendor": "Local Market",
  "description": "Emergency tomatoes - market run",
  "receiptPhotoUrl": "https://storage.supabase.co/receipt-midday.jpg",
  "date": "2026-05-05"
}
→ 201 { expenseId }
```

#### NL Query — Mid-Day Check

```http
POST /api/ai/query
Authorization: Bearer PRIYA_TOKEN
{
  "query": "How much have we spent on vegetables so far today?"
}
→ 200 {
  "answer": "₹850.00 spent on vegetables today (1 expense: Local Market - Emergency tomatoes)",
  "data": { "total": 850.00, "breakdown": [...] },
  "generatedSql": "SELECT ...",
  "fromCache": false
}
```

---

### 6:00 PM — Dinner Service Peak

#### Shift Feedback (After Dinner Rush)

```http
POST /api/staff/shifts/{shift-id}/feedback
Authorization: Bearer ANITA_TOKEN
{
  "rating": 2,
  "issues": ["UNDERSTAFFED", "EQUIPMENT_BROKEN"],
  "notes": "Masala grinder broke at 7pm, delayed orders 30 min",
  "equipmentIssues": ["Masala Grinder #2 - motor failure"]
}
→ 201 { feedbackId }
```

Verify notification chain:
```http
GET /api/notifications?type=EQUIPMENT_ISSUE
Authorization: Bearer RAVI_TOKEN
→ [{ "type": "EQUIPMENT_ISSUE", "message": "Masala Grinder #2 reported as broken by Anita Sharma", "priority": "HIGH" }]
```

```http
GET /api/notifications?type=LOW_RATING_SHIFT
Authorization: Bearer PRIYA_TOKEN
→ [{ "type": "LOW_RATING_SHIFT", "message": "Anita rated tonight's shift 2/5 — review feedback" }]
```

---

### 10:30 PM — End of Day

#### Staff Clock-Out

```http
POST /api/staff/attendance/clock-out
Authorization: Bearer ANITA_TOKEN
{ "shiftId": "morning-shift-id" }
→ 200 { hoursWorked: 10.5, overtimeHours: 2.5, regularPay: 1440.00, overtimePay: 540.00 }
```

#### Daily Sales Reconciliation (DSR)

```http
POST /api/finance/dsr
Authorization: Bearer PRIYA_TOKEN
{
  "date": "2026-05-05",
  "grossRevenue": 52000.00,
  "payments": {
    "cash": 14000.00,
    "upi": 28000.00,
    "card": 10000.00
  },
  "guestCount": 210,
  "tableCount": 32,
  "laborHours": 52,
  "laborCost": 7800.00,
  "operatingExpenses": 850.00
}
→ 201 {
  "dsrId": "dsr-20260505",
  "cashOverShort": 0.00,
  "avgCheckSize": 247.62,
  "tableTurnoverRate": 6.56,
  "splh": 1000.00,
  "laborCostPct": 15.00,
  "primeCost": { "amount": 22350.00, "pct": 43.0 }
}
```

Verify: `52000 / 52 = 1000.00 SPLH ✓`, `210 / 32 = 6.5625 → 6.56 ✓`

#### End-of-Day Notification Digest Queue

```sql
SELECT COUNT(*) FROM scheduled_notifications 
WHERE type = 'DAILY_DIGEST' 
AND tenant_id = $tenantId 
AND scheduled_for::date = '2026-05-06'::date;
-- Expect: 1 (queued for 8am tomorrow)
```

---

### SIT-02 Pass Criteria

- [ ] All 9 services responded with no 500 errors
- [ ] Stock levels reflect morning count + delivery + waste + kitchen transfer
- [ ] FEFO batch ordering correct (earliest expiry first)
- [ ] Voice waste log created waste record AND deducted inventory in one confirmed action
- [ ] Equipment issue notification delivered to manager
- [ ] Audit log has ≥ 12 entries for the day
- [ ] DSR calculations mathematically correct
- [ ] Overtime calculation correct: 2.5 hrs × 1.5 = ₹540.00
- [ ] Daily digest queued for tomorrow morning

---

## SIT-03 — Supplier Delivery with Price Discrepancy

**Narrative:** A delivery arrives at a price 12% higher than the PO. This should trigger a CRITICAL price alert, block automatic acceptance, notify management, and audit the event — all without any manual steps.

**Services:** Inventory → Notification → Audit

### Setup

```http
# PO exists with chicken breast @ ₹220/kg
POST /api/inventory/purchase-orders
{
  "supplierId": "metro-supplier-id",
  "items": [{ "itemId": "chicken-breast-id", "quantity": 25, "unitPrice": 220.00 }]
}
```

### Delivery with 12% Price Increase

```http
POST /api/inventory/purchase-orders/{po-id}/receive
{
  "items": [{ "itemId": "chicken-breast-id", "quantityReceived": 25.0, "unitPriceInvoice": 246.40 }],
  "invoiceNumber": "SUP-INV-1043",
  "invoiceAmount": 6160.00
}
→ 200 {
  "matchStatus": "PRICE_CRITICAL",
  "discrepancies": [{
    "itemId": "chicken-breast-id",
    "poPricePer": 220.00,
    "invoicePricePer": 246.40,
    "variancePct": 12.0,
    "severity": "CRITICAL"
  }],
  "requiresManagerApproval": true,
  "stockUpdated": false
}
```

Verify stock NOT updated (pending approval):
```sql
SELECT current_stock FROM inventory_items WHERE id = 'chicken-breast-id';
-- Expect: 32.0 (from SIT-02) — unchanged
```

Verify notification sent immediately:
```http
GET /api/notifications?type=PRICE_DISCREPANCY_CRITICAL
Authorization: Bearer PRIYA_TOKEN
→ [{
  "type": "PRICE_DISCREPANCY_CRITICAL",
  "message": "Invoice SUP-INV-1043: Chicken Breast 12.0% above PO price (₹246.40 vs ₹220.00)",
  "requiresAction": true
}]
```

Verify audit:
```sql
SELECT action, payload FROM audit_logs 
WHERE action = 'PRICE_DISCREPANCY_FLAGGED' 
AND tenant_id = $tenantId
ORDER BY created_at DESC LIMIT 1;
-- payload.variancePct = 12.0, payload.severity = 'CRITICAL'
```

### Manager Approves/Rejects

```http
POST /api/inventory/receipts/{receipt-id}/approve
Authorization: Bearer RAVI_TOKEN
{ "decision": "APPROVE", "notes": "Metro confirmed price increase due to shortage" }
→ 200 { stockUpdated: true, newUnitCost: 246.40 }
```

Verify:
1. Stock now updated: `32.0 + 25.0 = 57.0`
2. Audit: `RECEIPT_APPROVED` with manager userId
3. Supplier unit cost updated to 246.40 in supplier price history

**Pass criteria:** Stock never updated automatically on CRITICAL discrepancy. Approval gates work. All events audited.

---

## SIT-04 — Recipe Cost Change Ripple

**Narrative:** Chicken breast price goes up. All recipes using it should immediately reflect updated food cost %. If any recipe crosses the 35% food cost threshold, a notification fires.

**Services:** Inventory → Finance → Notification

### Update Supplier Price

```http
PUT /api/inventory/suppliers/{supplier-id}/item-prices
Authorization: Bearer PRIYA_TOKEN
{
  "itemId": "chicken-breast-id",
  "newUnitCost": 280.00,
  "effectiveFrom": "2026-05-06"
}
→ 200
```

### Verify Recipe Auto-Recalculation

```http
GET /api/inventory/recipes/chicken-masala-dosa
→ {
  "name": "Chicken Masala Dosa",
  "menuPrice": 320.00,
  "recipeCost": 118.40,
  "foodCostPct": 37.0,
  "benchmark": "RED",
  "previousFoodCostPct": 29.5,
  "alert": "Food cost increased from 29.5% to 37.0% — above 35% threshold"
}
```

Verify notification:
```http
GET /api/notifications?type=RECIPE_COST_ALERT
Authorization: Bearer PRIYA_TOKEN
→ [{
  "type": "RECIPE_COST_ALERT",
  "message": "Chicken Masala Dosa food cost is now 37.0% (above 35% threshold). Menu price review recommended.",
  "relatedResource": "recipe/chicken-masala-dosa"
}]
```

**Pass criteria:** Recipe recalculates without any manual trigger. Notification fires only when threshold crossed. Recipes below threshold: no notification.

---

## SIT-05 — OCR Notebook Scan → Dual Destination

**Narrative:** Priya photographs her paper notebook. Page contains both a waste log and a vendor cash payment. The AI should route each line item to the correct module, show a combined confirmation UI, and commit both on approval.

**Services:** File → AI → Inventory + Finance → Audit

### Upload Image

```http
POST /api/files/upload
Authorization: Bearer PRIYA_TOKEN
Content-Type: multipart/form-data
file: [notebook-page.jpg]
context: "NOTEBOOK_OCR"
→ 201 { fileId, url }
```

### Submit for OCR

```http
POST /api/ai/ocr
Authorization: Bearer PRIYA_TOKEN
{
  "fileId": "notebook-file-id",
  "context": "INVENTORY_AND_FINANCE"
}
→ 202 { jobId: "ocr-job-001" }
```

### Poll → Confirm

```http
GET /api/ai/jobs/ocr-job-001
→ 200 {
  "status": "COMPLETED",
  "result": {
    "items": [
      {
        "type": "WASTE_LOG",
        "data": { "itemName": "Tomatoes", "quantity": 3.0, "unit": "kg", "reason": "SPOILAGE" },
        "confidence": 0.91
      },
      {
        "type": "EXPENSE",
        "data": { "description": "Raj paid - 500", "vendor": "Raj", "amount": 500.00, "category": "COGS" },
        "confidence": 0.87
      }
    ]
  }
}
```

### Partial Confirm (Accept OCR, Edit Expense Vendor)

```http
POST /api/ai/ocr/confirm
Authorization: Bearer PRIYA_TOKEN
{
  "jobId": "ocr-job-001",
  "items": [
    { "index": 0, "approved": true },
    { "index": 1, "approved": true, "override": { "vendor": "Raj Suppliers", "amount": 500.00 } }
  ]
}
→ 200 {
  "created": [
    { "type": "WASTE_LOG",  "id": "wl-ocr-001" },
    { "type": "EXPENSE",    "id": "exp-ocr-001" }
  ]
}
```

Verify both resources created:
```sql
SELECT id, quantity, reason FROM waste_logs WHERE id = 'wl-ocr-001';
SELECT id, amount, vendor FROM expenses WHERE id = 'exp-ocr-001';
```

Verify audit has OCR as source:
```sql
SELECT action, payload FROM audit_logs 
WHERE resource_id IN ('wl-ocr-001', 'exp-ocr-001');
-- payload.source = 'OCR', payload.jobId = 'ocr-job-001'
```

**Pass criteria:** Two different service resources created from one OCR job. Neither written without user confirmation. Audit records OCR as source.

---

## SIT-06 — Staff No-Show → Task Reassignment

**Narrative:** Anita doesn't clock in within the grace period. The system fires a no-show alert to Ravi, who reassigns her tasks to another staff member. The full chain is auditable.

**Services:** Staff → Notification → Audit

### No-Show Detection

Anita's shift starts at 10:00 AM. At 10:16 (grace period = 15 min + 1 min), the system should auto-detect no-show.

Simulate time-based trigger:
```http
# Manual trigger for testing (or wait 16 minutes in real run)
POST /api/staff/attendance/check-no-shows
Authorization: Bearer SYSTEM (internal call)
→ 200 { flagged: ["anita-id"] }
```

Verify notification sent to manager:
```http
GET /api/notifications?type=EMPLOYEE_NO_SHOW
Authorization: Bearer RAVI_TOKEN
→ [{
  "type": "EMPLOYEE_NO_SHOW",
  "message": "Anita Sharma has not clocked in (shift started 10:00 AM, now 10:16 AM)",
  "urgency": "HIGH",
  "shiftId": "anita-morning-shift"
}]
```

### Manager Reassigns Tasks

```http
GET /api/staff/tasks?assignedTo=anita-id&date=today&status=PENDING
Authorization: Bearer RAVI_TOKEN
→ [{ taskId: "task-veg-prep", name: "Vegetable Prep", dueBy: "11:00" }]

PATCH /api/staff/tasks/task-veg-prep
Authorization: Bearer RAVI_TOKEN
{
  "assignedTo": "chef-ram-id",
  "reassignReason": "Anita no-show"
}
→ 200 { taskId, previousAssignee: "anita-id", newAssignee: "chef-ram-id" }
```

Verify audit:
```sql
SELECT action, old_value->>'assignedTo', new_value->>'assignedTo'
FROM audit_logs WHERE resource_id = 'task-veg-prep' AND action = 'TASK_REASSIGNED';
-- old_value.assignedTo = 'anita-id', new_value.assignedTo = 'chef-ram-id'
```

Anita clocks in late (35 min after start):
```http
POST /api/staff/attendance/clock-in
Authorization: Bearer ANITA_TOKEN
{ "shiftId": "anita-morning-shift", "clockInMethod": "GEOFENCE" }
→ 200 { status: "LATE", lateMinutes: 35 }
```

**Pass criteria:** No-show alert fired at exactly grace+1 min. Task reassignment audited with old/new assignee. Late clock-in records lateMinutes = 35.

---

## SIT-07 — Month-End Close

**Narrative:** End of April. Priya generates the P&L, reviews it against industry benchmarks, exports a PDF, and the system queues a weekly summary notification.

**Services:** Finance → Report → Notification

### Generate April P&L

```http
GET /api/finance/pnl?year=2026&month=4
Authorization: Bearer PRIYA_TOKEN
→ 200 {
  "period": "April 2026",
  "revenue": 1560000.00,
  "cogs": 514800.00,
  "laborCost": 234000.00,
  "grossProfit": 1045200.00,
  "grossMarginPct": 67.0,
  "primeCost": 748800.00,
  "primeCostPct": 48.0,
  "netProfit": 187200.00,
  "netMarginPct": 12.0,
  "benchmarks": {
    "primeCost":   { "value": 48.0, "status": "GREEN", "benchmark": "55-65%" },
    "foodCost":    { "value": 33.0, "status": "GREEN", "benchmark": "28-35%" },
    "laborCost":   { "value": 15.0, "status": "GREEN", "benchmark": "25-35%" },
    "netMargin":   { "value": 12.0, "status": "GREEN", "benchmark": "3-9%" }
  }
}
```

### Export PDF Report

```http
POST /api/reports/generate
Authorization: Bearer PRIYA_TOKEN
{
  "type": "MONTHLY_PNL",
  "period": { "year": 2026, "month": 4 },
  "format": "PDF"
}
→ 202 { jobId: "report-job-april" }

GET /api/reports/report-job-april
→ 200 { status: "COMPLETED", downloadUrl: "https://storage.../april-pnl.pdf" }
```

Verify report file exists in storage:
```sql
SELECT id, file_url, generated_at FROM report_jobs WHERE id = 'report-job-april';
-- status = COMPLETED, file_url non-null
```

Audit: data export logged:
```sql
SELECT action, payload FROM audit_logs 
WHERE action = 'REPORT_EXPORTED' AND payload->>'reportType' = 'MONTHLY_PNL';
-- 1 row with userId = priya-id
```

**Pass criteria:** P&L figures consistent with DSR entries from the month. Benchmarks calculated correctly. PDF export generates a downloadable file. Export recorded in audit.

---

## SIT-08 — Multi-Tenant Isolation Under Concurrent Load

**Narrative:** Two restaurants run the same operations at the same time. Neither can see the other's data — verified at API and database level simultaneously.

**Services:** All (Auth, Inventory, Finance focus)

### Setup Second Tenant

```http
POST /api/auth/register
{
  "restaurantName": "Biryani House",
  "ownerEmail": "owner@biryanihouse.com",
  "password": "BiryaniBoss@789",
  "currency": "INR"
}
→ 201 { tenantId: "biryani-tenant-id", accessToken: BIRYANI_TOKEN }
```

### Concurrent Operations

Run these two blocks **simultaneously** (parallel HTTP clients):

**Dosa Palace side:**
```http
POST /api/inventory/items
Authorization: Bearer PRIYA_TOKEN
{ "name": "Secret Recipe Dal", "currentStock": 100 }
→ 201 { itemId: "secret-dal-id" }
```

**Biryani House side:**
```http
POST /api/inventory/items
Authorization: Bearer BIRYANI_TOKEN
{ "name": "Biryani Masala", "currentStock": 50 }
→ 201 { itemId: "biryani-masala-id" }
```

### Cross-Tenant Query Attempts

```http
# Biryani House token tries to access Dosa Palace item
GET /api/inventory/items/secret-dal-id
Authorization: Bearer BIRYANI_TOKEN
→ 404 { error: "Item not found" }
# Must be 404, not 403 — existence must not be revealed
```

```http
# Dosa Palace tries to list all items — must not see Biryani items
GET /api/inventory/items?limit=100
Authorization: Bearer PRIYA_TOKEN
→ 200 { items: [...] }
# Verify "Biryani Masala" is NOT in this list
```

### Database-Level Isolation

```sql
-- As superuser, verify RLS:
SET app.current_tenant_id = 'biryani-tenant-id';
SELECT id, name FROM inventory_items WHERE name = 'Secret Recipe Dal';
-- Expect: 0 rows (RLS blocks cross-tenant)

SET app.current_tenant_id = 'dosa-palace-tenant-id';
SELECT id, name FROM inventory_items WHERE name = 'Biryani Masala';
-- Expect: 0 rows
```

### Token Cross-Use

```http
# Biryani token trying to post DSR to Dosa Palace's tenant endpoint
POST /api/finance/dsr
Authorization: Bearer BIRYANI_TOKEN
X-Tenant-Id: dosa-palace-tenant-id   ← attacker-injected header
{
  "date": "2026-05-05",
  "grossRevenue": 99999.00
}
→ 403 { error: "Tenant header mismatch" }
```

Verify: no DSR created for either tenant:
```sql
SELECT COUNT(*) FROM daily_sales_reports 
WHERE gross_revenue = 99999.00 AND tenant_id IN ('dosa-palace-id', 'biryani-id');
-- Expect: 0
```

**Pass criteria:** 404 (not 403) for cross-tenant resource. RLS blocks DB-level access. Injected X-Tenant-Id header rejected with 403. No data leak in any direction.

---

## SIT-09 — Offline Mobile Sync

**Narrative:** Anita uses the mobile app in the walk-in cooler (no signal). She logs waste and completes a count. When connectivity returns, mutations sync to the server. Simultaneously, the web dashboard was updated — conflicts must be handled correctly.

**Services:** Inventory, Staff (sync endpoint)

### Offline Queue (Mobile Client Simulated)

Anita's device queues these operations locally:
```json
[
  {
    "operationId": "offline-op-001",
    "type": "WASTE_LOG",
    "timestamp": "2026-05-05T09:30:00+05:30",
    "data": { "itemId": "spinach-id", "quantity": 1.5, "reason": "SPOILAGE" }
  },
  {
    "operationId": "offline-op-002",
    "type": "STOCK_COUNT",
    "timestamp": "2026-05-05T09:35:00+05:30",
    "data": { "itemId": "spinach-id", "counted": 8.0 }
  }
]
```

### Connectivity Restored — Sync Batch

```http
POST /api/sync/batch
Authorization: Bearer ANITA_TOKEN
{
  "operations": [
    {
      "operationId": "offline-op-001",
      "type": "WASTE_LOG",
      "timestamp": "2026-05-05T09:30:00+05:30",
      "data": { "itemId": "spinach-id", "quantity": 1.5, "reason": "SPOILAGE" }
    },
    {
      "operationId": "offline-op-002",
      "type": "STOCK_COUNT",
      "timestamp": "2026-05-05T09:35:00+05:30",
      "data": { "itemId": "spinach-id", "counted": 8.0 }
    }
  ]
}
→ 200 {
  "results": [
    { "operationId": "offline-op-001", "status": "APPLIED",  "resourceId": "wl-sync-001" },
    { "operationId": "offline-op-002", "status": "APPLIED",  "resourceId": "count-sync-001" }
  ],
  "conflicts": []
}
```

Verify waste deducted using offline timestamp (not server receipt time):
```sql
SELECT occurred_at FROM waste_logs WHERE id = 'wl-sync-001';
-- Expect: 2026-05-05T04:00:00Z (09:30 IST = 04:00 UTC)
```

### Conflict Test — Same Item Description Updated on Web While Offline

```http
# While Anita was offline, Ravi updated spinach description on web
PATCH /api/inventory/items/spinach-id
Authorization: Bearer RAVI_TOKEN
{ "description": "Baby Spinach - Organic" }
→ 200 { version: 3 }

# Anita's offline queue also has description update
POST /api/sync/batch
{
  "operations": [{
    "operationId": "offline-op-003",
    "type": "ITEM_UPDATE",
    "timestamp": "2026-05-05T09:20:00+05:30",  ← EARLIER than Ravi's update
    "data": { "itemId": "spinach-id", "description": "Spinach leaves" }
  }]
}
→ 200 {
  "results": [{
    "operationId": "offline-op-003",
    "status": "CONFLICT",
    "conflictType": "LAST_WRITE_WINS",
    "winner": "SERVER",
    "serverValue": "Baby Spinach - Organic",
    "offlineValue": "Spinach leaves",
    "requiresReview": false
  }]
}
```

### Additive Operations (Must Never Conflict)

Two simultaneous waste logs for the same item — both must apply:
```http
# Device A logs +2.0 kg waste
# Device B logs +1.0 kg waste (simultaneously)
# Both sync when back online

POST /api/sync/batch (Device A): { type: "WASTE_LOG", quantity: 2.0 }
POST /api/sync/batch (Device B): { type: "WASTE_LOG", quantity: 1.0 }
```

Verify both applied:
```sql
SELECT SUM(quantity) FROM waste_logs 
WHERE item_id = 'spinach-id' AND DATE(occurred_at) = '2026-05-05';
-- Expect: sum includes 1.5 + 2.0 + 1.0 = 4.5 from today's waste
```

**Pass criteria:** Offline timestamps preserved. Additive operations both applied. Description conflict resolves as last-write-wins. No data loss.

---

## SIT-10 — Full Purchase-to-Plate Traceability

**Narrative:** A chicken biryani leaves the kitchen. Every gram of chicken can be traced back to the supplier invoice, PO, and delivery batch. This is KitchenLedger's core differentiator.

**Services:** Inventory, Finance, Staff, AI

### Chain to Build

```
Metro Suppliers → PO-2026-042 → Receipt REC-042 → Batch CHK-20260505
  → Transfer KOT-0502-001 (Kitchen) → Plated: 0.35 kg chicken biryani (Table 7)
```

### Build the Chain

All steps assumed completed from SIT-02 and SIT-03. Add the final plating event:

```http
POST /api/inventory/plating-events
Authorization: Bearer ANITA_TOKEN
{
  "kotReference": "KOT-0502-001",
  "menuItem": "Chicken Biryani",
  "portionsPlated": 3,
  "itemsUsed": [
    { "itemId": "chicken-breast-id", "quantity": 1.05, "batchId": "CHK-20260505" }
  ]
}
→ 201 { platingEventId }
```

### Query Full Chain

```http
GET /api/inventory/traceability?itemId=chicken-breast-id&batchId=CHK-20260505
Authorization: Bearer PRIYA_TOKEN
→ 200 {
  "item": "Chicken Breast",
  "batch": "CHK-20260505",
  "chain": [
    {
      "stage": "PURCHASE",
      "reference": "PO-2026-042",
      "timestamp": "2026-05-04",
      "supplier": "Metro Suppliers",
      "quantity": 25.0,
      "unitCost": 246.40
    },
    {
      "stage": "RECEIVED",
      "reference": "REC-042",
      "timestamp": "2026-05-05T08:00:00+05:30",
      "receivedBy": "Ravi Kumar",
      "quantityReceived": 25.0,
      "invoiceNumber": "SUP-INV-1043"
    },
    {
      "stage": "KITCHEN",
      "reference": "KOT-0502-001",
      "timestamp": "2026-05-05T10:00:00+05:30",
      "transferredBy": "Anita Sharma",
      "quantity": 3.0,
      "fromLocation": "DRY_STORE",
      "toLocation": "KITCHEN"
    },
    {
      "stage": "PLATE",
      "reference": "KOT-0502-001",
      "timestamp": "2026-05-05T12:30:00+05:30",
      "menuItem": "Chicken Biryani",
      "portionsPlated": 3,
      "quantityUsed": 1.05
    }
  ],
  "summary": {
    "totalPurchased": 25.0,
    "totalReceived": 25.0,
    "totalTransferred": 3.0,
    "totalPlated": 1.05,
    "totalWasted": 0.0,
    "remaining": 23.95
  }
}
```

### Traceability with Waste in Chain

Add a waste event in the middle:
```http
POST /api/inventory/waste-logs
Authorization: Bearer ANITA_TOKEN
{
  "itemId": "chicken-breast-id",
  "batchId": "CHK-20260505",
  "quantity": 0.5,
  "reason": "CONTAMINATION",
  "kotReference": "KOT-0502-001"
}
```

Re-query traceability: waste event must appear between KITCHEN and PLATE stage with `reason: CONTAMINATION`.

**Pass criteria:** Complete chain returned with all 4 stages. Summary arithmetic correct: purchased = received + variance. Waste appears in chain chronologically. Any batch can be traced to specific supplier invoice.

---

## SIT-11 — Critical Alert Cascade

**Narrative:** Three simultaneous critical events: stock hits zero, overtime threshold breached, and a cash discrepancy is flagged. All three must generate the correct notifications to the correct roles without any cross-notification or missing alert.

**Services:** Inventory + Staff + Finance → Notification

### Trigger Simultaneously

```bash
# Run all three in parallel

# 1. Zero-stock trigger
curl -X PATCH http://localhost:8080/api/inventory/items/urad-dal-id \
  -H "Authorization: Bearer PRIYA_TOKEN" \
  -d '{"currentStock": 0}'

# 2. Overtime trigger (log 42 hrs for the week)
curl -X POST http://localhost:8080/api/staff/attendance/overtime-check \
  -H "Authorization: Bearer RAVI_TOKEN" \
  -d '{"employeeId": "anita-id", "weeklyHours": 42}'

# 3. Cash discrepancy — DSR cash mismatch
curl -X POST http://localhost:8080/api/finance/dsr \
  -H "Authorization: Bearer PRIYA_TOKEN" \
  -d '{
    "date": "2026-05-06",
    "grossRevenue": 45000,
    "payments": {"cash": 10000, "upi": 25000, "card": 7000},
    "guestCount": 180, "tableCount": 32, "laborHours": 48, "laborCost": 7000
  }'
# Note: 10000+25000+7000 = 42000 ≠ 45000 → cash short ₹3000
```

### Verify Correct Alert Delivery

```http
GET /api/notifications?userId=priya-id&unread=true
→ Should contain:
  - STOCK_CRITICAL (urad dal = 0 kg)
  - CASH_DISCREPANCY (₹3000 short, requiresExplanation: true)
  - (OVERTIME_ALERT should NOT be here — Priya is not involved in attendance)

GET /api/notifications?userId=ravi-id&unread=true
→ Should contain:
  - STOCK_CRITICAL (managers receive this too)
  - OVERTIME_ALERT (Anita approaching 42 hrs)
  - (CASH_DISCREPANCY goes to owner, not manager — verify not present)

GET /api/notifications?userId=anita-id&unread=true
→ Should contain:
  - OVERTIME_ALERT (her own overtime)
  - (No STOCK_CRITICAL or CASH_DISCREPANCY — kitchen staff don't receive these)
```

Verify notification counts:
```sql
-- Exactly 2 notification records for STOCK_CRITICAL (one per recipient: priya + ravi)
SELECT COUNT(*) FROM notifications WHERE type = 'STOCK_CRITICAL' AND created_at > NOW() - INTERVAL '1 minute';
-- Expect: 2

-- Exactly 1 for CASH_DISCREPANCY (owner only)
SELECT COUNT(*) FROM notifications WHERE type = 'CASH_DISCREPANCY';
-- Expect: 1
```

**Pass criteria:** 3 different alert types deliver to correct roles only. No cross-contamination (manager doesn't get financial alerts, staff doesn't get cash alerts). Counts in DB match expected delivery targets.

---

## SIT-12 — Week-End Payroll + Tip Distribution

**Narrative:** Friday close. Priya runs weekly payroll, distributes tip pool, and verifies every financial figure is auditable.

**Services:** Staff → Finance → Audit → Notification

### Weekly Hours Summary

> **Note:** FLSA overtime calculation (>40h/week → 1.5× rate) is **NOT YET IMPLEMENTED**.  
> The `overtimePay` field may be absent or zero. Verify `regularHours` + `overtimeHours` totals are correct;  
> skip overtime pay math assertions until FLSA logic is added.

```http
GET /api/staff/attendance/weekly-summary?weekOf=2026-05-05
Authorization: Bearer PRIYA_TOKEN
→ {
  "employees": [
    { "id": "anita-id", "name": "Anita", "regularHours": 40, "overtimeHours": 2.5, "totalHours": 42.5 },
    { "id": "ravi-id",  "name": "Ravi",  "regularHours": 45, "overtimeHours": 5,   "totalHours": 50.0  }
  ]
}
```

When FLSA is implemented, verify: `2.5 × ₹180 × 1.5 = ₹540.00`, `5 × ₹300 × 1.5 = ₹2250.00`

### Tip Pool Distribution

```http
POST /api/staff/tips
Authorization: Bearer PRIYA_TOKEN
{
  "date": "2026-05-05",
  "totalTips": 4800.00,
  "distributionModel": "HOURS_WORKED",
  "employees": [
    { "employeeId": "anita-id", "hoursWorked": 10.5 },
    { "employeeId": "ravi-id",  "hoursWorked": 9.0 },
    { "employeeId": "chef-ram-id", "hoursWorked": 10.0 }
  ]
}
→ 201 {
  "tipPoolId": "tip-20260505",
  "distribution": [
    { "employeeId": "anita-id",   "hoursWorked": 10.5, "tipShare": 1680.00 },
    { "employeeId": "ravi-id",    "hoursWorked": 9.0,  "tipShare": 1440.00 },
    { "employeeId": "chef-ram-id","hoursWorked": 10.0, "tipShare": 1600.00 }
  ],
  "totalDistributed": 4720.00,
  "rounding": 80.00
}
```

Verify math: total hours = 29.5, Anita's share = `4800 × 10.5/29.5 = ₹1708.47` (check rounding policy).

Note: rounding difference (₹4800 - ₹4720 = ₹80) should be documented in response and audit log.

Audit:
```sql
SELECT action, payload FROM audit_logs WHERE resource_id = 'tip-20260505';
-- action = 'TIP_POOL_CREATED', payload contains full distribution breakdown
```

**Pass criteria:** Tip shares sum to ≤ totalTips (never exceed). Rounding discrepancy documented. Overtime pay formula correct. All figures in audit log.

---

## Full System Pass / Fail Criteria

All 12 scenarios must pass to declare the system integration green.

### Database Integrity Checks (Run After All Scenarios)

```sql
-- 1. No float monetary values anywhere
SELECT table_name, column_name, data_type 
FROM information_schema.columns 
WHERE data_type IN ('float4','float8','real','double precision')
AND table_schema = 'public';
-- Expect: 0 rows

-- 2. No rows without tenant_id
SELECT 'inventory_items' AS t, COUNT(*) FROM inventory_items WHERE tenant_id IS NULL
UNION ALL
SELECT 'expenses', COUNT(*) FROM expenses WHERE tenant_id IS NULL
UNION ALL
SELECT 'waste_logs', COUNT(*) FROM waste_logs WHERE tenant_id IS NULL
UNION ALL
SELECT 'audit_logs', COUNT(*) FROM audit_logs WHERE tenant_id IS NULL;
-- All counts: 0

-- 3. Soft deletes preserved
SELECT COUNT(*) FROM inventory_items WHERE deleted_at IS NOT NULL;
-- Must be > 0 if any items were soft-deleted during testing

-- 4. Audit log only grows (verify no deletes)
SELECT COUNT(*) FROM audit_logs;
-- Save this count. Run again in 5 minutes. Count must be ≥ previous count.

-- 5. All timestamps timezone-aware
SELECT table_name, column_name FROM information_schema.columns
WHERE data_type = 'timestamp without time zone' AND table_schema = 'public';
-- Expect: 0 rows (all should be TIMESTAMPTZ)

-- 6. Cross-tenant isolation final check
SELECT tenant_id, COUNT(*) as items 
FROM inventory_items GROUP BY tenant_id;
-- Each tenant sees only their own count
```

### Service Health After All Tests

```bash
# All 9 services must still be healthy (no crash-looping from load)
for port in 8080 8081 8082 8083 8084 8085 8086 8087 8088; do
  echo -n "Port $port: "
  curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/health 2>/dev/null || \
  curl -s -o /dev/null -w "%{http_code}" http://localhost:$port/actuator/health
  echo
done
```

### RabbitMQ Queue Drain Check

```bash
# No messages stuck in queues after all tests complete
curl -s -u guest:guest http://localhost:15672/api/queues | \
  jq '.[] | select(.messages > 0) | {name, messages}'
# Expect: empty output (all messages consumed)
```

---

## Execution Order

Run in this order — each scenario's data is used by the next:

```
SIT-01 (Onboarding) → SIT-02 (Full Day) → SIT-03 (Price Discrepancy) 
→ SIT-04 (Recipe Ripple) → SIT-05 (OCR) → SIT-06 (No-Show) 
→ SIT-07 (Month-End) → SIT-08 (Multi-Tenant) → SIT-09 (Offline Sync) 
→ SIT-10 (Traceability) → SIT-11 (Alert Cascade) → SIT-12 (Payroll)
→ Final DB Integrity Checks
```

**Total estimated execution time: 4–5 hours for a single engineer running all steps manually.**

---

## What to Do When a Scenario Fails

1. **Note the exact HTTP response and status code**
2. **Check service logs:** `docker logs kitchenledger-{service} --tail 100`
3. **Check RabbitMQ dead-letter queue:** `curl -u guest:guest http://localhost:15672/api/queues/%2F/dlx.dead-letter`
4. **Run the SQL verification query for that step** — often the DB state reveals the root cause
5. **File a bug report** with: scenario ID, step number, request sent, response received, DB state
6. **Do not skip to the next scenario** if it depends on data from the failed one — fix or reset first
