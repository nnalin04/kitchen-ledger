# KitchenLedger — End-to-End Test Plan
## Complete Product Validation: PRD → Implementation

> **Purpose:** This document validates every feature described in the KitchenLedger PRD Enhanced against the live system — UI, API, and database — epic by epic. It is the definitive go/no-go reference before any production release.
>
> **How to read this:** Each section maps directly to a PRD epic. Every test case includes: the business requirement it validates, a sample HTTP request (or UI action), the expected response, and the database state to verify.
>
> **Base URL:** `http://localhost:8080` (API Gateway)  
> **Auth header convention:** `Authorization: Bearer <JWT>` obtained from login  
> **Internal secret:** `X-Internal-Secret: <INTERNAL_SERVICE_SECRET>`  
> **Tenant isolation:** Every test uses `X-Tenant-Id` injected by Gateway; never test cross-tenant leakage manually

---

## Table of Contents

1. [Test Environment Setup](#1-test-environment-setup)
2. [Epic 1 — Authentication & Multi-Tenancy](#2-epic-1--authentication--multi-tenancy)
3. [Epic 2 — Inventory Management](#3-epic-2--inventory-management)
4. [Epic 3 — Finance & Accounts](#4-epic-3--finance--accounts)
5. [Epic 4 — Staff & HR](#5-epic-4--staff--hr)
6. [Epic 5 — AI Features](#6-epic-5--ai-features)
7. [Epic 6 — Cross-Cutting: Notifications & Audit Logs](#7-epic-6--cross-cutting-notifications--audit-logs)
8. [Epic 7 — Complete Purchase-to-Plate Traceability Flow](#8-epic-7--complete-purchase-to-plate-traceability-flow)
9. [Mobile API Parity Tests](#9-mobile-api-parity-tests)
10. [Multi-Tenant Isolation Tests](#10-multi-tenant-isolation-tests)
11. [Non-Functional Tests](#11-non-functional-tests)
12. [Test Execution Checklist](#12-test-execution-checklist)

---

## 1. Test Environment Setup

### 1.1 Stack Prerequisites

```bash
# Start infrastructure
npm run infra:up

# Verify all services are healthy
curl http://localhost:8080/health
curl http://localhost:8081/actuator/health
curl http://localhost:8082/actuator/health
curl http://localhost:8083/actuator/health
curl http://localhost:8084/health
curl http://localhost:8085/health
curl http://localhost:8086/health
curl http://localhost:8087/health
curl http://localhost:8088/actuator/health
```

**Expected:** Every service returns `{"status": "UP"}` or `{"status": "ok"}`.

### 1.2 Seed Data Personas

We use three personas throughout all tests. Create them once in Section 2.

| Persona | Role | Email | Password | Purpose |
|---|---|---|---|---|
| **Priya** | Owner | priya@dosapalace.com | TestPass@123 | Full access tests |
| **Ravi** | Manager | ravi@dosapalace.com | TestPass@123 | Operational access tests |
| **Anita** | Kitchen Staff | anita@dosapalace.com | TestPass@123 | Limited access tests |

**Restaurant:** Dosa Palace, Bangalore, India, currency INR, timezone Asia/Kolkata

### 1.3 Variables Used Throughout

```
OWNER_TOKEN     = JWT for Priya (Owner)
MANAGER_TOKEN   = JWT for Ravi (Manager)
STAFF_TOKEN     = JWT for Anita (Kitchen Staff)
TENANT_ID       = UUID of Dosa Palace tenant
ITEM_ID_TOMATO  = UUID of Tomato inventory item
ITEM_ID_CHICKEN = UUID of Chicken Breast inventory item
SUPPLIER_ID     = UUID of Metro Cash & Carry supplier
PO_ID           = UUID of a purchase order
RECIPE_ID       = UUID of Masala Dosa recipe
EXPENSE_ID      = UUID of a logged expense
DSR_ID          = UUID of a daily sales report
EMPLOYEE_ID_RAVI  = UUID of Ravi's employee record
EMPLOYEE_ID_ANITA = UUID of Anita's employee record
SHIFT_ID        = UUID of a created shift
TASK_ID         = UUID of a created task
```

---

## 2. Epic 1 — Authentication & Multi-Tenancy

**PRD Reference:** Section 2 (User Roles & Access Model), Section 5.4 (Multi-Tenant Architecture)  
**Services Involved:** Gateway (:8080), Auth Service (:8081)

---

### TC-AUTH-01: Tenant Registration (New Restaurant Onboarding)

**PRD Requirement:** Owners must be able to register their restaurant and receive a tenant-isolated account.

**UI Check:** Navigate to `http://localhost:3000/register`. Fill in restaurant details. Verify redirect to dashboard after success.

**API Request:**
```http
POST /api/auth/register
Content-Type: application/json

{
  "restaurantName": "Dosa Palace",
  "ownerName": "Priya Sharma",
  "email": "priya@dosapalace.com",
  "password": "TestPass@123",
  "phone": "+91-9876543210",
  "region": "IN",
  "timezone": "Asia/Kolkata",
  "currency": "INR",
  "restaurantType": "full-service"
}
```

**Expected Response:** `HTTP 201`
```json
{
  "tenantId": "<uuid>",
  "userId": "<uuid>",
  "accessToken": "<jwt>",
  "refreshToken": "<uuid>",
  "expiresIn": 3600,
  "restaurant": {
    "name": "Dosa Palace",
    "region": "IN",
    "currency": "INR"
  }
}
```

**Database Verification:**
```sql
SELECT id, restaurant_name, region, currency, subscription_tier 
FROM tenants 
WHERE restaurant_name = 'Dosa Palace';
-- Expect: 1 row, subscription_tier = 'starter'

SELECT id, email, role, tenant_id 
FROM users 
WHERE email = 'priya@dosapalace.com';
-- Expect: 1 row, role = 'OWNER'

SELECT enabled FROM pg_policies 
WHERE tablename IN ('inventory_items','expenses','employees');
-- Expect: RLS enabled on all tenant tables
```

**Save for subsequent tests:** `TENANT_ID`, `OWNER_TOKEN`

---

### TC-AUTH-02: Owner Login

**API Request:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "priya@dosapalace.com",
  "password": "TestPass@123"
}
```

**Expected Response:** `HTTP 200`
```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<uuid>",
  "expiresIn": 3600,
  "user": {
    "id": "<uuid>",
    "email": "priya@dosapalace.com",
    "role": "OWNER",
    "tenantId": "<TENANT_ID>"
  }
}
```

**JWT Validation:** Decode the JWT and verify:
- `sub` = userId
- `tenantId` = TENANT_ID
- `role` = "OWNER"
- `exp` > current timestamp

---

### TC-AUTH-03: Invite Manager (RBAC Role Assignment)

**API Request:**
```http
POST /api/auth/users/invite
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "email": "ravi@dosapalace.com",
  "role": "MANAGER",
  "name": "Ravi Kumar"
}
```

**Expected Response:** `HTTP 201`
```json
{
  "userId": "<uuid>",
  "email": "ravi@dosapalace.com",
  "role": "MANAGER",
  "inviteStatus": "SENT"
}
```

**Repeat for Kitchen Staff:**
```http
POST /api/auth/users/invite
Authorization: Bearer <OWNER_TOKEN>

{
  "email": "anita@dosapalace.com",
  "role": "KITCHEN_STAFF",
  "name": "Anita Patel"
}
```

---

### TC-AUTH-04: RBAC Enforcement — Kitchen Staff Cannot Access Financials

**API Request (should fail):**
```http
GET /api/finance/reports/pnl?period=monthly
Authorization: Bearer <STAFF_TOKEN>
```

**Expected Response:** `HTTP 403`
```json
{
  "error": "FORBIDDEN",
  "message": "Insufficient permissions for this resource"
}
```

**Verify error does NOT contain:** stack traces, service names, DB schema details.

---

### TC-AUTH-05: Token Refresh

**API Request:**
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<refresh_token_from_login>"
}
```

**Expected Response:** `HTTP 200` with new `accessToken` and `refreshToken`.

**Database Verification:**
```sql
SELECT token, expires_at, revoked_at 
FROM refresh_tokens 
WHERE user_id = '<userId>';
-- Old token should now have revoked_at set (rotation)
-- New token should exist with future expires_at
```

---

### TC-AUTH-06: Multi-Tenant Isolation — Cannot Access Other Tenant's Data

```http
GET /api/inventory/items
Authorization: Bearer <OWNER_TOKEN>
X-Tenant-Id: <SOME_OTHER_TENANT_ID>  (attempted override)
```

**Expected Response:** `HTTP 403` or the response returns ONLY Dosa Palace items (Gateway enforces tenant from JWT, not from header override).

---

## 3. Epic 2 — Inventory Management

**PRD Reference:** Section 3.1  
**Services Involved:** Gateway (:8080), Inventory Service (:8082), Notification Service (:8086)

---

### TC-INV-01: Create Inventory Item with ABC Classification

**PRD Requirement:** Items auto-classified A/B/C by cost contribution; system stores purchase/recipe/count units with conversion.

**UI Check:** Navigate to `/inventory/items/new`. Fill in all fields. Verify ABC badge auto-displays based on cost.

**API Request:**
```http
POST /api/inventory/items
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "name": "Chicken Breast",
  "category": "Proteins",
  "subcategory": "Poultry",
  "abcCategory": "A",
  "purchaseUnit": "kg",
  "recipeUnit": "grams",
  "countUnit": "kg",
  "conversionFactors": {
    "purchaseToRecipe": 1000,
    "purchaseToCount": 1
  },
  "parLevel": 10,
  "currentStock": 25,
  "avgCost": 320.00,
  "lastPurchasePrice": 315.00,
  "storageLocation": "WALK_IN_FRIDGE",
  "shelfLifeDays": 3,
  "isPerishable": true,
  "barcode": "8901234567890",
  "supplierIds": ["<SUPPLIER_ID>"]
}
```

**Expected Response:** `HTTP 201`
```json
{
  "id": "<uuid>",
  "name": "Chicken Breast",
  "abcCategory": "A",
  "parLevel": 10,
  "currentStock": 25,
  "storageLocation": "WALK_IN_FRIDGE",
  "tenantId": "<TENANT_ID>"
}
```

**Save:** `ITEM_ID_CHICKEN`

**Create a C-item (Tomato) for contrast:**
```http
POST /api/inventory/items

{
  "name": "Tomato",
  "category": "Produce",
  "abcCategory": "C",
  "purchaseUnit": "kg",
  "recipeUnit": "grams",
  "countUnit": "kg",
  "conversionFactors": { "purchaseToRecipe": 1000, "purchaseToCount": 1 },
  "parLevel": 5,
  "currentStock": 12,
  "avgCost": 40.00,
  "storageLocation": "DRY_STORAGE",
  "isPerishable": true,
  "shelfLifeDays": 7
}
```

**Save:** `ITEM_ID_TOMATO`

**Database Verification:**
```sql
SELECT name, abc_category, par_level, current_stock, tenant_id 
FROM inventory_items 
WHERE name IN ('Chicken Breast', 'Tomato') 
  AND tenant_id = '<TENANT_ID>';
-- Both rows must have correct tenant_id (RLS check)
```

---

### TC-INV-02: Supplier Catalog Creation

**PRD Requirement:** System maintains supplier catalog with negotiated pricing, delivery schedule, lead times.

**API Request:**
```http
POST /api/inventory/suppliers
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "name": "Metro Cash & Carry",
  "contactName": "Deepak Singh",
  "email": "deepak@metro.com",
  "phone": "+91-8012345678",
  "whatsapp": "+91-8012345678",
  "deliverySchedule": ["MONDAY", "THURSDAY"],
  "paymentTerms": "NET_30",
  "leadTimeDays": 2,
  "negotiatedPrices": {
    "<ITEM_ID_CHICKEN>": 315.00,
    "<ITEM_ID_TOMATO>": 38.00
  }
}
```

**Expected Response:** `HTTP 201` with `id` field. **Save:** `SUPPLIER_ID`

---

### TC-INV-03: PAR Level Alert — Low Stock Notification

**PRD Requirement (US-INV-3):** Alert when item drops below reorder point; one-tap generate PO.

**Setup:** Update Chicken Breast stock to below PAR:
```http
PATCH /api/inventory/items/<ITEM_ID_CHICKEN>
Authorization: Bearer <OWNER_TOKEN>

{
  "currentStock": 8
}
```

**Expected Behavior:**
- `HTTP 200` on update
- RabbitMQ publishes `inventory.stock.low` event
- Notification Service receives event and creates a push notification

**Verify notification was created:**
```http
GET /api/notifications?type=STOCK_LOW
Authorization: Bearer <OWNER_TOKEN>
```

**Expected Response:**
```json
{
  "notifications": [
    {
      "type": "STOCK_LOW",
      "priority": "CRITICAL",
      "message": "Chicken Breast is below PAR level (8 kg, PAR: 10 kg)",
      "read": false
    }
  ]
}
```

**Database Verification:**
```sql
SELECT current_stock, par_level 
FROM inventory_items 
WHERE id = '<ITEM_ID_CHICKEN>' AND tenant_id = '<TENANT_ID>';
-- current_stock = 8, par_level = 10

SELECT type, message, read_at 
FROM notifications 
WHERE tenant_id = '<TENANT_ID>' AND type = 'STOCK_LOW';
-- Should have 1 unread notification
```

---

### TC-INV-04: Purchase Order Creation and Auto-Generation

**PRD Requirement:** PAR auto-reorder; PO grouped by supplier; owner reviews/adjusts before sending.

**API Request:**
```http
POST /api/inventory/purchase-orders
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "supplierId": "<SUPPLIER_ID>",
  "orderDate": "2026-05-04",
  "expectedDeliveryDate": "2026-05-06",
  "items": [
    {
      "itemId": "<ITEM_ID_CHICKEN>",
      "orderedQuantity": 20,
      "unit": "kg",
      "unitPrice": 315.00
    },
    {
      "itemId": "<ITEM_ID_TOMATO>",
      "orderedQuantity": 10,
      "unit": "kg",
      "unitPrice": 38.00
    }
  ],
  "notes": "Urgent order — weekend prep"
}
```

**Expected Response:** `HTTP 201`
```json
{
  "id": "<uuid>",
  "supplierId": "<SUPPLIER_ID>",
  "status": "DRAFT",
  "totalAmount": 6680.00,
  "threeWayMatchStatus": "PENDING",
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "orderedQuantity": 20, "unitPrice": 315.00, "lineTotal": 6300.00 },
    { "itemId": "<ITEM_ID_TOMATO>", "orderedQuantity": 10, "unitPrice": 38.00, "lineTotal": 380.00 }
  ]
}
```

**Save:** `PO_ID`

**Send PO:**
```http
POST /api/inventory/purchase-orders/<PO_ID>/send
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** Status changes to `SENT`. Notification sent to supplier via WhatsApp/email.

---

### TC-INV-05: Three-Way Match PO Receiving Workflow

**PRD Requirement:** Verify physical goods = PO = invoice; flag discrepancies; price changes >10% trigger alert.

**Step 1: Record delivery (goods received):**
```http
POST /api/inventory/purchase-orders/<PO_ID>/receive
Authorization: Bearer <MANAGER_TOKEN>
Content-Type: application/json

{
  "receivedDate": "2026-05-06",
  "items": [
    {
      "itemId": "<ITEM_ID_CHICKEN>",
      "receivedQuantity": 18,
      "unit": "kg",
      "condition": "GOOD",
      "expiryDate": "2026-05-09"
    },
    {
      "itemId": "<ITEM_ID_TOMATO>",
      "receivedQuantity": 10,
      "unit": "kg",
      "condition": "GOOD",
      "expiryDate": "2026-05-11"
    }
  ],
  "notes": "2 kg chicken short — driver confirmed shortage"
}
```

**Expected:** Chicken shortfall (ordered 20, received 18) is flagged in `threeWayMatchStatus`.

**Step 2: Record invoice (finance match):**
```http
POST /api/inventory/purchase-orders/<PO_ID>/invoice
Authorization: Bearer <MANAGER_TOKEN>
Content-Type: application/json

{
  "invoiceNumber": "METRO-2026-4521",
  "invoiceDate": "2026-05-06",
  "invoiceTotal": 6440.00,
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "invoicedQuantity": 18, "invoicePrice": 350.00 },
    { "itemId": "<ITEM_ID_TOMATO>", "invoicedQuantity": 10, "invoicePrice": 38.00 }
  ]
}
```

**Expected:** Chicken price changed from ₹315 to ₹350 (10.9% increase). Three-way match MUST flag this.

**Expected Response:**
```json
{
  "threeWayMatchStatus": "DISCREPANCY",
  "discrepancies": [
    {
      "itemId": "<ITEM_ID_CHICKEN>",
      "type": "PRICE_CHANGE",
      "orderedPrice": 315.00,
      "invoicePrice": 350.00,
      "changePercent": 11.11,
      "alert": "Price change exceeds 10% threshold"
    },
    {
      "itemId": "<ITEM_ID_CHICKEN>",
      "type": "QUANTITY_SHORT",
      "orderedQuantity": 20,
      "receivedQuantity": 18,
      "shortfall": 2
    }
  ]
}
```

**Database Verification:**
```sql
SELECT status, three_way_match_status 
FROM purchase_orders 
WHERE id = '<PO_ID>' AND tenant_id = '<TENANT_ID>';
-- three_way_match_status = 'DISCREPANCY'

-- Verify stock was updated for received quantity
SELECT current_stock 
FROM inventory_items 
WHERE id = '<ITEM_ID_CHICKEN>' AND tenant_id = '<TENANT_ID>';
-- Should be 8 (existing) + 18 (received) = 26
```

---

### TC-INV-06: FEFO Stock Management — Expiry Alerts

**PRD Requirement:** Items approaching expiry (within 2 days for perishables) generate alerts. FEFO enforced.

**Setup:** Create an item expiring in 1 day:
```http
POST /api/inventory/items/<ITEM_ID_CHICKEN>/stock-entries
Authorization: Bearer <MANAGER_TOKEN>

{
  "quantity": 5,
  "unit": "kg",
  "expiryDate": "2026-05-05",
  "batchNumber": "BATCH-001",
  "storageLocation": "WALK_IN_FRIDGE"
}
```

**Expected Notification (auto-triggered):**
```http
GET /api/notifications?type=EXPIRY_ALERT
Authorization: Bearer <OWNER_TOKEN>
```

```json
{
  "notifications": [
    {
      "type": "EXPIRY_ALERT",
      "priority": "CRITICAL",
      "message": "Chicken Breast (Batch BATCH-001): 5 kg expires in 1 day (2026-05-05)",
      "itemId": "<ITEM_ID_CHICKEN>"
    }
  ]
}
```

**FEFO Verification:** When consuming Chicken Breast, the batch with earliest expiry must be consumed first:
```http
GET /api/inventory/items/<ITEM_ID_CHICKEN>/stock-entries?sort=expiryDate&order=asc
Authorization: Bearer <MANAGER_TOKEN>
```

---

### TC-INV-07: Waste Logging with Reason Codes

**PRD Requirement (US-INV-4):** Staff logs waste with reason code, station, cost estimate, optional photo.

**UI Check:** Navigate to `/inventory/waste/new`. Verify reason code dropdown has all 7 categories.

**API Request:**
```http
POST /api/inventory/waste-logs
Authorization: Bearer <STAFF_TOKEN>
Content-Type: application/json

{
  "date": "2026-05-04",
  "time": "14:30:00",
  "itemId": "<ITEM_ID_TOMATO>",
  "quantity": 2,
  "unit": "kg",
  "reason": "SPOILAGE",
  "station": "COLD_STORAGE",
  "loggedBy": "<EMPLOYEE_ID_ANITA>",
  "estimatedCost": 80.00,
  "notes": "Tomatoes went bad overnight — fridge temperature inconsistency"
}
```

**Expected Response:** `HTTP 201`
```json
{
  "id": "<uuid>",
  "itemId": "<ITEM_ID_TOMATO>",
  "quantity": 2,
  "reason": "SPOILAGE",
  "estimatedCost": 80.00,
  "loggedBy": "<EMPLOYEE_ID_ANITA>",
  "tenantId": "<TENANT_ID>"
}
```

**Database Verification:**
```sql
SELECT item_id, quantity, reason, estimated_cost, station, tenant_id
FROM waste_logs
WHERE item_id = '<ITEM_ID_TOMATO>' AND tenant_id = '<TENANT_ID>'
ORDER BY created_at DESC LIMIT 1;
-- 1 row with correct values

-- Verify inventory was deducted
SELECT current_stock FROM inventory_items WHERE id = '<ITEM_ID_TOMATO>';
-- Should be 12 - 2 = 10
```

**Waste Report:**
```http
GET /api/inventory/waste-logs/report?period=weekly
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected Response:**
```json
{
  "period": "2026-W18",
  "totalWasteCost": 80.00,
  "byReason": { "SPOILAGE": 80.00 },
  "byStation": { "COLD_STORAGE": 80.00 },
  "topWastedItems": [
    { "itemId": "<ITEM_ID_TOMATO>", "name": "Tomato", "wasteCost": 80.00 }
  ]
}
```

---

### TC-INV-08: Recipe Costing and Food Cost % Calculation

**PRD Requirement (US-INV-2):** Recipe with ingredient quantities auto-calculates food cost %; alerts when supplier price change crosses profitability threshold.

**Create Masala Dosa Recipe:**
```http
POST /api/inventory/recipes
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "name": "Masala Dosa",
  "category": "Main Course",
  "menuPrice": 180.00,
  "servingSize": 1,
  "prepTimeMinutes": 15,
  "yieldPercent": 95,
  "ingredients": [
    {
      "itemId": "<ITEM_ID_TOMATO>",
      "quantity": 100,
      "unit": "grams",
      "wasteFactor": 0.10
    },
    {
      "name": "Rice Batter",
      "quantity": 200,
      "unit": "grams",
      "costPerGram": 0.05
    },
    {
      "name": "Potato Filling",
      "quantity": 150,
      "unit": "grams",
      "costPerGram": 0.04
    }
  ]
}
```

**Expected Response:** `HTTP 201`
```json
{
  "id": "<uuid>",
  "name": "Masala Dosa",
  "menuPrice": 180.00,
  "totalCost": 49.00,
  "foodCostPercent": 27.22,
  "menuMatrixCategory": "STAR",
  "tenantId": "<TENANT_ID>"
}
```

**Validation:**
- `foodCostPercent` = (49 / 180) × 100 = 27.22% ✓ (in green range 28–35%)
- `menuMatrixCategory` = auto-classified based on popularity + margin data

**Save:** `RECIPE_ID`

**Test Price Change Alert:** Update Tomato price to ₹80 (was ₹40):
```http
PATCH /api/inventory/items/<ITEM_ID_TOMATO>
Authorization: Bearer <OWNER_TOKEN>
{ "avgCost": 80.00 }
```

**Expected:** Recipe food cost recalculates; if it exceeds 35%, a `RECIPE_UNPROFITABLE` notification fires.

---

### TC-INV-09: Stock Count (Full Inventory Audit)

**PRD Requirement (US-INV-1):** Weekly count on mobile; instant stock value; variance report requires explanation.

**Start Count:**
```http
POST /api/inventory/counts
Authorization: Bearer <MANAGER_TOKEN>
Content-Type: application/json

{
  "date": "2026-05-04",
  "countType": "FULL",
  "countedBy": "<EMPLOYEE_ID_RAVI>"
}
```

**Submit Count Results:**
```http
POST /api/inventory/counts/<count_id>/submit
Authorization: Bearer <MANAGER_TOKEN>

{
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "countedQuantity": 24, "unit": "kg" },
    { "itemId": "<ITEM_ID_TOMATO>", "countedQuantity": 9, "unit": "kg" }
  ]
}
```

**Expected Response (Variance Report):**
```json
{
  "countId": "<uuid>",
  "status": "VARIANCE_REVIEW",
  "totalInventoryValue": 8280.00,
  "variances": [
    {
      "itemId": "<ITEM_ID_CHICKEN>",
      "expectedQuantity": 26,
      "countedQuantity": 24,
      "variance": -2,
      "varianceCost": -630.00,
      "requiresExplanation": true
    },
    {
      "itemId": "<ITEM_ID_TOMATO>",
      "expectedQuantity": 10,
      "countedQuantity": 9,
      "variance": -1,
      "varianceCost": -40.00,
      "requiresExplanation": false
    }
  ]
}
```

**Close Count with Explanation:**
```http
POST /api/inventory/counts/<count_id>/close
Authorization: Bearer <MANAGER_TOKEN>

{
  "varianceExplanations": [
    {
      "itemId": "<ITEM_ID_CHICKEN>",
      "explanation": "2 kg used for staff meal — not logged"
    }
  ]
}
```

**Expected:** `HTTP 200`, status = `COMPLETED`, inventory levels updated.

---

### TC-INV-10: Cycle Count (A-Item Spot Check)

```http
POST /api/inventory/counts
Authorization: Bearer <MANAGER_TOKEN>

{
  "date": "2026-05-04",
  "countType": "CYCLE",
  "abcCategoryFilter": "A",
  "countedBy": "<EMPLOYEE_ID_RAVI>"
}
```

**Expected:** Only A-category items (Chicken Breast, premium proteins, spirits) appear in the count sheet.

---

## 4. Epic 3 — Finance & Accounts

**PRD Reference:** Section 3.2  
**Services Involved:** Gateway (:8080), Finance Service (:8083)

---

### TC-FIN-01: Daily Sales Report (DSR) Entry

**PRD Requirement (US-FIN-1):** End-of-day reconciliation in under 5 minutes; cash over/short calculated immediately.

**UI Check:** Navigate to `/finance/dsr/new`. Verify: all payment method fields, guest count, average check auto-calculation, cash over/short display.

**API Request:**
```http
POST /api/finance/daily-sales-reports
Authorization: Bearer <MANAGER_TOKEN>
Content-Type: application/json

{
  "date": "2026-05-03",
  "grossSales": 48500.00,
  "netSales": 46000.00,
  "foodSales": 32000.00,
  "beverageSales": 14000.00,
  "comps": 500.00,
  "discounts": 1500.00,
  "voids": 500.00,
  "paymentBreakdown": {
    "cash": 12000.00,
    "card": 18000.00,
    "upiDynamic": 15000.00,
    "upiStatic": 500.00,
    "other": 3000.00
  },
  "tipsCollected": 2200.00,
  "cashPhysicalCount": 11800.00,
  "guestCount": 185,
  "tableCount": 30,
  "serviceHours": 10,
  "totalLaborHours": 48,
  "reconciledBy": "<userId_Ravi>"
}
```

**Expected Response:** `HTTP 201`
```json
{
  "id": "<uuid>",
  "date": "2026-05-03",
  "grossSales": 48500.00,
  "cashOverShort": -200.00,
  "avgCheckSize": 248.65,
  "tableTurnoverRate": 6.17,
  "splh": 958.33,
  "requiresExplanation": true,
  "status": "PENDING_APPROVAL"
}
```

**Calculations to verify manually:**
- `cashOverShort` = 11800 (physical) − 12000 (recorded cash) = −200 (short ₹200) ✓
- `avgCheckSize` = 46000 / 185 = 248.65 ✓
- `tableTurnoverRate` = 185 guests / 30 tables = 6.17 ✓
- `splh` = 46000 / 48 = 958.33 ✓
- ₹200 short exceeds ₹100 threshold → `requiresExplanation = true` ✓

**Save:** `DSR_ID`

**Database Verification:**
```sql
SELECT date, gross_sales, cash_over_short, table_turnover_rate, splh, tenant_id
FROM daily_sales_reports
WHERE id = '<DSR_ID>' AND tenant_id = '<TENANT_ID>';
```

---

### TC-FIN-02: DSR Cash Discrepancy Explanation

```http
POST /api/finance/daily-sales-reports/<DSR_ID>/explanation
Authorization: Bearer <MANAGER_TOKEN>

{
  "explanation": "₹200 given as staff advance to delivery driver — not recorded in POS"
}
```

**Expected:** `HTTP 200`, DSR status moves to `APPROVED`.

---

### TC-FIN-03: Expense Logging with Category

**PRD Requirement (US-FIN-3):** Log expense, attach invoice photo, set payment due date.

**API Request:**
```http
POST /api/finance/expenses
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "date": "2026-05-04",
  "category": "COGS",
  "subcategory": "PROTEINS",
  "vendorId": "<SUPPLIER_ID>",
  "amount": 6440.00,
  "paymentMethod": "BANK_TRANSFER",
  "invoiceNumber": "METRO-2026-4521",
  "invoiceDate": "2026-05-06",
  "dueDate": "2026-06-05",
  "description": "Chicken and Tomato delivery — Metro Cash & Carry",
  "threeWayMatchStatus": "MATCHED"
}
```

**Expected Response:** `HTTP 201`
```json
{
  "id": "<uuid>",
  "category": "COGS",
  "amount": 6440.00,
  "dueDate": "2026-06-05",
  "status": "PENDING",
  "tenantId": "<TENANT_ID>"
}
```

**Save:** `EXPENSE_ID`

---

### TC-FIN-04: Vendor Payment and AP Aging

**PRD Requirement:** Accounts payable aging at 30/60/90-day intervals; never miss a payment.

**Record Payment:**
```http
POST /api/finance/vendor-payments
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "vendorId": "<SUPPLIER_ID>",
  "expenseId": "<EXPENSE_ID>",
  "amount": 6440.00,
  "paidDate": "2026-05-20",
  "paymentMethod": "BANK_TRANSFER",
  "referenceNumber": "TXN-20260520-001"
}
```

**Expected Response:** `HTTP 201`, expense status → `PAID`.

**AP Aging Report:**
```http
GET /api/finance/vendor-payments/aging
Authorization: Bearer <OWNER_TOKEN>
```

**Expected Response:**
```json
{
  "aging": {
    "current_0_30": { "count": 0, "total": 0 },
    "overdue_31_60": { "count": 0, "total": 0 },
    "overdue_61_90": { "count": 0, "total": 0 },
    "overdue_90_plus": { "count": 0, "total": 0 }
  },
  "totalOutstanding": 0
}
```

---

### TC-FIN-05: P&L Report with Industry Benchmarks

**PRD Requirement (US-FIN-4):** Monthly P&L with food cost %, labor cost %, prime cost %, color-coded benchmarks.

**API Request:**
```http
GET /api/finance/reports/pnl?period=monthly&month=2026-05
Authorization: Bearer <OWNER_TOKEN>
```

**Expected Response:**
```json
{
  "period": "2026-05",
  "revenue": {
    "grossSales": 145500.00,
    "netSales": 138000.00,
    "foodSales": 92000.00,
    "beverageSales": 46000.00
  },
  "cogs": {
    "total": 41400.00,
    "foodCostPercent": 30.00,
    "benchmark": { "min": 28, "max": 35, "status": "GREEN" }
  },
  "grossProfit": 96600.00,
  "labor": {
    "total": 37260.00,
    "laborCostPercent": 27.00,
    "benchmark": { "min": 25, "max": 35, "status": "GREEN" }
  },
  "primeCost": {
    "total": 78660.00,
    "primeCostPercent": 57.00,
    "benchmark": { "min": 55, "max": 65, "status": "GREEN" }
  },
  "operatingExpenses": 27600.00,
  "netProfit": {
    "amount": 69000.00,
    "netProfitMargin": 5.00,
    "benchmark": { "min": 3, "max": 10, "status": "GREEN" }
  }
}
```

**UI Check:** Navigate to `/finance/reports/pnl`. Verify green/yellow/red color-coded indicators for each metric. Verify daily, weekly, monthly toggle works.

---

### TC-FIN-06: Finance Dashboard KPIs

**PRD Requirement:** Daily dashboard with 10-minute morning review — yesterday vs. same day last week, SPLH, Table Turnover Rate.

**API Request:**
```http
GET /api/finance/dashboard?date=2026-05-04
Authorization: Bearer <OWNER_TOKEN>
```

**Expected Response:**
```json
{
  "yesterday": {
    "revenue": 48500.00,
    "revenueVsLastWeek": "+12.5%",
    "cashOverShort": -200.00,
    "foodCostPercent": 29.50,
    "laborCostPercent": 26.80,
    "guestCount": 185,
    "avgCheckSize": 248.65,
    "splh": 958.33,
    "tableTurnoverRate": 6.17,
    "totalVoids": 500.00,
    "totalComps": 500.00,
    "totalDiscounts": 1500.00
  },
  "weeklyKpis": {
    "primeCostTrend": "STABLE",
    "wasteTotal": 80.00,
    "inventoryVariance": -670.00
  }
}
```

---

## 5. Epic 4 — Staff & HR

**PRD Reference:** Section 3.3  
**Services Involved:** Gateway (:8080), Staff Service (:8088)

---

### TC-HR-01: Create Employee Records

**Create Ravi (Manager):**
```http
POST /api/staff/employees
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "name": "Ravi Kumar",
  "role": "MANAGER",
  "email": "ravi@dosapalace.com",
  "phone": "+91-9123456789",
  "hireDate": "2025-01-15",
  "hourlyRate": 250.00,
  "availability": {
    "monday": true, "tuesday": true, "wednesday": true,
    "thursday": true, "friday": true, "saturday": true, "sunday": false
  },
  "certifications": ["FOOD_HANDLER", "FIRST_AID"],
  "emergencyContact": {
    "name": "Kavya Kumar",
    "phone": "+91-9876543210",
    "relationship": "SPOUSE"
  }
}
```

**Expected Response:** `HTTP 201`. **Save:** `EMPLOYEE_ID_RAVI`

**Create Anita (Kitchen Staff):**
```http
POST /api/staff/employees
Authorization: Bearer <OWNER_TOKEN>

{
  "name": "Anita Patel",
  "role": "KITCHEN_STAFF",
  "email": "anita@dosapalace.com",
  "phone": "+91-9012345678",
  "hireDate": "2025-03-01",
  "hourlyRate": 180.00,
  "certifications": ["FOOD_HANDLER"]
}
```

**Save:** `EMPLOYEE_ID_ANITA`

---

### TC-HR-02: Shift Scheduling — Visual Schedule Builder

**PRD Requirement (US-HR-1):** Drag-and-drop schedule; staff views on mobile; swap requests; midnight call elimination.

**Create Week's Schedule:**
```http
POST /api/staff/shifts/batch
Authorization: Bearer <MANAGER_TOKEN>
Content-Type: application/json

{
  "weekStartDate": "2026-05-04",
  "shifts": [
    {
      "employeeId": "<EMPLOYEE_ID_RAVI>",
      "date": "2026-05-04",
      "startTime": "10:00",
      "endTime": "22:00",
      "role": "MANAGER",
      "station": "FLOOR"
    },
    {
      "employeeId": "<EMPLOYEE_ID_ANITA>",
      "date": "2026-05-04",
      "startTime": "09:00",
      "endTime": "17:00",
      "role": "KITCHEN_STAFF",
      "station": "HOT_LINE"
    }
  ]
}
```

**Expected Response:** `HTTP 201`
```json
{
  "shiftsCreated": 2,
  "weeklyLaborCost": 6200.00,
  "publishStatus": "DRAFT"
}
```

**Publish Schedule:**
```http
POST /api/staff/shifts/publish?weekStartDate=2026-05-04
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected:** All staff receive push notifications about their schedules.

**Save:** `SHIFT_ID` (Anita's shift)

**Staff Views Their Schedule (Mobile API):**
```http
GET /api/staff/shifts/my-schedule?weekStartDate=2026-05-04
Authorization: Bearer <STAFF_TOKEN>
```

**Expected Response:**
```json
{
  "employee": { "id": "<EMPLOYEE_ID_ANITA>", "name": "Anita Patel" },
  "shifts": [
    {
      "date": "2026-05-04",
      "startTime": "09:00",
      "endTime": "17:00",
      "station": "HOT_LINE",
      "status": "SCHEDULED"
    }
  ]
}
```

---

### TC-HR-03: Attendance — Clock In with Geofencing

**PRD Requirement (US-HR-2):** Clock in/out; auto-calculate hours; break compliance; late flag.

**Clock In:**
```http
POST /api/staff/attendance/clock-in
Authorization: Bearer <STAFF_TOKEN>
Content-Type: application/json

{
  "shiftId": "<SHIFT_ID>",
  "timestamp": "2026-05-04T09:08:00+05:30",
  "location": {
    "latitude": 12.9716,
    "longitude": 77.5946
  },
  "deviceIp": "192.168.1.105"
}
```

**Expected Response:** `HTTP 200`
```json
{
  "attendanceId": "<uuid>",
  "status": "CLOCKED_IN",
  "lateMinutes": 8,
  "flaggedAsLate": true
}
```

**Clock Out:**
```http
POST /api/staff/attendance/clock-out
Authorization: Bearer <STAFF_TOKEN>

{
  "attendanceId": "<uuid>",
  "timestamp": "2026-05-04T17:02:00+05:30",
  "location": { "latitude": 12.9716, "longitude": 77.5946 }
}
```

**Expected Response:**
```json
{
  "totalHoursWorked": 7.9,
  "regularHours": 7.9,
  "overtimeHours": 0,
  "breakCompliance": "COMPLIANT",
  "status": "COMPLETED"
}
```

**Database Verification:**
```sql
SELECT clock_in, clock_out, total_hours, overtime_hours, status
FROM attendance
WHERE employee_id = '<EMPLOYEE_ID_ANITA>' 
  AND date = '2026-05-04'
  AND tenant_id = '<TENANT_ID>';
```

---

### TC-HR-04: Task Assignment with Photo Verification

**PRD Requirement (US-HR-5):** Assign opening/closing checklists; photo verification for critical tasks; remote status view; 30-min alert if critical task incomplete.

**Create Opening Task:**
```http
POST /api/staff/tasks
Authorization: Bearer <MANAGER_TOKEN>
Content-Type: application/json

{
  "title": "Prep Station Sanitization Check",
  "description": "Sanitize all prep surfaces and take photo as confirmation",
  "assignedTo": "<EMPLOYEE_ID_ANITA>",
  "dueDate": "2026-05-04",
  "dueTime": "09:30:00",
  "category": "OPENING",
  "requiresPhotoVerification": true,
  "isCritical": true
}
```

**Expected Response:** `HTTP 201`. **Save:** `TASK_ID`

**Complete Task with Photo:**
```http
POST /api/staff/tasks/<TASK_ID>/complete
Authorization: Bearer <STAFF_TOKEN>
Content-Type: multipart/form-data

photo: [binary image data]
notes: "Station sanitized and ready for service"
completedAt: "2026-05-04T09:25:00+05:30"
```

**Expected Response:** `HTTP 200`
```json
{
  "taskId": "<TASK_ID>",
  "status": "COMPLETED",
  "completedAt": "2026-05-04T09:25:00+05:30",
  "photoVerificationUrl": "https://storage.supabase.co/...",
  "completedBy": "<EMPLOYEE_ID_ANITA>"
}
```

**Manager Remote View:**
```http
GET /api/staff/tasks/dashboard?date=2026-05-04
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected Response:**
```json
{
  "date": "2026-05-04",
  "totalTasks": 1,
  "completed": 1,
  "pending": 0,
  "critical": { "total": 1, "completed": 1, "overdue": 0 },
  "tasks": [
    {
      "title": "Prep Station Sanitization Check",
      "assignedTo": "Anita Patel",
      "status": "COMPLETED",
      "completedAt": "2026-05-04T09:25:00+05:30",
      "photoUrl": "https://storage.supabase.co/..."
    }
  ]
}
```

**Overdue Critical Task Alert Test:**

Create a critical task that is NOT completed 30 minutes before due:
```http
POST /api/staff/tasks

{
  "title": "Temperature Log — Walk-in Fridge",
  "assignedTo": "<EMPLOYEE_ID_ANITA>",
  "dueDate": "2026-05-04",
  "dueTime": "10:00:00",
  "category": "SAFETY",
  "isCritical": true
}
```

Simulate time passing past 09:30 (30 min before 10:00):

```http
GET /api/notifications?type=CRITICAL_TASK_OVERDUE
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** Push notification: "Temperature Log — Walk-in Fridge is incomplete 30 minutes before deadline."

---

### TC-HR-05: Shift Feedback Submission

**PRD Requirement:** End-of-shift pulse check; staff rates shift 1–5; flags equipment issues or morale concerns.

**API Request:**
```http
POST /api/staff/shift-feedback
Authorization: Bearer <STAFF_TOKEN>
Content-Type: application/json

{
  "shiftId": "<SHIFT_ID>",
  "employeeId": "<EMPLOYEE_ID_ANITA>",
  "rating": 3,
  "issues": ["UNDERSTAFFED"],
  "equipmentFlags": ["FRIDGE_TEMPERATURE_ISSUE"],
  "moraleNote": "Busy service, need one more person on hot line",
  "submittedAt": "2026-05-04T17:05:00+05:30"
}
```

**Expected Response:** `HTTP 201`

**Manager Views Feedback:**
```http
GET /api/staff/shift-feedback?date=2026-05-04
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected:** Feedback with rating, issues, equipment flags visible. Equipment flag `FRIDGE_TEMPERATURE_ISSUE` should potentially trigger a maintenance notification.

---

### TC-HR-06: Tip Pool Calculation

**PRD Requirement (US-HR-3):** Set tip pool rules once; auto-calculate each person's share; no disputes; full audit trail.

**Set Tip Pool Rules:**
```http
POST /api/staff/tip-pools/rules
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "model": "POOLED",
  "distributionBasis": "HOURS_WORKED",
  "roles": [
    { "role": "SERVER", "percentage": 70 },
    { "role": "KITCHEN_STAFF", "percentage": 20 },
    { "role": "MANAGER", "percentage": 10 }
  ]
}
```

**Calculate Tip Pool for Shift:**
```http
POST /api/staff/tip-pools/calculate
Authorization: Bearer <MANAGER_TOKEN>
Content-Type: application/json

{
  "date": "2026-05-04",
  "totalTips": 2200.00,
  "participants": [
    { "employeeId": "<EMPLOYEE_ID_ANITA>", "hoursWorked": 7.9, "role": "KITCHEN_STAFF" },
    { "employeeId": "<EMPLOYEE_ID_RAVI>", "hoursWorked": 12.0, "role": "MANAGER" }
  ]
}
```

**Expected Response:**
```json
{
  "date": "2026-05-04",
  "totalTips": 2200.00,
  "payouts": [
    {
      "employeeId": "<EMPLOYEE_ID_ANITA>",
      "name": "Anita Patel",
      "role": "KITCHEN_STAFF",
      "amount": 440.00,
      "calculationBasis": "20% pool share"
    },
    {
      "employeeId": "<EMPLOYEE_ID_RAVI>",
      "name": "Ravi Kumar",
      "role": "MANAGER",
      "amount": 220.00,
      "calculationBasis": "10% pool share"
    }
  ],
  "auditTrail": { "calculatedBy": "system", "timestamp": "2026-05-04T23:00:00Z" }
}
```

---

### TC-HR-07: Performance Goal Tracking with SPLH

**PRD Requirement:** Trackable targets — SPLH, Table Turnover Rate, upsell rate; progress visible.

```http
POST /api/staff/performance-goals
Authorization: Bearer <MANAGER_TOKEN>
Content-Type: application/json

{
  "employeeId": "<EMPLOYEE_ID_RAVI>",
  "metric": "SPLH",
  "targetValue": 1000.00,
  "currentValue": 958.33,
  "period": "2026-05",
  "unit": "INR_PER_HOUR"
}
```

**Expected Response:** `HTTP 201` with `progressPercent: 95.8`.

---

## 6. Epic 5 — AI Features

**PRD Reference:** Section 4  
**Services Involved:** Gateway (:8080), AI Service (:8084), File Service (:8085)

---

### TC-AI-01: OCR Notebook Digitization

**PRD Requirement:** Photograph notebook page → extract structured inventory/expense data → confirmation UI → database commit.

**Step 1: Upload notebook photo:**
```http
POST /api/files/upload
Authorization: Bearer <OWNER_TOKEN>
Content-Type: multipart/form-data

file: [notebook_page.jpg]
purpose: OCR_NOTEBOOK
```

**Expected Response:** `HTTP 201`
```json
{
  "fileId": "<uuid>",
  "url": "https://storage.supabase.co/...",
  "purpose": "OCR_NOTEBOOK"
}
```

**Step 2: Submit OCR job:**
```http
POST /api/ai/ocr/notebook
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "fileId": "<fileId>",
  "contextHint": "inventory_count"
}
```

**Expected Response:** `HTTP 202`
```json
{
  "jobId": "<uuid>",
  "status": "PROCESSING",
  "estimatedCompletionSeconds": 30
}
```

**Step 3: Poll for result:**
```http
GET /api/ai/jobs/<jobId>
Authorization: Bearer <OWNER_TOKEN>
```

**Expected Response (when complete):** `HTTP 200`
```json
{
  "jobId": "<uuid>",
  "status": "COMPLETED",
  "confidence": 0.91,
  "extractedData": {
    "type": "INVENTORY_COUNT",
    "items": [
      { "name": "Tomato", "quantity": 8, "unit": "kg", "confidence": 0.95 },
      { "name": "Chicken Breast", "quantity": 22, "unit": "kg", "confidence": 0.88 }
    ]
  },
  "rawText": "Tamater - 8 kg\nChicken - 22 kg",
  "requiresConfirmation": true
}
```

**Step 4: Confirm and commit:**
```http
POST /api/ai/jobs/<jobId>/confirm
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "confirmedItems": [
    { "name": "Tomato", "itemId": "<ITEM_ID_TOMATO>", "quantity": 8, "unit": "kg" },
    { "name": "Chicken Breast", "itemId": "<ITEM_ID_CHICKEN>", "quantity": 22, "unit": "kg" }
  ]
}
```

**Expected Response:** `HTTP 200` — inventory counts updated in system.

---

### TC-AI-02: Voice Input for Inventory Counting

**PRD Requirement:** Hands-free inventory; "Two kilos of tomatoes spoiled" → waste log; noisy kitchen environment.

**Submit Voice Recording:**
```http
POST /api/ai/voice/process
Authorization: Bearer <STAFF_TOKEN>
Content-Type: multipart/form-data

audio: [recording.m4a]
context: WASTE_LOG
```

**Expected Response:** `HTTP 202` (async processing)

**Simulated Transcript Result:**
```json
{
  "transcript": "Two kilos of tomatoes spoiled overnight",
  "parsedAction": {
    "type": "WASTE_LOG",
    "item": "Tomato",
    "quantity": 2,
    "unit": "kg",
    "reason": "SPOILAGE",
    "confidence": 0.93
  },
  "requiresConfirmation": true
}
```

**Confirm:**
```http
POST /api/ai/voice/<jobId>/confirm
Authorization: Bearer <STAFF_TOKEN>

{
  "confirmed": true,
  "itemId": "<ITEM_ID_TOMATO>"
}
```

**Expected:** Waste log created automatically; inventory deducted.

---

### TC-AI-03: Receipt/Invoice Scanning (Mindee Integration)

**PRD Requirement (US-FIN-3):** Photograph vendor invoice → extract amounts, match to PO, track due date.

**Upload Invoice Photo:**
```http
POST /api/ai/invoice/scan
Authorization: Bearer <OWNER_TOKEN>
Content-Type: multipart/form-data

file: [metro_invoice.jpg]
poId: <PO_ID>
```

**Expected Response:**
```json
{
  "jobId": "<uuid>",
  "status": "COMPLETED",
  "extractedInvoice": {
    "vendorName": "Metro Cash & Carry",
    "invoiceNumber": "METRO-2026-4521",
    "invoiceDate": "2026-05-06",
    "lineItems": [
      { "description": "Chicken Breast", "quantity": 18, "unit": "kg", "unitPrice": 350.00, "lineTotal": 6300.00 },
      { "description": "Tomato", "quantity": 10, "unit": "kg", "unitPrice": 38.00, "lineTotal": 380.00 }
    ],
    "subtotal": 6680.00,
    "tax": 0.00,
    "total": 6680.00
  },
  "matchedPo": {
    "poId": "<PO_ID>",
    "matchStatus": "PARTIAL_MATCH",
    "discrepancies": [
      { "field": "chicken_price", "po": 315.00, "invoice": 350.00 }
    ]
  }
}
```

---

### TC-AI-04: Natural Language Query

**PRD Requirement:** Plain English queries → structured API calls → formatted answer with optional chart.

**Query 1: Vegetable spend this week:**
```http
POST /api/ai/nl-query
Authorization: Bearer <OWNER_TOKEN>
Content-Type: application/json

{
  "query": "How much did we spend on vegetables this week?"
}
```

**Expected Response:**
```json
{
  "query": "How much did we spend on vegetables this week?",
  "answer": "This week (May 4–10, 2026) you spent ₹1,240 on vegetables — Tomato: ₹760, Onion: ₹280, Greens: ₹200.",
  "data": {
    "totalAmount": 1240.00,
    "breakdown": [
      { "item": "Tomato", "amount": 760.00 },
      { "item": "Onion", "amount": 280.00 },
      { "item": "Greens", "amount": 200.00 }
    ],
    "period": "2026-W19"
  },
  "chartType": "BAR"
}
```

**Query 2: Unprofitable menu items:**
```http
POST /api/ai/nl-query
Content-Type: application/json

{
  "query": "Which menu items lost money last month?"
}
```

**Expected Response:**
```json
{
  "answer": "Last month (April 2026), no items were outright losses. However, Rava Idli had food cost at 37.2% — above the 35% target. Consider adjusting portion size or price.",
  "data": { "atRiskItems": [{ "name": "Rava Idli", "foodCostPercent": 37.2 }] }
}
```

---

### TC-AI-05: Smart Inventory Prediction

**PRD Requirement:** Moving averages for demand forecasting; anomaly alerts for unusual usage.

```http
GET /api/ai/predictions/inventory?itemId=<ITEM_ID_TOMATO>&horizon=7
Authorization: Bearer <OWNER_TOKEN>
```

**Expected Response:**
```json
{
  "itemId": "<ITEM_ID_TOMATO>",
  "itemName": "Tomato",
  "forecastDays": 7,
  "dailyPredictions": [
    { "date": "2026-05-05", "predictedUsageKg": 3.2, "confidence": 0.82 },
    { "date": "2026-05-06", "predictedUsageKg": 3.5, "confidence": 0.80 }
  ],
  "suggestedOrderQuantity": 25,
  "suggestedOrderDate": "2026-05-06",
  "anomalyAlert": null
}
```

---

## 7. Epic 6 — Cross-Cutting: Notifications & Audit Logs

**PRD Reference:** Section 3.5  
**Services Involved:** Gateway (:8080), Notification Service (:8086), Auth Service (:8081)

---

### TC-NOTIFY-01: Critical Push Notification Delivery

**PRD Requirement:** Immediate push for cash discrepancy, no-show, low-stock, expiry, overtime, price change >10%, critical task overdue.

**Verify all critical notification types are created by checking:**
```http
GET /api/notifications?priority=CRITICAL
Authorization: Bearer <OWNER_TOKEN>
```

**Expected Response must include all these types from tests above:**
```json
{
  "notifications": [
    { "type": "STOCK_LOW", "message": "Chicken Breast is below PAR level" },
    { "type": "EXPIRY_ALERT", "message": "Chicken Breast Batch BATCH-001 expires in 1 day" },
    { "type": "DSR_DISCREPANCY", "message": "Cash short ₹200 on 2026-05-03" },
    { "type": "PRICE_CHANGE_ALERT", "message": "Chicken Breast price increased 11.11%" }
  ]
}
```

**Mark as Read:**
```http
POST /api/notifications/<notificationId>/read
Authorization: Bearer <OWNER_TOKEN>
```

---

### TC-NOTIFY-02: Daily Digest Notification

**PRD Requirement:** Daily digest — upcoming vendor payments, pending POs, schedule gaps, unresolved variances, expiring certifications.

```http
GET /api/notifications/digest?date=2026-05-04
Authorization: Bearer <OWNER_TOKEN>
```

**Expected Response:**
```json
{
  "digestDate": "2026-05-04",
  "vendorPaymentsDue": [
    { "vendor": "Metro Cash & Carry", "amount": 6440.00, "dueDate": "2026-06-05", "daysUntilDue": 32 }
  ],
  "pendingPoApprovals": 0,
  "unresolvedVariances": 0,
  "expiringCertifications": [
    { "employee": "Anita Patel", "certification": "FOOD_HANDLER", "expiresIn": 45 }
  ]
}
```

---

### TC-AUDIT-01: Audit Log Creation Verification

**PRD Requirement:** Every significant action creates an immutable audit log.

**After completing all above tests, verify audit logs exist:**
```http
GET /api/audit-logs?limit=20
Authorization: Bearer <OWNER_TOKEN>
```

**Expected Response must contain entries for:**
```json
{
  "auditLogs": [
    { "eventType": "INVENTORY_ITEM_CREATED", "entityType": "inventory_item", "userId": "<priyaId>" },
    { "eventType": "PO_CREATED", "entityType": "purchase_order" },
    { "eventType": "WASTE_LOG_CREATED", "entityType": "waste_log" },
    { "eventType": "DSR_CREATED", "entityType": "daily_sales_report" },
    { "eventType": "EXPENSE_CREATED", "entityType": "expense" },
    { "eventType": "SHIFT_PUBLISHED", "entityType": "shift" },
    { "eventType": "TASK_COMPLETED", "entityType": "task" },
    { "eventType": "CLOCK_IN", "entityType": "attendance" },
    { "eventType": "CLOCK_OUT", "entityType": "attendance" }
  ]
}
```

**Database Verification:**
```sql
SELECT event_type, entity_type, user_id, timestamp, ip_address
FROM audit_logs
WHERE tenant_id = '<TENANT_ID>'
ORDER BY timestamp DESC
LIMIT 20;
-- Every test action above should appear here
-- ip_address should NOT be null
-- old_value/new_value should capture state transitions
```

---

### TC-AUDIT-02: Audit Log Immutability

**Attempt to delete an audit log (must fail):**
```http
DELETE /api/audit-logs/<auditLogId>
Authorization: Bearer <OWNER_TOKEN>
```

**Expected Response:** `HTTP 405 Method Not Allowed` — audit logs are append-only.

---

## 8. Epic 7 — Complete Purchase-to-Plate Traceability Flow

**PRD Requirement:** This is KitchenLedger's core differentiator — the complete chain: Purchase → Inventory → Kitchen → Plate.

---

### TC-TRACE-01: Full Traceability Chain

This test executes the complete chain as a restaurant scenario.

**Scenario:** Metro delivers chicken on Monday. By Thursday it's been cooked into Masala Chicken and served to 12 guests.

**Step 1: PO created and received** ← `TC-INV-04` and `TC-INV-05` above ✓

**Step 2: Kitchen Transfer (Storage → Kitchen):**
```http
POST /api/inventory/stock-transfers
Authorization: Bearer <MANAGER_TOKEN>
Content-Type: application/json

{
  "fromLocation": "WALK_IN_FRIDGE",
  "toLocation": "HOT_LINE_KITCHEN",
  "date": "2026-05-07",
  "kotReference": "KOT-20260507-001",
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "quantity": 5, "unit": "kg" }
  ],
  "transferredBy": "<EMPLOYEE_ID_ANITA>"
}
```

**Expected Response:** `HTTP 201`
```json
{
  "transferId": "<uuid>",
  "fromLocation": "WALK_IN_FRIDGE",
  "toLocation": "HOT_LINE_KITCHEN",
  "kotReference": "KOT-20260507-001",
  "items": [{ "itemId": "<ITEM_ID_CHICKEN>", "quantity": 5 }]
}
```

**Step 3: Record Actual Usage vs Theoretical (AvT Variance):**
```http
POST /api/inventory/usage-variance
Authorization: Bearer <MANAGER_TOKEN>
Content-Type: application/json

{
  "date": "2026-05-07",
  "recipeId": "<RECIPE_ID>",
  "portionsServed": 12,
  "actualUsage": [
    { "itemId": "<ITEM_ID_CHICKEN>", "actualQuantityGrams": 1980 }
  ]
}
```

**Expected Response:**
```json
{
  "recipeId": "<RECIPE_ID>",
  "portionsServed": 12,
  "theoreticalUsage": {
    "chicken": { "theoretical": 1800, "actual": 1980, "variance": 180, "variancePercent": 10.0, "status": "ALERT" }
  },
  "note": "Chicken variance 10% exceeds 5% threshold — investigate portioning"
}
```

**AvT variance >5% triggers investigation alert to manager.**

**Step 4: Full Traceability Query:**
```http
GET /api/inventory/traceability?itemId=<ITEM_ID_CHICKEN>&dateFrom=2026-05-06&dateTo=2026-05-07
Authorization: Bearer <OWNER_TOKEN>
```

**Expected Response (the complete chain):**
```json
{
  "itemId": "<ITEM_ID_CHICKEN>",
  "itemName": "Chicken Breast",
  "traceabilityChain": [
    {
      "stage": "PURCHASE",
      "event": "PO received from Metro",
      "date": "2026-05-06",
      "quantity": "18 kg",
      "poId": "<PO_ID>",
      "invoiceNumber": "METRO-2026-4521"
    },
    {
      "stage": "INVENTORY",
      "event": "Stock entry: Walk-in Fridge",
      "date": "2026-05-06",
      "quantity": "18 kg",
      "batchNumber": "BATCH-001",
      "expiryDate": "2026-05-09"
    },
    {
      "stage": "KITCHEN",
      "event": "Transfer to Hot Line Kitchen",
      "date": "2026-05-07",
      "quantity": "5 kg",
      "kotReference": "KOT-20260507-001"
    },
    {
      "stage": "PLATE",
      "event": "12 portions served (Masala Dosa recipe)",
      "date": "2026-05-07",
      "theoreticalUsage": "1.8 kg",
      "actualUsage": "1.98 kg",
      "variance": "+10%"
    }
  ]
}
```

---

## 9. Mobile API Parity Tests

**PRD Requirement:** Mobile app (Expo) accesses all features via the same API Gateway. These tests verify mobile-specific flows work identically.

All mobile requests use the same base URL (`http://localhost:8080`) with JWT tokens. The key difference is that mobile requests include a `User-Agent: KitchenLedger-Mobile/1.0.0` header and may include `X-App-Version`.

---

### TC-MOB-01: Mobile Inventory Count (US-INV-1 — Main Mobile User Story)

```http
GET /api/inventory/items?sortBy=storageLocation&abcCategory=A
Authorization: Bearer <STAFF_TOKEN>
User-Agent: KitchenLedger-Mobile/1.0.0

# Expected: items sorted by storage layout for efficient physical counting
```

**Submit count via mobile:**
```http
POST /api/inventory/counts
Authorization: Bearer <STAFF_TOKEN>
User-Agent: KitchenLedger-Mobile/1.0.0

{
  "date": "2026-05-04",
  "countType": "CYCLE",
  "abcCategoryFilter": "A"
}
```

---

### TC-MOB-02: Mobile Waste Logging

```http
POST /api/inventory/waste-logs
Authorization: Bearer <STAFF_TOKEN>
User-Agent: KitchenLedger-Mobile/1.0.0

{
  "itemId": "<ITEM_ID_TOMATO>",
  "quantity": 1,
  "unit": "kg",
  "reason": "PREP_WASTE",
  "station": "PREP_KITCHEN"
}
```

**Expected:** `HTTP 201` — same as web. No mobile-specific payload differences.

---

### TC-MOB-03: Mobile Clock In/Out

```http
POST /api/staff/attendance/clock-in
Authorization: Bearer <STAFF_TOKEN>
User-Agent: KitchenLedger-Mobile/1.0.0

{
  "shiftId": "<SHIFT_ID>",
  "timestamp": "2026-05-04T09:05:00+05:30",
  "location": { "latitude": 12.9716, "longitude": 77.5946 }
}
```

---

### TC-MOB-04: Mobile Shift Schedule View

```http
GET /api/staff/shifts/my-schedule?weekStartDate=2026-05-04
Authorization: Bearer <STAFF_TOKEN>
User-Agent: KitchenLedger-Mobile/1.0.0
```

---

### TC-MOB-05: Mobile Task Completion with Photo Upload

```http
POST /api/staff/tasks/<TASK_ID>/complete
Authorization: Bearer <STAFF_TOKEN>
User-Agent: KitchenLedger-Mobile/1.0.0
Content-Type: multipart/form-data

photo: [mobile_camera_capture.jpg]
notes: "Station clean"
completedAt: "2026-05-04T09:20:00+05:30"
```

---

### TC-MOB-06: Mobile DSR Entry (Owner on Mobile)

```http
POST /api/finance/daily-sales-reports
Authorization: Bearer <OWNER_TOKEN>
User-Agent: KitchenLedger-Mobile/1.0.0

{
  "date": "2026-05-04",
  "grossSales": 52000.00,
  "paymentBreakdown": { "cash": 15000.00, "upiDynamic": 25000.00, "card": 12000.00 },
  "cashPhysicalCount": 14950.00,
  "guestCount": 195
}
```

---

### TC-MOB-07: Mobile Shift Feedback

```http
POST /api/staff/shift-feedback
Authorization: Bearer <STAFF_TOKEN>
User-Agent: KitchenLedger-Mobile/1.0.0

{
  "shiftId": "<SHIFT_ID>",
  "rating": 4,
  "issues": [],
  "moraleNote": "Good service today"
}
```

---

### TC-MOB-08: Mobile OCR — Camera to Inventory

```http
POST /api/ai/ocr/notebook
Authorization: Bearer <OWNER_TOKEN>
User-Agent: KitchenLedger-Mobile/1.0.0

{
  "fileId": "<fileId_from_mobile_camera>",
  "contextHint": "expense_entry"
}
```

---

## 10. Multi-Tenant Isolation Tests

**PRD Requirement:** RLS must prevent cross-tenant data access even if application code has bugs.

---

### TC-MT-01: Register a Second Tenant

```http
POST /api/auth/register

{
  "restaurantName": "Biryani Hub",
  "email": "owner@biryanihub.com",
  "password": "TestPass@123",
  "region": "IN"
}
```

**Save:** `TENANT_ID_B`, `TENANT_B_TOKEN`

**Create inventory item for Tenant B:**
```http
POST /api/inventory/items
Authorization: Bearer <TENANT_B_TOKEN>

{
  "name": "Basmati Rice",
  "category": "Dry Goods",
  "currentStock": 50
}
```

**Save:** `ITEM_ID_RICE_TENANT_B`

---

### TC-MT-02: Tenant A Cannot See Tenant B's Items

```http
GET /api/inventory/items
Authorization: Bearer <OWNER_TOKEN>
```

**Expected Response:** Returns ONLY Dosa Palace items. `Basmati Rice` must NOT appear.

---

### TC-MT-03: Direct Database RLS Test

```sql
-- Set session to Tenant A context
SET app.current_tenant_id = '<TENANT_ID>';

-- Try to SELECT Tenant B's item directly
SELECT * FROM inventory_items WHERE id = '<ITEM_ID_RICE_TENANT_B>';
-- MUST return 0 rows — RLS blocks it

-- Confirm it exists when setting Tenant B context
SET app.current_tenant_id = '<TENANT_ID_B>';
SELECT * FROM inventory_items WHERE id = '<ITEM_ID_RICE_TENANT_B>';
-- Returns 1 row
```

---

### TC-MT-04: Token Cannot Override Tenant

```http
GET /api/inventory/items
Authorization: Bearer <OWNER_TOKEN>
X-Tenant-Id: <TENANT_ID_B>
```

**Expected:** Response still shows ONLY Dosa Palace items. Gateway uses JWT's `tenantId` claim, NOT the header.

---

## 11. Non-Functional Tests

### TC-NF-01: Error Messages Don't Leak Internal Details

**Trigger a 500 error (invalid data):**
```http
POST /api/inventory/items
Authorization: Bearer <OWNER_TOKEN>

{
  "name": "",
  "currentStock": "not_a_number"
}
```

**Expected Response:** `HTTP 400`
```json
{
  "error": "VALIDATION_ERROR",
  "message": "Item name is required; currentStock must be a number"
}
```

**Must NOT contain:** stack traces, `java.lang.`, `NullPointerException`, table names, column names, service hostnames.

---

### TC-NF-02: Rate Limiting on Public Endpoints

```bash
# Fire 200 requests in rapid succession
for i in {1..200}; do
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:8080/api/auth/login \
    -d '{"email":"test@test.com","password":"wrong"}'
done
```

**Expected:** After threshold (configurable, default ~60/min), responses return `HTTP 429 Too Many Requests`.

---

### TC-NF-03: Health Checks

```bash
curl http://localhost:8080/health
curl http://localhost:8081/actuator/health
curl http://localhost:8082/actuator/health
curl http://localhost:8083/actuator/health
curl http://localhost:8084/health
curl http://localhost:8085/health
curl http://localhost:8086/health
curl http://localhost:8087/health
curl http://localhost:8088/actuator/health
```

**All must return:** `{"status": "UP"}` or `{"status": "ok"}`.

---

### TC-NF-04: Monetary Precision — No Floating Point Errors

```http
POST /api/finance/expenses
Authorization: Bearer <OWNER_TOKEN>

{
  "amount": 1234.56,
  "category": "COGS"
}
```

**Database Verification:**
```sql
SELECT amount, pg_typeof(amount) FROM expenses WHERE tenant_id = '<TENANT_ID>' ORDER BY created_at DESC LIMIT 1;
-- pg_typeof must return 'numeric' not 'double precision'
-- amount must be exactly 1234.56
```

---

### TC-NF-05: Soft Delete — No Hard Deletes

```http
DELETE /api/inventory/items/<ITEM_ID_TOMATO>
Authorization: Bearer <OWNER_TOKEN>
```

**Expected Response:** `HTTP 200`

**Database Verification:**
```sql
SELECT id, name, deleted_at FROM inventory_items WHERE id = '<ITEM_ID_TOMATO>';
-- Row MUST still exist
-- deleted_at MUST be set (not null)
-- Row should NOT appear in normal GET /api/inventory/items
```

---

### TC-NF-06: Monetary Amounts — NUMERIC(12,2) Enforcement

```sql
SELECT column_name, data_type, numeric_precision, numeric_scale
FROM information_schema.columns
WHERE table_name IN ('expenses', 'daily_sales_reports', 'purchase_orders', 'inventory_items')
  AND column_name IN ('amount', 'gross_sales', 'total_amount', 'avg_cost');
-- ALL monetary columns must be: data_type='numeric', numeric_precision=12, numeric_scale=2
```

---

### TC-NF-07: UUID Primary Keys

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE column_name = 'id'
  AND table_name IN ('tenants', 'users', 'inventory_items', 'expenses', 'shifts', 'tasks');
-- All must be data_type = 'uuid'
```

---

### TC-NF-08: Version Column for Optimistic Locking

```sql
SELECT column_name FROM information_schema.columns
WHERE column_name = 'version'
  AND table_schema = 'public';
-- Should exist on: inventory_items, purchase_orders, daily_sales_reports, shifts
```

---

## 12. Test Execution Checklist

### Pre-Execution Checklist

- [ ] All 9 services running (`npm run infra:up && npm run dev`)
- [ ] All 9 health checks return UP
- [ ] `.env` populated with all required secrets
- [ ] Database migrations applied (all tables exist)
- [ ] RLS enabled on all tenant-scoped tables
- [ ] RabbitMQ exchanges and queues created (`infrastructure/rabbitmq/setup.sh`)

### Epic Coverage Checklist

| Epic | Test Cases | Must Pass Before |
|---|---|---|
| **Auth & Multi-Tenancy** | TC-AUTH-01 to TC-AUTH-06 | All other tests |
| **Inventory Management** | TC-INV-01 to TC-INV-10 | Finance tests (expense links to PO) |
| **Finance & Accounts** | TC-FIN-01 to TC-FIN-06 | Staff tests (labor cost in P&L) |
| **Staff & HR** | TC-HR-01 to TC-HR-07 | AI tests (employee context) |
| **AI Features** | TC-AI-01 to TC-AI-05 | Traceability test |
| **Notifications & Audit** | TC-NOTIFY-01, TC-NOTIFY-02, TC-AUDIT-01, TC-AUDIT-02 | Concurrent with all epics |
| **Purchase-to-Plate** | TC-TRACE-01 | Requires INV + HR + Finance |
| **Mobile API Parity** | TC-MOB-01 to TC-MOB-08 | After web API passes |
| **Multi-Tenant Isolation** | TC-MT-01 to TC-MT-04 | Critical — run independently |
| **Non-Functional** | TC-NF-01 to TC-NF-08 | Final gate before release |

### GO / NO-GO Criteria

| Criterion | Required for GO |
|---|---|
| All Auth tests pass | MANDATORY |
| All RBAC enforcement tests pass | MANDATORY |
| Multi-tenant isolation tests pass | MANDATORY |
| No stack traces in error responses | MANDATORY |
| RLS verified in database | MANDATORY |
| All monetary columns are NUMERIC(12,2) | MANDATORY |
| Soft-delete enforced (no hard deletes) | MANDATORY |
| All health checks green | MANDATORY |
| Core inventory CRUD (TC-INV-01 to TC-INV-05) | MANDATORY |
| DSR creation and cash over/short (TC-FIN-01) | MANDATORY |
| P&L with benchmarks (TC-FIN-05) | MANDATORY |
| Shift scheduling and staff view (TC-HR-02) | MANDATORY |
| Task photo verification (TC-HR-04) | MANDATORY |
| OCR notebook digitization (TC-AI-01) | RECOMMENDED |
| Natural language query (TC-AI-04) | RECOMMENDED |
| Purchase-to-plate traceability (TC-TRACE-01) | STRONGLY RECOMMENDED |
| Rate limiting (TC-NF-02) | MANDATORY |

### PRD User Story Coverage Matrix

| User Story | Test Case | Status |
|---|---|---|
| US-INV-1 (mobile stock count) | TC-INV-09, TC-MOB-01 | — |
| US-INV-2 (recipe food cost %) | TC-INV-08 | — |
| US-INV-3 (PAR alert, one-tap PO) | TC-INV-03, TC-INV-04 | — |
| US-INV-4 (waste log with reasons) | TC-INV-07 | — |
| US-FIN-1 (5-min EOD reconciliation) | TC-FIN-01, TC-FIN-02 | — |
| US-FIN-3 (photograph invoice, match to PO) | TC-AI-03 | — |
| US-FIN-4 (monthly P&L with benchmarks) | TC-FIN-05 | — |
| US-HR-1 (schedule on phone, staff views) | TC-HR-02 | — |
| US-HR-2 (clock in/out, auto hours calc) | TC-HR-03 | — |
| US-HR-3 (tip pool auto-calculation) | TC-HR-06 | — |
| US-HR-5 (photo task verification) | TC-HR-04 | — |

---

*This document is the single source of truth for KitchenLedger product validation. Update the Status column as tests are executed. A GO decision requires all MANDATORY criteria to pass.*

*Last updated: 2026-05-04 | Version: 1.0*
