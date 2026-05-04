# EPIC-02: Inventory Management — Deep Test Specification

> **Scope:** Item CRUD, ABC classification, PAR levels, supplier catalog, purchase order lifecycle, three-way match, FEFO, waste logging, recipe costing, menu engineering, stock counts, kitchen transfers, AvT variance.
> **Services:** Inventory Service (:8082), Gateway (:8080), Notification Service (:8086)
> **Tables:** inventory_items, suppliers, purchase_orders, stock_receipts, inventory_movements, waste_logs, recipes, inventory_counts
> **Base URL:** `http://localhost:8080`

---

## Table of Contents

1. [Inventory Item CRUD](#1-inventory-item-crud)
2. [ABC Classification](#2-abc-classification)
3. [Supplier Management](#3-supplier-management)
4. [PAR Level & Reorder Alerts](#4-par-level--reorder-alerts)
5. [Purchase Order Lifecycle](#5-purchase-order-lifecycle)
6. [Three-Way Match Protocol](#6-three-way-match-protocol)
7. [FEFO Stock & Expiry Tracking](#7-fefo-stock--expiry-tracking)
8. [Waste Logging](#8-waste-logging)
9. [Recipe Costing & Menu Engineering](#9-recipe-costing--menu-engineering)
10. [Stock Counts — Full & Cycle](#10-stock-counts--full--cycle)
11. [Kitchen Transfers & KOT](#11-kitchen-transfers--kot)
12. [Actual vs. Theoretical Usage (AvT)](#12-actual-vs-theoretical-usage-avt)
13. [Unit Conversion & Precision](#13-unit-conversion--precision)

---

## Test Variables

```
OWNER_TOKEN       = from Epic 1
MANAGER_TOKEN     = from Epic 1
STAFF_TOKEN       = from Epic 1
TENANT_ID         = from Epic 1
SUPPLIER_ID       = set in TC-INV-20
ITEM_ID_CHICKEN   = set in TC-INV-01
ITEM_ID_TOMATO    = set in TC-INV-02
ITEM_ID_OIL       = set in TC-INV-03
RECIPE_ID_DOSA    = set in TC-INV-70
PO_ID             = set in TC-INV-40
```

---

## 1. Inventory Item CRUD

### TC-INV-01 — Create A-Item (Chicken Breast) — Full Fields

**PRD Requirement:** Items stored with ABC category, purchase/recipe/count units, conversion factors, PAR level, storage location, expiry metadata.

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
  "supplierIds": []
}
```

**Expected Response: `HTTP 201`**
```json
{
  "id": "<uuid-v4>",
  "name": "Chicken Breast",
  "abcCategory": "A",
  "parLevel": 10.00,
  "currentStock": 25.00,
  "avgCost": 320.00,
  "storageLocation": "WALK_IN_FRIDGE",
  "isPerishable": true,
  "tenantId": "<TENANT_ID>",
  "deletedAt": null,
  "version": 1
}
```

**Database Verification:**
```sql
SELECT name, abc_category, par_level, current_stock, avg_cost, 
       is_perishable, storage_location, tenant_id, deleted_at, version
FROM inventory_items
WHERE name = 'Chicken Breast' AND tenant_id = '<TENANT_ID>';
-- Expect: 1 row
-- avg_cost = 320.00 (NUMERIC, not float)
-- deleted_at IS NULL
-- version = 1
```

**Save:** `ITEM_ID_CHICKEN`

---

### TC-INV-02 — Create C-Item (Tomato) — Minimal Fields

```http
POST /api/inventory/items
Authorization: Bearer <OWNER_TOKEN>

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

**Expected: `HTTP 201`** — Save: `ITEM_ID_TOMATO`

---

### TC-INV-03 — Create Non-Perishable Item (Cooking Oil)

```http
POST /api/inventory/items

{
  "name": "Refined Sunflower Oil",
  "category": "Dry Goods",
  "abcCategory": "B",
  "purchaseUnit": "litre",
  "recipeUnit": "ml",
  "countUnit": "litre",
  "conversionFactors": { "purchaseToRecipe": 1000, "purchaseToCount": 1 },
  "parLevel": 20,
  "currentStock": 35,
  "avgCost": 110.00,
  "storageLocation": "DRY_STORAGE",
  "isPerishable": false
}
```

**Expected: `HTTP 201`** — `shelfLifeDays` absent or null; no expiry tracking needed. Save: `ITEM_ID_OIL`

---

### TC-INV-04 — Read Item by ID

```http
GET /api/inventory/items/<ITEM_ID_CHICKEN>
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 200`** with full item object

---

### TC-INV-05 — List Items with Pagination

```http
GET /api/inventory/items?page=1&limit=20
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 200`**
```json
{
  "items": [...],
  "totalCount": 3,
  "page": 1,
  "totalPages": 1,
  "limit": 20
}
```

---

### TC-INV-06 — Filter Items by ABC Category

```http
GET /api/inventory/items?abcCategory=A
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** Only `Chicken Breast` in response (the only A-item created so far)

---

### TC-INV-07 — Filter Items Below PAR

```http
GET /api/inventory/items?belowPar=true
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** Returns items where `current_stock < par_level`

**Setup first:** Update Chicken Breast stock to 8 (below PAR of 10):
```http
PATCH /api/inventory/items/<ITEM_ID_CHICKEN>
Authorization: Bearer <OWNER_TOKEN>

{ "currentStock": 8 }
```

Then run filter — Chicken Breast should appear.

---

### TC-INV-08 — Lookup by Barcode

```http
GET /api/inventory/items?barcode=8901234567890
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 200`** — Returns Chicken Breast item

---

### TC-INV-09 — Update Item Fields

```http
PATCH /api/inventory/items/<ITEM_ID_CHICKEN>
Authorization: Bearer <OWNER_TOKEN>

{
  "parLevel": 12,
  "storageLocation": "FREEZER",
  "avgCost": 330.00
}
```

**Expected: `HTTP 200`** — Updated fields reflected, `version` incremented to 2

**Database:**
```sql
SELECT par_level, storage_location, avg_cost, version
FROM inventory_items WHERE id = '<ITEM_ID_CHICKEN>';
-- par_level = 12, storage_location = 'FREEZER', avg_cost = 330.00, version = 2
```

---

### TC-INV-10 — Soft Delete Item

```http
DELETE /api/inventory/items/<ITEM_ID_OIL>
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 200`**

**Verification:**
```sql
SELECT name, deleted_at FROM inventory_items WHERE id = '<ITEM_ID_OIL>';
-- deleted_at IS NOT NULL (row preserved)
```

```http
GET /api/inventory/items/<ITEM_ID_OIL>
Authorization: Bearer <OWNER_TOKEN>
```
**Expected: `HTTP 404`** — deleted item not accessible

```http
GET /api/inventory/items
Authorization: Bearer <OWNER_TOKEN>
```
**Expected:** Cooking Oil NOT in list

---

### TC-INV-11 — Kitchen Staff Cannot Create Items

```http
POST /api/inventory/items
Authorization: Bearer <STAFF_TOKEN>

{ "name": "Garlic", "category": "Produce" }
```

**Expected: `HTTP 403`**

---

### TC-INV-12 — Create Item With Negative Stock — Validation Error

```http
POST /api/inventory/items

{ "name": "Test", "currentStock": -5, "purchaseUnit": "kg" }
```

**Expected: `HTTP 400`**
```json
{
  "error": "VALIDATION_ERROR",
  "fields": [{ "field": "currentStock", "message": "Must be zero or positive" }]
}
```

---

### TC-INV-13 — Create Item With Zero Conversion Factor — Validation Error

```http
POST /api/inventory/items

{
  "name": "Test",
  "conversionFactors": { "purchaseToRecipe": 0 }
}
```

**Expected: `HTTP 400`** — conversion factor cannot be zero (division by zero protection)

---

### TC-INV-14 — SQL Injection in Item Name

```http
POST /api/inventory/items

{
  "name": "'; DELETE FROM inventory_items; --",
  "category": "Produce",
  "purchaseUnit": "kg",
  "currentStock": 5
}
```

**Expected: `HTTP 201`** — Stored literally. Table still intact after.

---

### TC-INV-15 — Maximum Pagination Limit Enforced

```http
GET /api/inventory/items?limit=10000
```

**Expected:** Response uses max allowed limit (e.g., 200 or 500), not 10,000

---

## 2. ABC Classification

### TC-INV-16 — Auto-Classification Based on Cost Contribution

**Context:** System should auto-classify items if abcCategory not provided, based on cost contribution to total COGS. Test with the classification engine endpoint:

```http
POST /api/inventory/items/classify
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** Returns suggested ABC category for each unclassified item

---

### TC-INV-17 — Manual Override Preserved

```http
PATCH /api/inventory/items/<ITEM_ID_TOMATO>

{ "abcCategory": "B", "abcOverrideReason": "Seasonal high-value item during wedding season" }
```

**Expected: `HTTP 200`** — Manual override flag set, auto-classification won't override it

---

### TC-INV-18 — Cycle Count Filtered to A-Items Only

```http
POST /api/inventory/counts

{
  "date": "2026-05-04",
  "countType": "CYCLE",
  "abcCategoryFilter": "A"
}
```

**Expected:** Count sheet contains ONLY A-classified items (`Chicken Breast`)

---

## 3. Supplier Management

### TC-INV-20 — Create Supplier with Full Details

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

**Expected: `HTTP 201`** — Save: `SUPPLIER_ID`

---

### TC-INV-21 — Get Suppliers for a Specific Item

```http
GET /api/inventory/suppliers?itemId=<ITEM_ID_CHICKEN>
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:** Returns Metro Cash & Carry with negotiated price of ₹315.00

---

### TC-INV-22 — Update Negotiated Price

```http
PATCH /api/inventory/suppliers/<SUPPLIER_ID>/prices

{
  "itemId": "<ITEM_ID_CHICKEN>",
  "price": 325.00
}
```

**Expected: `HTTP 200`** — Price updated, audit log created

---

### TC-INV-23 — Delete Supplier with Open POs Should Warn

**Precondition:** PO exists for this supplier (TC-INV-40)

```http
DELETE /api/inventory/suppliers/<SUPPLIER_ID>
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 422`**
```json
{
  "error": "SUPPLIER_HAS_OPEN_POS",
  "message": "Cannot delete supplier with 1 open purchase order(s). Close or cancel POs first."
}
```

---

### TC-INV-24 — Supplier with Lead Time Zero

```http
POST /api/inventory/suppliers

{
  "name": "Local Market",
  "leadTimeDays": 0,
  "paymentTerms": "IMMEDIATE"
}
```

**Expected: `HTTP 201`** — Lead time of 0 is valid (same-day supplier)

---

## 4. PAR Level & Reorder Alerts

### TC-INV-30 — Stock Exactly at PAR — No Alert

**Setup:** Set Chicken Breast stock to exactly 10 (equal to PAR of 10)

```http
PATCH /api/inventory/items/<ITEM_ID_CHICKEN>
{ "currentStock": 10 }
```

**Expected:** No `STOCK_LOW` notification created

```sql
SELECT COUNT(*) FROM notifications
WHERE type = 'STOCK_LOW' AND entity_id = '<ITEM_ID_CHICKEN>'
  AND created_at > NOW() - INTERVAL '1 minute';
-- Expect: 0
```

---

### TC-INV-31 — Stock Falls 1 Unit Below PAR — Alert Fires

```http
PATCH /api/inventory/items/<ITEM_ID_CHICKEN>
{ "currentStock": 9 }
```

**Expected:** `STOCK_LOW` notification created within 30 seconds

```sql
SELECT type, priority, message FROM notifications
WHERE type = 'STOCK_LOW' AND tenant_id = '<TENANT_ID>'
ORDER BY created_at DESC LIMIT 1;
-- priority = 'CRITICAL'
-- message contains "Chicken Breast"
```

---

### TC-INV-32 — Stock at Zero — Alert Fires with Critical Priority

```http
PATCH /api/inventory/items/<ITEM_ID_CHICKEN>
{ "currentStock": 0 }
```

**Expected:** `STOCK_LOW` notification with `priority: CRITICAL` and message indicating zero stock

---

### TC-INV-33 — PAR = 0 Disables Reorder Alert

```http
PATCH /api/inventory/items/<ITEM_ID_TOMATO>
{ "parLevel": 0, "currentStock": 0 }
```

**Expected:** No `STOCK_LOW` notification (PAR=0 means disabled)

---

### TC-INV-34 — Suggest PO When Below PAR

```http
GET /api/inventory/items/below-par
Authorization: Bearer <OWNER_TOKEN>
```

**Expected:**
```json
{
  "belowParItems": [
    {
      "itemId": "<ITEM_ID_CHICKEN>",
      "name": "Chicken Breast",
      "currentStock": 0,
      "parLevel": 10,
      "shortfall": 10,
      "suggestedSupplier": {
        "id": "<SUPPLIER_ID>",
        "name": "Metro Cash & Carry",
        "negotiatedPrice": 315.00
      },
      "suggestedOrderQuantity": 15
    }
  ]
}
```

---

## 5. Purchase Order Lifecycle

### TC-INV-40 — Create Draft PO

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
  "notes": "Weekend prep order"
}
```

**Expected: `HTTP 201`**
```json
{
  "id": "<uuid>",
  "status": "DRAFT",
  "totalAmount": 6680.00,
  "threeWayMatchStatus": "PENDING",
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "orderedQuantity": 20, "unitPrice": 315.00, "lineTotal": 6300.00 },
    { "itemId": "<ITEM_ID_TOMATO>", "orderedQuantity": 10, "unitPrice": 38.00, "lineTotal": 380.00 }
  ]
}
```

**Calculation check:** 20×315 + 10×38 = 6300 + 380 = 6680 ✓

**Save:** `PO_ID`

---

### TC-INV-41 — PO Total Calculation Verification

```sql
SELECT total_amount, 
       (SELECT SUM(ordered_quantity * unit_price) FROM po_line_items WHERE po_id = '<PO_ID>') as calc_total
FROM purchase_orders WHERE id = '<PO_ID>';
-- total_amount must equal calc_total exactly (NUMERIC arithmetic)
```

---

### TC-INV-42 — Send PO (DRAFT → SENT)

```http
POST /api/inventory/purchase-orders/<PO_ID>/send
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 200`**
```json
{ "id": "<PO_ID>", "status": "SENT", "sentAt": "<timestamp>" }
```

---

### TC-INV-43 — Cannot Modify PO in SENT Status

```http
PATCH /api/inventory/purchase-orders/<PO_ID>
Authorization: Bearer <OWNER_TOKEN>

{ "notes": "Updated notes after sending" }
```

**Expected: `HTTP 422`**
```json
{ "error": "PO_IMMUTABLE", "message": "Purchase order cannot be modified after sending" }
```

---

### TC-INV-44 — Cancel PO Before Sending

```http
POST /api/inventory/purchase-orders
...create a new PO...

POST /api/inventory/purchase-orders/<NEW_PO_ID>/cancel
Authorization: Bearer <OWNER_TOKEN>
```

**Expected: `HTTP 200`**, status = `CANCELLED`

---

### TC-INV-45 — PO with Zero Items — Validation Error

```http
POST /api/inventory/purchase-orders

{
  "supplierId": "<SUPPLIER_ID>",
  "items": []
}
```

**Expected: `HTTP 400`** — must have at least 1 line item

---

### TC-INV-46 — PO with Negative Quantity — Validation Error

```http
POST /api/inventory/purchase-orders

{
  "supplierId": "<SUPPLIER_ID>",
  "items": [{ "itemId": "<ITEM_ID_CHICKEN>", "orderedQuantity": -5, "unitPrice": 315.00 }]
}
```

**Expected: `HTTP 400`**

---

### TC-INV-47 — PO Delivery Date in the Past — Warn

```http
POST /api/inventory/purchase-orders

{
  "supplierId": "<SUPPLIER_ID>",
  "expectedDeliveryDate": "2020-01-01",
  "items": [...]
}
```

**Expected:** `HTTP 201` with `warning: "Expected delivery date is in the past"` — or `HTTP 400` (document actual behavior)

---

## 6. Three-Way Match Protocol

### TC-INV-50 — Perfect Three-Way Match

**Step 1 — Receive goods matching PO exactly:**
```http
POST /api/inventory/purchase-orders/<PO_ID>/receive
Authorization: Bearer <MANAGER_TOKEN>
Content-Type: application/json

{
  "receivedDate": "2026-05-06",
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "receivedQuantity": 20, "unit": "kg", "condition": "GOOD", "expiryDate": "2026-05-09" },
    { "itemId": "<ITEM_ID_TOMATO>", "receivedQuantity": 10, "unit": "kg", "condition": "GOOD", "expiryDate": "2026-05-11" }
  ]
}
```

**Step 2 — Submit matching invoice:**
```http
POST /api/inventory/purchase-orders/<PO_ID>/invoice
Authorization: Bearer <MANAGER_TOKEN>

{
  "invoiceNumber": "METRO-2026-4521",
  "invoiceDate": "2026-05-06",
  "invoiceTotal": 6680.00,
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "invoicedQuantity": 20, "invoicePrice": 315.00 },
    { "itemId": "<ITEM_ID_TOMATO>", "invoicedQuantity": 10, "invoicePrice": 38.00 }
  ]
}
```

**Expected:**
```json
{ "threeWayMatchStatus": "MATCHED", "discrepancies": [] }
```

**Database:**
```sql
SELECT three_way_match_status FROM purchase_orders WHERE id = '<PO_ID>';
-- MATCHED

-- Verify stock was updated
SELECT current_stock FROM inventory_items WHERE id = '<ITEM_ID_CHICKEN>';
-- Was 0 before, now 20 (received quantity added)
```

---

### TC-INV-51 — Quantity Short Delivery

```http
POST /api/inventory/purchase-orders/<NEW_PO_ID>/receive

{
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "receivedQuantity": 18, "unit": "kg", "condition": "GOOD" }
  ]
}
```

**Expected:**
```json
{
  "threeWayMatchStatus": "DISCREPANCY",
  "discrepancies": [
    {
      "itemId": "<ITEM_ID_CHICKEN>",
      "type": "QUANTITY_SHORT",
      "orderedQuantity": 20,
      "receivedQuantity": 18,
      "shortfall": 2,
      "shortfallValue": 630.00
    }
  ]
}
```

---

### TC-INV-52 — Price Increase Below 10% Threshold — Warn, Not Alert

```http
POST /api/inventory/purchase-orders/<PO_ID>/invoice

{
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "invoicedQuantity": 20, "invoicePrice": 340.00 }
  ]
}
```

Price change: (340-315)/315 = 7.94% — below 10% threshold

**Expected:** `threeWayMatchStatus = "PARTIAL_MATCH"`, warning logged but no CRITICAL notification

---

### TC-INV-53 — Price Increase Above 10% Threshold — Critical Alert

```http
POST /api/inventory/purchase-orders/<PO_ID>/invoice

{
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "invoicedQuantity": 20, "invoicePrice": 350.00 }
  ]
}
```

Price change: (350-315)/315 = 11.11% — exceeds threshold

**Expected:**
```json
{
  "threeWayMatchStatus": "DISCREPANCY",
  "discrepancies": [
    {
      "type": "PRICE_CHANGE",
      "orderedPrice": 315.00,
      "invoicePrice": 350.00,
      "changePercent": 11.11,
      "alert": "CRITICAL"
    }
  ]
}
```

**Notification:**
```sql
SELECT type, priority FROM notifications
WHERE type = 'PRICE_CHANGE_ALERT' AND tenant_id = '<TENANT_ID>';
-- priority = 'CRITICAL'
```

---

### TC-INV-54 — Goods Exceed Ordered Quantity

```http
POST /api/inventory/purchase-orders/<PO_ID>/receive

