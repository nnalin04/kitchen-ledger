# EPIC: INV — Inventory Service

**Phase:** 2 | **Weeks:** 4–9
**Service:** `services/inventory-service` (Java 21 + Spring Boot 4.0.5) | **Port:** 8082
**Goal:** Complete inventory lifecycle — item catalog with ABC classification, supplier management, purchase orders, stock receiving with three-way match, FEFO tracking, waste logging, stock counting, recipe costing, menu engineering.
**Depends on:** INFRA-3 (skeleton), AUTH complete (for tenant context), GW complete (routing)
**Blocks:** AI Service (needs item catalog), Finance Service (needs item cost data), Mobile offline sync

---

## INV-1: Database Schema Migration

- [ ] Write `V1__inventory_schema.sql` (exact from TRD §3.2). Tables in creation order:
  - `inventory_categories` — id, tenant_id, name, parent_id (self-ref FK), sort_order; UNIQUE(tenant_id, name)
  - `suppliers` — id, tenant_id, name, contact_name, email, phone, whatsapp, address, payment_terms_days, lead_time_days, delivery_schedule JSONB, is_active, soft-delete; index on (tenant_id) WHERE deleted_at IS NULL
  - `inventory_items` — id, tenant_id, category_id FK, name, sku, barcode, abc_category CHAR(1) CHECK('A','B','C'), abc_override BOOLEAN, purchase_unit, purchase_unit_qty, recipe_unit, count_unit, purchase_to_recipe_factor, recipe_to_count_factor, current_stock NUMERIC(12,4), par_level, reorder_quantity, safety_stock, avg_cost NUMERIC(12,4), last_purchase_price, price_alert_threshold, is_perishable, shelf_life_days, expiry_alert_days, storage_location, primary_supplier_id FK, is_active, version INT (optimistic lock), soft-delete; UNIQUE index on (tenant_id, LOWER(name)) WHERE deleted_at IS NULL
  - `inventory_item_suppliers` — item/supplier link with unit_price, is_preferred; UNIQUE(item_id, supplier_id)
  - `purchase_orders` — id, tenant_id, po_number, supplier_id FK, status CHECK('draft','sent','partial','received','closed','cancelled'), order_date, expected/actual delivery dates, totals NUMERIC(12,2), sent_via, sent_at, created_by, received_by; UNIQUE(tenant_id, po_number)
  - `purchase_order_items` — ordered_quantity, unit_price, line_total GENERATED ALWAYS AS (ROUND(qty*price,2)) STORED, received_quantity, invoice_unit_price, discrepancy_notes
  - `stock_receipts` — id, tenant_id, purchase_order_id FK, supplier_id FK, receipt_date, invoice_number, invoice_date, invoice_amount, invoice_image_url, three_way_match_status CHECK('pending','matched','discrepancy','approved'), received_by, is_confirmed, confirmed_at
  - `stock_receipt_items` — expected_quantity, received_quantity, unit_cost, expiry_date, batch_number, storage_location, condition CHECK('good','damaged','rejected')
  - `inventory_movements` — **append-only ledger**: id, tenant_id, inventory_item_id FK, movement_type CHECK('receipt','waste','transfer_out','transfer_in','count_adjust','opening_stock','void'), quantity_delta NUMERIC(12,4), unit, unit_cost, reference_id UUID, reference_type VARCHAR, performed_by; index on (item_id, created_at DESC)
  - `waste_logs` — id, tenant_id, item_id FK, logged_at, quantity, unit, reason CHECK('spoilage','expiration','prep_waste','overproduction','cooking_error','plate_waste','contamination','incorrect_order'), station, estimated_cost, photo_url, notes, logged_by, movement_id FK
  - `inventory_counts` — id, tenant_id, count_type CHECK('full','cycle'), abc_filter CHAR(1), status CHECK('in_progress','completed','verified'), count_date, started_at, completed_at, verified_at, counted_by, verified_by, total_variance_cost
  - `inventory_count_items` — expected_quantity, counted_quantity, unit_cost, variance_quantity GENERATED ALWAYS AS (counted-expected) STORED, variance_cost, counted_at
  - `stock_transfers` + `stock_transfer_items`
  - `recipes` — id, tenant_id, name, category, menu_price NUMERIC(10,2), serving_size, prep_time_minutes, cook_time_minutes, yield_percent, total_cost NUMERIC(10,4), food_cost_percent NUMERIC(5,2), menu_matrix_category CHECK('star','plowhorse','puzzle','dog'), soft-delete
  - `recipe_ingredients` — recipe_id FK, inventory_item_id FK, sub_recipe_id FK (self-ref), quantity, unit, waste_percent, unit_cost, line_cost; CONSTRAINT: exactly one of item_id or sub_recipe_id must be non-null
  - RLS enable + `tenant_isolation` policy on ALL tables
