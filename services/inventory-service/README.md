# Inventory Service

Manages the full lifecycle of ingredients and stock in a restaurant — from the moment a purchase order is raised with a supplier to the moment stock is used, transferred, or marked as waste. This service is the foundation of KitchenLedger's cost tracking and kitchen operations.

---

## Core Concepts

### Items and Categories

Every ingredient or supply in the restaurant is an **inventory item**. Items belong to categories and have a unit of measure (kg, litre, unit, etc.), a PAR level (the minimum quantity that should always be on hand), and a reorder point that triggers low-stock alerts. Items are classified into ABC categories (A = high value/high velocity, B = moderate, C = low) to help prioritize purchasing decisions.

### Purchase Orders

A **purchase order (PO)** is a formal request sent to a supplier. POs track what was ordered, at what price, and what was actually received. A PO moves through these states:

```
DRAFT → SENT → CONFIRMED → PARTIAL (partial receipt) → RECEIVED → CLOSED
```

It can also be cancelled from DRAFT or SENT. Over-receiving a line item is blocked.

### Stock Receipts and Movements

Every time stock arrives or changes quantity, a **stock movement** is recorded. This creates a complete audit trail of where every unit came from and went. Movements are created automatically by:
- Receiving goods against a purchase order
- Manual stock adjustments (with reason)
- Setting opening stock
- Waste logging
- Stock transfers between locations

### Waste Logging

Waste is logged per item with a quantity, unit, reason category (spoilage, over-preparation, dropped, etc.), and the cost at time of waste. This data feeds into the waste report to help identify which items and days drive the most waste cost.

### Recipes

A **recipe** defines the ingredient quantities needed to produce a menu item. Recipes enable:
- Cost-per-dish calculation (ingredient cost × quantity)
- Theoretical usage tracking (if you sold X dishes, you should have used Y kg of chicken)
- Identifying discrepancies between theoretical and actual usage (a proxy for waste or theft)

---

## API

All endpoints are prefixed with `/api/v1/inventory`.

### Inventory Items

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/items` | All roles | Lists items. Supports search by name, filter by ABC category, and `lowStockOnly=true` to see only items below their reorder point. Paginated. |
| `GET` | `/items/below-par` | All roles | Returns all items currently below their PAR level — useful for quick daily review. |
| `GET` | `/items/:id` | All roles | Returns a single item's details. |
| `POST` | `/items` | `owner`, `manager` | Creates a new inventory item. |
| `PUT` | `/items/:id` | `owner`, `manager` | Updates an item's details, unit, PAR level, or reorder point. |
| `DELETE` | `/items/:id` | `owner`, `manager` | Soft-deletes an item (it is retained in history). |
| `POST` | `/items/:id/adjust-stock` | `owner`, `manager`, `kitchen_staff` | Adjusts the quantity of an item by a delta (positive or negative) with a reason. Creates a stock movement record. |
| `POST` | `/items/:id/opening-stock` | `owner`, `manager` | Sets the initial quantity and unit cost for an item (used during onboarding). |

### Categories

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/categories` | All roles | Lists all item categories for the tenant. |
| `POST` | `/categories` | `owner`, `manager` | Creates a new category. |
| `PUT` | `/categories/:id` | `owner`, `manager` | Renames or updates a category. |
| `DELETE` | `/categories/:id` | `owner`, `manager` | Deletes a category (items in it must be reassigned first). |

### Suppliers

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/suppliers` | All roles | Lists all suppliers with contact details. |
| `GET` | `/suppliers/:id` | All roles | Returns a single supplier's details. |
| `POST` | `/suppliers` | `owner`, `manager` | Adds a new supplier. |
| `PUT` | `/suppliers/:id` | `owner`, `manager` | Updates supplier contact or payment details. |
| `DELETE` | `/suppliers/:id` | `owner`, `manager` | Removes a supplier (only if no open orders reference them). |

### Purchase Orders

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/purchase-orders` | All roles | Lists all POs. Filterable by status. Paginated. |
| `GET` | `/purchase-orders/:id` | All roles | Returns a PO with all line items and their receipt status. |
| `POST` | `/purchase-orders` | `owner`, `manager` | Creates a new PO in DRAFT status with line items. |
| `POST` | `/purchase-orders/:id/send` | `owner`, `manager` | Marks the PO as SENT to the supplier. Accepts a `sent_via` field (email, phone, WhatsApp). |
| `POST` | `/purchase-orders/:id/confirm` | `owner`, `manager` | Confirms the supplier has acknowledged the order. |
| `POST` | `/purchase-orders/:id/receive` | `owner`, `manager` | Records received quantities for each line item. Supports partial receipt — call multiple times as deliveries arrive. |
| `POST` | `/purchase-orders/:id/close` | `owner`, `manager` | Closes a fully-received PO. |
| `POST` | `/purchase-orders/:id/cancel` | `owner`, `manager` | Cancels a DRAFT or SENT PO. |
| `DELETE` | `/purchase-orders/:id` | `owner`, `manager` | Deletes a DRAFT PO that was never sent. |

### Stock Counts

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/stock-counts` | All roles | Lists stock count sessions. |
| `GET` | `/stock-counts/:id` | All roles | Returns a count session with all line entries. |
| `POST` | `/stock-counts` | `owner`, `manager` | Opens a new stock count session. |
| `POST` | `/stock-counts/:id/submit` | `owner`, `manager`, `kitchen_staff` | Submits counted quantities, triggering adjustments to actual stock levels. |

### Stock Transfers

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/stock-transfers` | All roles | Lists stock transfers between storage locations. |
| `POST` | `/stock-transfers` | `owner`, `manager`, `kitchen_staff` | Records a transfer of stock from one location to another. |

### Waste Logs

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/waste-logs` | All roles | Lists waste log entries (paginated). |
| `GET` | `/waste-logs/cost-summary` | All roles | Returns the total waste cost for a given date range (`from` and `to` as ISO timestamps). |
| `POST` | `/waste-logs` | `owner`, `manager`, `kitchen_staff`, `server` | Logs a waste event for an item with quantity, unit, and reason. |

### Recipes

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/recipes` | All roles | Lists all recipes. Sortable and paginated. |
| `GET` | `/recipes/:id` | All roles | Returns a recipe with all ingredient lines and the calculated cost per dish. |
| `POST` | `/recipes` | `owner`, `manager`, `kitchen_staff` | Creates a new recipe with ingredient quantities. |
| `PUT` | `/recipes/:id` | `owner`, `manager`, `kitchen_staff` | Updates a recipe's ingredients or yield. |
| `DELETE` | `/recipes/:id` | `owner`, `manager` | Soft-deletes a recipe. |

### Purchase Order Suggestions

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/po-suggestions` | `owner`, `manager` | Returns suggested purchase quantities per item based on usage history and current stock vs. PAR level. |

---

## Events Published

| Event | Published When | Consumed By |
|---|---|---|
| `inventory.stock.low` | An item falls below its reorder point | Notification service (sends alert to managers) |
| `inventory.receipt.confirmed` | A PO is received/closed | Finance service (to record the associated payable) |

---

## Getting Started

```bash
cd services/inventory-service
mvn spring-boot:run
```

The service starts on port **8082**.

### Required Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `RABBITMQ_URL` | RabbitMQ connection string |
| `INTERNAL_SERVICE_SECRET` | Shared secret for internal service-to-service calls |

---

## Health Check

```bash
curl http://localhost:8082/actuator/health
```

---

## Running Tests

```bash
mvn test
```

Integration tests use Testcontainers and require Docker to be running.