{
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "receivedQuantity": 25, "unit": "kg" }
  ]
}
```

Ordered 20, received 25.

**Expected:**
```json
{
  "discrepancies": [
    { "type": "QUANTITY_OVERAGE", "orderedQuantity": 20, "receivedQuantity": 25, "overage": 5 }
  ]
}
```

---

### TC-INV-55 — Item on Invoice Not in PO

```http
POST /api/inventory/purchase-orders/<PO_ID>/invoice

{
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "invoicedQuantity": 20, "invoicePrice": 315.00 },
    { "itemId": "<ITEM_ID_TOMATO>", "invoicedQuantity": 10, "invoicePrice": 38.00 },
    { "itemName": "Green Chilli", "invoicedQuantity": 2, "invoicePrice": 120.00 }
  ]
}
```

**Expected:**
```json
{
  "discrepancies": [
    { "type": "ITEM_NOT_IN_PO", "itemName": "Green Chilli", "invoicedAmount": 240.00 }
  ]
}
```

---

### TC-INV-56 — Duplicate Invoice Number for Same Supplier

```http
POST /api/inventory/purchase-orders/<SECOND_PO_ID>/invoice

{
  "invoiceNumber": "METRO-2026-4521",
  "supplierId": "<SUPPLIER_ID>"
}
```

**Expected: `HTTP 409`**
```json
{ "error": "DUPLICATE_INVOICE", "message": "Invoice METRO-2026-4521 from this supplier was already recorded" }
```

---

## 7. FEFO Stock & Expiry Tracking

### TC-INV-60 — Add Multiple Batches with Different Expiry Dates

```http
POST /api/inventory/items/<ITEM_ID_CHICKEN>/stock-entries
Authorization: Bearer <MANAGER_TOKEN>