- [ ] **Test:** Migration applies cleanly. RLS: SET app.current_tenant_id='A' → rows for tenant B not visible.

---

## INV-2: JPA Entities, Repositories & DTOs

- [ ] Create all 14 JPA entities with exact field types matching schema
- [ ] `InventoryItem.java` — `@Version` on `version` field, ABC category as `@Enumerated(STRING)`
- [ ] `InventoryMovement.java` — no `@PreUpdate`, no delete operations in repository (append-only enforced)
- [ ] `RecipeIngredient.java` — XOR constraint enforced at entity level with `@AssertTrue` validation
- [ ] Repositories with custom JPQL queries:
  - `InventoryItemRepository` — `existsByTenantIdAndNameIgnoreCase`, `findByTenantIdAndCurrentStockLessThanEqualParLevel`, `findExpiringItems`
  - `InventoryMovementRepository` — `findByInventoryItemIdOrderByCreatedAtDesc`
  - `RecipeIngredientRepository` — `findByInventoryItemId` (to find all recipes using an item)
- [ ] Request DTOs: `CreateInventoryItemRequest`, `UpdateInventoryItemRequest`, `CreateWasteLogRequest`, `StartInventoryCountRequest`, `UpdateCountItemRequest`, `CreatePurchaseOrderRequest`, `ConfirmReceiptRequest`, `CreateRecipeRequest`
- [ ] Response DTOs: `InventoryItemResponse`, `InventoryItemDetailResponse` (includes recent movements + supplier pricing), `WasteLogResponse`, `PurchaseOrderResponse`, `StockReceiptResponse`, `RecipeResponse`
- [ ] MapStruct mappers for each entity → response DTO
- [ ] **Test:** `@DataJpaTest` — save InventoryItem, append InventoryMovement, verify append-only (no update/delete queries in repo)

---

## INV-3: Item CRUD & Category Management

- [ ] `InventoryItemService.java`:
  - `createItem(tenantId, userId, request)` — case-insensitive name uniqueness check, validate category belongs to tenant, save, write audit log `inventory.item.created`
  - `updateItem(tenantId, itemId, userId, request)` — optimistic lock via `@Version` (retry on `OptimisticLockingFailureException`), audit log on price/PAR changes
  - `softDelete(tenantId, itemId, userId)` — set `deleted_at`, check no open POs reference this item
  - `listItems(filter)` — paginated, filters: search (LOWER name LIKE), abc_category, low_stock_only (current_stock ≤ par_level), storage_location
  - `getByBarcode(tenantId, barcode)` — exact match on barcode field
  - `bulkImport(tenantId, userId, csvFile)` — parse CSV, validate all rows in memory, batch insert via `saveAll()`, rollback entire batch on any validation failure
  - `setOpeningStock(tenantId, userId, items[])` — set current_stock for multiple items, append `opening_stock` movements
- [ ] `InventoryItemController.java` with `@RequiresRole` annotations per TRD §3.4
- [ ] `InventoryCategoryService.java` + `InventoryCategoryController.java` — CRUD, categories are per-tenant, parent-child hierarchy
- [ ] `GET /api/inventory/alerts` — returns `{ low_stock: [...items below PAR], expiring: [...perishables expiring within alert days] }`
- [ ] **Test:** Create item → verify persisted. Create duplicate name (case-insensitive) → 409. List with low_stock_only filter → only below-PAR items. Soft delete → item gone from list.

---

## INV-4: Supplier Management

- [ ] `SupplierService.java` + `SupplierController.java`:
  - Full CRUD with soft delete
  - `getSupplierItems(tenantId, supplierId)` — items linked via `inventory_item_suppliers`
- [ ] `ItemSupplierService.java`:
  - `POST /api/inventory/items/{id}/suppliers` — link item to supplier with unit_price, is_preferred; only one is_preferred per item
  - `PATCH /api/inventory/items/{id}/suppliers/{supplier_id}` — update price; if price changes beyond `price_alert_threshold`, log to audit
  - `DELETE /api/inventory/items/{id}/suppliers/{supplier_id}` — unlink (cannot unlink preferred if only supplier)
- [ ] **Test:** Create supplier → link to item with price → mark preferred → verify only one preferred per item constraint.

---

## INV-5: Purchase Order Management

- [ ] `PurchaseOrderService.java`:
  - `createPO(tenantId, userId, request)` — generate `po_number` (format: `PO-{YYYYMMDD}-{seq}`), status=DRAFT
  - `updatePO(tenantId, poId, request)` — only allowed on DRAFT status; recalculate subtotal/total
  - `sendPO(tenantId, poId, userId, via)` — `via` = "email" or "whatsapp"; set status=SENT, sent_via, sent_at; publish `inventory.po.sent` event
  - `getSuggestions(tenantId)` — items WHERE current_stock ≤ par_level, group by preferred supplier, return suggested PO per supplier with `reorder_quantity`
  - Soft delete: only DRAFT POs can be deleted
- [ ] `PurchaseOrderController.java`
- [ ] **Test:** Create PO → add items → verify line_total generated column. Send → status=SENT. Suggestions returned for low-stock items.

---

## INV-6: Stock Receipt & Three-Way Match

- [ ] `StockReceiptService.java`:
  - `createReceipt(tenantId, userId, request)` — link to PO if supplied; copy ordered quantities as expected_quantity on items
  - `updateReceipt(tenantId, receiptId, request)` — update line items; auto-compute `three_way_match_status`:
    - MATCHED: all `|received_qty - expected_qty| = 0` AND `|invoice_price - po_price| / po_price <= price_alert_threshold/100`
    - DISCREPANCY: any mismatch
  - `confirmReceipt(tenantId, receiptId, userId)` — **all-or-nothing @Transactional**:
    1. Check not already confirmed
    2. For each line item where condition ≠ REJECTED:
       - Weighted-average cost (BigDecimal, HALF_UP, 4 decimal places — exact formula from TRD §3.3)
       - Update `item.current_stock += received_qty`
       - Update `item.avg_cost` and `item.last_purchase_price`
       - Append `InventoryMovement` (type=RECEIPT)
       - If price delta > `item.price_alert_threshold` → publish price alert event
    3. Publish `inventory.receipt.confirmed` event
    4. Set `is_confirmed=true`, `confirmed_at=NOW()`
  - **TOCTOU protection:** `@Version` on `InventoryItem`; if `OptimisticLockingFailureException`, retry up to 3 times with exponential backoff
- [ ] `StockReceiptController.java`
- [ ] **Test:** Confirm receipt → stock increases. Confirm twice → second throws (already confirmed). Two concurrent confirms on same item → optimistic lock retry. Price spike > 10% → alert event published.

---

## INV-7: Waste Logging