{
  "quantity": 5,
  "unit": "kg",
  "expiryDate": "2026-05-07",
  "batchNumber": "BATCH-OLD",
  "storageLocation": "WALK_IN_FRIDGE",
  "receivedDate": "2026-05-04"
}
```

```http
POST /api/inventory/items/<ITEM_ID_CHICKEN>/stock-entries

{
  "quantity": 15,
  "unit": "kg",
  "expiryDate": "2026-05-10",
  "batchNumber": "BATCH-NEW",
  "storageLocation": "WALK_IN_FRIDGE",
  "receivedDate": "2026-05-06"
}
```

---

### TC-INV-61 — FEFO: Earliest Expiry Batch Listed First

```http
GET /api/inventory/items/<ITEM_ID_CHICKEN>/stock-entries?sort=expiryDate&order=asc
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected:** BATCH-OLD (expiry May 7) appears before BATCH-NEW (expiry May 10)

---

### TC-INV-62 — Expiry Alert Fires 2 Days Before Expiry

**Setup:** Stock entry with expiry = today + 2 days

**Expected:** `EXPIRY_ALERT` notification created:
```json
{
  "type": "EXPIRY_ALERT",
  "priority": "CRITICAL",
  "message": "Chicken Breast (BATCH-OLD): 5 kg expires in 2 days (2026-05-07)"
}
```

---

### TC-INV-63 — Expiry Alert Does NOT Fire 3 Days Before

**Setup:** Stock entry with expiry = today + 3 days

**Expected:** No `EXPIRY_ALERT` notification (threshold is 2 days)

---

### TC-INV-64 — Item Expired Today — Critical Alert

**Setup:** Stock entry with expiry = today

**Expected:** `EXPIRY_ALERT` with `priority: CRITICAL` and message "expires TODAY"

---

### TC-INV-65 — Configurable Expiry Threshold

**Change threshold to 3 days:**
```http
PATCH /api/auth/tenant/settings
Authorization: Bearer <OWNER_TOKEN>

{ "expiryAlertDays": 3 }
```

**Create stock entry expiring in 3 days:**
Expected: Alert now fires at 3 days (not just 2)

---

### TC-INV-66 — Stock Transfer Between Locations Updates Both

**Transfer 5kg Chicken from Walk-In Fridge to Kitchen:**
```http
POST /api/inventory/stock-transfers
Authorization: Bearer <MANAGER_TOKEN>

{
  "fromLocation": "WALK_IN_FRIDGE",
  "toLocation": "HOT_LINE_KITCHEN",
  "itemId": "<ITEM_ID_CHICKEN>",
  "quantity": 5,
  "unit": "kg"
}
```