- [ ] `WasteService.java`:
  - `logWaste(tenantId, userId, request)` — @Transactional:
    1. Validate item belongs to tenant + not deleted
    2. Validate quantity ≤ current_stock (warn but don't block — kitchen may report waste retroactively)
    3. Deduct from `item.current_stock`
    4. Append `InventoryMovement` (type=WASTE, negative quantity_delta)
    5. Create `WasteLog` record with `movement_id` ref + estimated_cost = qty × item.avg_cost
  - `getWasteReport(tenantId, startDate, endDate, groupBy)` — aggregate by reason / station / day-of-week; return `{ total_cost, breakdown: [...] }`
- [ ] `WasteController.java` — all roles can POST waste (kitchen_staff included)
- [ ] **Test:** Log waste → stock deducted, movement created, estimated cost = qty × avg_cost. Waste report aggregation by reason sums correctly.

---

## INV-8: Inventory Counting

- [ ] `InventoryCountService.java`:
  - `startCount(tenantId, userId, request)` — create `InventoryCount` in_progress; populate `inventory_count_items` with snapshot of `expected_quantity = current_stock` for all active items (filtered by abc_filter if cycle count)
  - `updateCountItem(tenantId, countId, itemId, countedQty)` — set `counted_quantity`, `counted_at = NOW()`; can call multiple times (overwrites)
  - `completeCount(tenantId, countId, userId)` — calculate `variance_cost = variance_qty × unit_cost` per item; sum `total_variance_cost`; move to COMPLETED status
  - `verifyCount(tenantId, countId, userId)` — [owner/manager] apply adjustments: for each item with non-zero variance → append `count_adjust` movement in ledger + update `item.current_stock`; move to VERIFIED
  - `getVarianceReport(tenantId, countId)` — items with non-zero variance sorted by |variance_cost| DESC
- [ ] `InventoryCountController.java`
- [ ] **Test:** Start count → update 3 items → complete → verify variances calculated. Verify count → movements created, stock updated.

---

## INV-9: Stock Transfers

- [ ] `StockTransferService.java`:
  - `createTransfer(tenantId, userId, request)` — validate quantity available (current_stock ≥ transfer qty), append `transfer_out` movement for source + `transfer_in` movement for destination; `current_stock` remains the same (transfers within same item, different locations)
- [ ] `StockTransferController.java`
- [ ] **Test:** Transfer 5kg → two movements created. Transfer more than available → 422 with clear message.

---

## INV-10: Recipe Costing & Menu Engineering

- [ ] `RecipeService.java`:
  - `createRecipe(tenantId, userId, request)` — save recipe + ingredients, auto-trigger `calculateCost()`
  - `calculateCost(tenantId, recipeId)` — for each ingredient:
    - `line_cost = quantity × (1 + waste_percent/100) × item.avg_cost` (all BigDecimal, HALF_UP)
    - Sub-recipe line_cost = sub_recipe.total_cost × quantity
    - Sum to `total_cost`; `food_cost_percent = (total_cost / menu_price) × 100`
    - Update recipe + all ingredient `unit_cost` and `line_cost` fields
  - `recalculateOnPriceChange(tenantId, itemId)` — find all recipes with this ingredient → `calculateCost()` for each (triggered by receipt confirm event)
  - `getMenuEngineering(tenantId)` — for each recipe, classify:
    - `is_high_profit = food_cost_percent < avg_food_cost_percent_for_tenant`
    - `is_popular` — currently manual input (Phase 2: from POS sales data)
    - Matrix: high-profit+high-pop = star, low-profit+high-pop = plowhorse, high-profit+low-pop = puzzle, low-profit+low-pop = dog
- [ ] `RecipeController.java`
- [ ] `POST /api/inventory/recipes/{id}/calculate-cost` — on-demand recalculation
- [ ] `GET /api/inventory/menu-engineering` — [owner only]
- [ ] **Test:** Create recipe with 3 ingredients → cost calculated correctly. Change ingredient avg_cost → trigger recalculate → food_cost_percent updates. food_cost_percent=40% → above average → plowhorse classification.

---

## INV-11: Scheduled Jobs & ABC Classification

- [ ] `InventoryScheduledJobs.java` (exact schedules from TRD §3.5):
  - `checkLowStockAlerts()` — `@Scheduled(cron = "0 0 * * * *")` every hour:
    - Find all items WHERE `current_stock <= par_level AND par_level IS NOT NULL AND deleted_at IS NULL`
    - Per item: check Redis key `alert:low_stock:{tenantId}:{itemId}` — if present, skip (deduplicate within 4h)
    - Otherwise: set Redis key with 4h TTL, publish `inventory.stock.low` event
  - `checkExpiryAlerts()` — `@Scheduled(cron = "0 0 7 * * *")` 7am daily:
    - Find perishables WHERE `is_perishable=true AND current_stock > 0 AND (TODAY + expiry_alert_days) >= expiry_date`
    - Publish `inventory.stock.expiring` per item
  - `recomputeAbcClassification()` — `@Scheduled(cron = "0 0 2 * * MON")` 2am Monday:
    - For each tenant: sum `avg_cost × current_stock` per item, rank descending
    - Top 20% → A; next 30% → B; remaining → C
    - Bulk `UPDATE inventory_items SET abc_category=? WHERE id=? AND abc_override=FALSE`
- [ ] **Test:** Seed items below PAR → run job → events published. Run job again within 4h → no duplicate events. ABC classification assigns correct categories.

---

## INV-12: Internal & Mobile Sync Endpoints

- [ ] `GET /internal/inventory/items/{id}/cost` — returns `{ id, name, avg_cost, count_unit }` for Finance Service; INTERNAL_SERVICE_SECRET required
- [ ] `GET /internal/inventory/items?names[]=...` — batch item lookup by name array for AI Service
- [ ] `GET /internal/inventory/tenant/{id}/items` — all active items for a tenant (AI OCR catalog matching)
- [ ] `GET /api/inventory/sync/pull` — mobile sync endpoint (exact response from TRD §3.4):
  - Query param: `last_pulled_at` (Unix ms timestamp, optional — omit for full sync)
  - Returns `{ timestamp, changes: { inventory_items: { created, updated, deleted } } }`
  - `InventoryItemSyncResponse` includes only: id, name, abc_category, current_stock, par_level, count_unit, storage_location, is_perishable, avg_cost
- [ ] **Test:** Sync pull without timestamp → all items returned. Update item → sync pull with old timestamp → only that item in `updated`. Soft delete → item in `deleted` array.

---

## INV-13: Tests

- [ ] Unit tests (Mockito):
  - `StockReceiptService` — weighted average cost calculation with various starting stocks
  - `WasteService` — estimated cost calculation, stock deduction
  - `RecipeService` — cost calculation with waste percentages, sub-recipes
  - `InventoryScheduledJobs` — ABC classification boundary conditions (exactly 20% line)
- [ ] Integration tests (Testcontainers PostgreSQL + RabbitMQ):
  - Full receipt confirm: stock increases, weighted avg cost correct, movement created, event published
  - TOCTOU concurrent confirm: optimistic lock retry works, final stock correct
  - Waste log offline sync: post via sync endpoint → waste log created → stock deducted
  - Count cycle: start → update multiple items → complete → verify → movements created
- [ ] Coverage gate: **≥ 80% line coverage**