**Verification:**
```sql
SELECT SUM(quantity) FROM stock_entries
WHERE item_id = '<ITEM_ID_CHICKEN>' AND location = 'WALK_IN_FRIDGE';
-- Should be 5 less than before

SELECT SUM(quantity) FROM stock_entries
WHERE item_id = '<ITEM_ID_CHICKEN>' AND location = 'HOT_LINE_KITCHEN';
-- Should be 5
```

---

### TC-INV-67 — Transfer More Than Available Stock

```http
POST /api/inventory/stock-transfers

{
  "fromLocation": "WALK_IN_FRIDGE",
  "toLocation": "HOT_LINE_KITCHEN",
  "itemId": "<ITEM_ID_CHICKEN>",
  "quantity": 1000,
  "unit": "kg"
}
```

**Expected: `HTTP 422`**
```json
{ "error": "INSUFFICIENT_STOCK", "message": "Only 20 kg available in Walk-in Fridge" }
```

---

## 8. Waste Logging

### TC-INV-70 — Log Waste for Each of 7 Reason Codes

Test each reason code individually:

**Spoilage:**
```http
POST /api/inventory/waste-logs
Authorization: Bearer <STAFF_TOKEN>

{
  "date": "2026-05-04",
  "time": "14:30:00",
  "itemId": "<ITEM_ID_TOMATO>",
  "quantity": 2,
  "unit": "kg",
  "reason": "SPOILAGE",
  "station": "COLD_STORAGE",
  "estimatedCost": 80.00,
  "notes": "Overripe — not usable"
}
```

**Expected: `HTTP 201`** with `reason: "SPOILAGE"`

Repeat for: `PREP_WASTE`, `OVERPRODUCTION`, `COOKING_ERROR`, `PLATE_WASTE`, `CONTAMINATION`, `INCORRECT_ORDER`

---

### TC-INV-71 — Waste Log Deducts from Inventory

**Before log:** Check Tomato stock = 12
**After SPOILAGE log of 2 kg:**
```sql
SELECT current_stock FROM inventory_items WHERE id = '<ITEM_ID_TOMATO>';
-- Expect: 10 (12 - 2)
```

---

### TC-INV-72 — Waste Log with Photo

```http
POST /api/inventory/waste-logs
Content-Type: multipart/form-data

itemId: <ITEM_ID_TOMATO>
quantity: 1
unit: kg
reason: SPOILAGE
photo: [binary image]
```

**Expected: `HTTP 201`** with `photoVerificationUrl` set

---

### TC-INV-73 — Kitchen Staff CAN Log Waste

```http
POST /api/inventory/waste-logs
Authorization: Bearer <STAFF_TOKEN>

{
  "itemId": "<ITEM_ID_TOMATO>",
  "quantity": 0.5,
  "reason": "PREP_WASTE"
}
```

**Expected: `HTTP 201`** ✓

---

### TC-INV-74 — Kitchen Staff CANNOT Delete Waste Log

```http
DELETE /api/inventory/waste-logs/<wasteLogId>
Authorization: Bearer <STAFF_TOKEN>
```

**Expected: `HTTP 403`**

---

### TC-INV-75 — Waste Log Quantity > Current Stock — Warn or Block

```http
POST /api/inventory/waste-logs

{
  "itemId": "<ITEM_ID_TOMATO>",
  "quantity": 999,
  "reason": "SPOILAGE"
}
```

**Expected:** Either `HTTP 422` (block) or `HTTP 201` with `warning: "Waste quantity exceeds current stock"` — document behavior

---

### TC-INV-76 — Weekly Waste Report

```http
GET /api/inventory/waste-logs/report?period=weekly&weekOf=2026-05-04
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected:**
```json
{
  "period": "2026-W19",
  "totalWasteCost": 80.00,
  "byReason": {
    "SPOILAGE": 80.00,
    "PREP_WASTE": 0,
    "OVERPRODUCTION": 0
  },
  "byStation": { "COLD_STORAGE": 80.00 },
  "byDayOfWeek": { "MONDAY": 80.00 },
  "topWastedItems": [
    { "itemId": "<ITEM_ID_TOMATO>", "name": "Tomato", "wasteCost": 80.00, "wasteKg": 2.0 }
  ]
}
```

---

## 9. Recipe Costing & Menu Engineering

### TC-INV-80 — Create Recipe with Food Cost Calculation

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

**Calculation:**
- Tomato: 100g × (1+0.10 waste) = 110g × (₹40/1000) = ₹4.40
- Rice Batter: 200g × ₹0.05 = ₹10.00
- Potato Filling: 150g × ₹0.04 = ₹6.00
- Total recipe cost = ₹20.40
- Food Cost % = (20.40 / 180) × 100 = 11.33%

**Expected Response: `HTTP 201`**
```json
{
  "id": "<uuid>",
  "name": "Masala Dosa",
  "menuPrice": 180.00,
  "totalCost": 20.40,
  "foodCostPercent": 11.33,
  "menuMatrixCategory": "STAR"
}
```

**Save:** `RECIPE_ID_DOSA`

---

### TC-INV-81 — Food Cost % Benchmark Status

| Food Cost % | Expected Status |
|---|---|
| 11% | below target — GREEN or special flag |
| 30% | GREEN (within 28–35%) |
| 38% | RED — alert |
| 50% | RED — CRITICAL alert |

Test by creating recipes with different menu prices to hit each range.

---

### TC-INV-82 — Recipe Cost Updates When Supplier Price Changes

**Update Tomato avg cost from ₹40 to ₹80:**
```http
PATCH /api/inventory/items/<ITEM_ID_TOMATO>
{ "avgCost": 80.00 }
```

**Expected:** GET /api/inventory/recipes/<RECIPE_ID_DOSA> returns updated `totalCost` and `foodCostPercent`

New Tomato cost: 110g × (₹80/1000) = ₹8.80
New total: ₹8.80 + ₹10 + ₹6 = ₹24.80
New food cost %: (24.80/180) × 100 = 13.78%

---

### TC-INV-83 — Recipe with Zero Menu Price — Division by Zero Protection

```http
POST /api/inventory/recipes

{
  "name": "Staff Meal",
  "menuPrice": 0,
  "ingredients": [...]
}
```

**Expected:** `HTTP 400` or food cost % returned as null/N/A — NOT a division by zero error

---

### TC-INV-84 — Menu Engineering Matrix Classification

Create 4 recipes representing each quadrant:

**STAR** (high margin + high popularity):
```http
PATCH /api/inventory/recipes/<id>
{ "popularityScore": 90, "profitMargin": 70 }
```
Expected: `menuMatrixCategory: "STAR"`

**PLOWHORSE** (low margin + high popularity):
```json
{ "popularityScore": 85, "profitMargin": 20 }
```
Expected: `"PLOWHORSE"`

**PUZZLE** (high margin + low popularity):
```json
{ "popularityScore": 15, "profitMargin": 75 }
```
Expected: `"PUZZLE"`

**DOG** (low margin + low popularity):
```json
{ "popularityScore": 10, "profitMargin": 15 }
```
Expected: `"DOG"`

---

### TC-INV-85 — Recipe with Sub-Recipe

```http
POST /api/inventory/recipes

{
  "name": "Masala Paste",
  "isSubRecipe": true,
  "ingredients": [
    { "itemId": "<ITEM_ID_TOMATO>", "quantity": 200, "unit": "grams" },
    { "name": "Onion", "quantity": 150, "unit": "grams", "costPerGram": 0.03 }
  ]
}
```

**Use Masala Paste in Masala Dosa:**
```http
PATCH /api/inventory/recipes/<RECIPE_ID_DOSA>

{
  "ingredients": [
    { "subRecipeId": "<masala_paste_id>", "quantity": 100, "unit": "grams" }
  ]
}
```

**Expected:** Cost of Masala Dosa includes cost of Masala Paste proportionally

---

## 10. Stock Counts — Full & Cycle

### TC-INV-90 — Create and Complete Full Count

**Start count:**
```http
POST /api/inventory/counts
Authorization: Bearer <MANAGER_TOKEN>

{
  "date": "2026-05-04",
  "countType": "FULL",
  "countedBy": "<managerId>"
}
```

**Submit counts:**
```http
POST /api/inventory/counts/<countId>/submit

{
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "countedQuantity": 18, "unit": "kg" },
    { "itemId": "<ITEM_ID_TOMATO>", "countedQuantity": 9, "unit": "kg" }
  ]
}
```

**Expected Variance Report:**
```json
{
  "variances": [
    {
      "itemId": "<ITEM_ID_CHICKEN>",
      "expectedQuantity": 20,
      "countedQuantity": 18,
      "variance": -2,
      "varianceCost": -640.00,
      "requiresExplanation": true
    }
  ]
}
```

**Explanation and close:**
```http
POST /api/inventory/counts/<countId>/close

{
  "varianceExplanations": [
    { "itemId": "<ITEM_ID_CHICKEN>", "explanation": "2 kg used for staff meal pre-service" }
  ]
}
```

**Expected: `HTTP 200`**, status = `COMPLETED`

---

### TC-INV-91 — Two Simultaneous Counts — Warn

```http
POST /api/inventory/counts (second count while first is IN_PROGRESS)
```

**Expected:** `HTTP 422` or `HTTP 200` with `warning: "A count is already in progress"` — document behavior

---

### TC-INV-92 — Close Count Without Explanation for High-Variance Item

```http
POST /api/inventory/counts/<countId>/close

{
  "varianceExplanations": []
}
```

**Expected: `HTTP 422`**
```json
{
  "error": "EXPLANATION_REQUIRED",
  "message": "Variance explanation required for: Chicken Breast (variance: ₹640)"
}
```

---

### TC-INV-93 — Count Sheet Sorted by Storage Location

```http
GET /api/inventory/counts/<countId>/sheet?sort=storageLocation
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected:** Items grouped by location: WALK_IN_FRIDGE items first, then DRY_STORAGE, then FREEZER

---

## 11. Kitchen Transfers & KOT

### TC-INV-100 — Transfer with KOT Reference

```http
POST /api/inventory/stock-transfers
Authorization: Bearer <MANAGER_TOKEN>

{
  "fromLocation": "WALK_IN_FRIDGE",
  "toLocation": "HOT_LINE_KITCHEN",
  "date": "2026-05-07",
  "kotReference": "KOT-20260507-001",
  "items": [
    { "itemId": "<ITEM_ID_CHICKEN>", "quantity": 5, "unit": "kg" }
  ],
  "transferredBy": "<managerId>"
}
```

**Expected: `HTTP 201`** with `kotReference` stored

---

### TC-INV-101 — View All Transfers for Date Range

```http
GET /api/inventory/stock-transfers?dateFrom=2026-05-01&dateTo=2026-05-07
Authorization: Bearer <MANAGER_TOKEN>
```

**Expected:** All transfer events with KOT references visible

---

## 12. Actual vs. Theoretical Usage (AvT)

> **[PARTIAL — NO DEDICATED AvT ENDPOINT]**  
> The codebase audit found that AvT variance logic exists inside `DailySalesReportService` (finance-service) rather than as a dedicated `/api/inventory/usage-variance` endpoint. The endpoint `POST /api/inventory/usage-variance` likely returns 404.  
> **What to implement:** A dedicated AvT endpoint in inventory-service (or expose it via finance-service) that accepts `recipeId + portionsServed + actualUsage[]`, computes theoretical usage from the recipe's ingredient quantities, calculates variance %, applies thresholds (ACCEPTABLE <5%, ALERT ≥5%, CRITICAL ≥20%), and fires a notification on ALERT/CRITICAL.  
> **Workaround while not implemented:** AvT data may be readable from `GET /api/finance/dsr/:date` response body under a `usageVariance` field — check this endpoint first before declaring a full gap.

---

### TC-INV-110 — AvT Within Acceptable Threshold (2–5%)

> **[PARTIAL]** Test via DSR response as a workaround if dedicated endpoint is absent. After implementation, test against `/api/inventory/usage-variance`.

```http
POST /api/inventory/usage-variance
Authorization: Bearer <MANAGER_TOKEN>

{
  "date": "2026-05-07",
  "recipeId": "<RECIPE_ID_DOSA>",
  "portionsServed": 10,
  "actualUsage": [
    { "itemId": "<ITEM_ID_TOMATO>", "actualQuantityGrams": 1050 }
  ]
}
```

**Theoretical:** 10 portions × 110g (with waste factor) = 1100g
**Actual:** 1050g
**Variance:** -50g = -4.5% (within threshold)

**Expected after implementation:** `HTTP 200`, `variance: -4.5%`, `status: "ACCEPTABLE"`

---

### TC-INV-111 — AvT Exceeds 5% Threshold — Alert

> **[PARTIAL]** Same caveat as TC-INV-110 — endpoint may not exist yet.

```http
POST /api/inventory/usage-variance

{
  "portionsServed": 10,
  "actualUsage": [
    { "itemId": "<ITEM_ID_TOMATO>", "actualQuantityGrams": 1320 }
  ]
}
```

**Theoretical:** 1100g, **Actual:** 1320g, **Variance:** +20%

**Expected after implementation:** `status: "ALERT"`, investigation notification sent

---

### TC-INV-112 — AvT Report by Date Range

> **[PARTIAL]** This aggregate report endpoint may not exist yet.

```http
GET /api/inventory/usage-variance/report?dateFrom=2026-05-01&dateTo=2026-05-07&recipeId=<RECIPE_ID_DOSA>
```

**Expected after implementation:** Week's variance history per recipe per ingredient

---

## 13. Unit Conversion & Precision

### TC-INV-120 — Correct Conversion: Purchase → Recipe Unit

Item purchased in kg, used in grams. Conversion factor = 1000.

**Scenario:** 5 kg purchased. Recipe requires 500g.

```http
POST /api/inventory/usage-variance

{
  "actualUsage": [
    { "itemId": "<ITEM_ID_TOMATO>", "actualQuantityGrams": 500 }
  ]
}
```

**Expected:** System correctly interprets 500g = 0.5kg deduction from stock

```sql
SELECT current_stock FROM inventory_items WHERE id = '<ITEM_ID_TOMATO>';
-- Reduced by 0.5 (from 10 to 9.5)
```

---

### TC-INV-121 — Monetary Precision: No Float Drift

```sql
-- Run 100 expense entries each ₹1234.56
-- Sum should be exactly ₹123456.00
SELECT SUM(avg_cost) FROM inventory_items WHERE tenant_id = '<TENANT_ID>';
-- Verify: SUM is exact NUMERIC, not floating point approximation
```

---

## GO/NO-GO Checklist — Inventory Epic

| Test | Required | Status |
|---|---|---|
| TC-INV-01 Item creation | MANDATORY | ✅ Implemented |
| TC-INV-10 Soft delete enforced | MANDATORY | ✅ Implemented |
| TC-INV-31 PAR alert fires | MANDATORY | ✅ Implemented |
| TC-INV-40 PO creation | MANDATORY | ✅ Implemented |
| TC-INV-50 Three-way match: MATCHED | MANDATORY | ✅ Implemented |
| TC-INV-53 Price change alert > 10% | MANDATORY | ✅ Implemented |
| TC-INV-62 Expiry alert 2 days | MANDATORY | ✅ Implemented |
| TC-INV-70 All 7 waste reason codes | MANDATORY | ✅ Implemented |
| TC-INV-80 Recipe food cost % calc | MANDATORY | ✅ Implemented |
| TC-INV-90 Full count + variance | MANDATORY | ✅ Implemented |
| TC-INV-110 AvT variance endpoint | MANDATORY | ⚠️ PARTIAL — endpoint may not exist |
| TC-INV-14 SQL injection safe | MANDATORY | ✅ Implemented |

### Gaps to Implement (Inventory Epic)

| # | Feature | What to Build | Effort |
|---|---|---|---|
| G-INV-01 | **Dedicated AvT endpoint** | `POST /api/inventory/usage-variance` — accepts `recipeId, portionsServed, actualUsage[]`. Fetch recipe's theoretical ingredient quantities, compute variance per ingredient, apply thresholds (ACCEPTABLE <5%, ALERT 5–20%, CRITICAL >20%), fire notification on ALERT+. Also add `GET /api/inventory/usage-variance/report` for date-range history. | Medium |
