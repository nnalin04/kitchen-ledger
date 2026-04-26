# Finance Service

Manages the financial operations of a restaurant: recording daily revenue, tracking expenses, managing vendor relationships, handling accounts payable, and surfacing profit & loss data. This service gives owners and managers a real-time view of their financial position without needing a separate accounting tool.

---

## Core Concepts

### Daily Sales Report (DSR)

A **Daily Sales Report** captures all revenue for a single trading day, broken down by payment method. Managers typically create or finalize a DSR at the end of each shift or day. Once finalized, a DSR is locked and cannot be edited — only an owner can unlock it.

The DSR tracks:
- Gross sales (total revenue before discounts/voids)
- Net sales (after discounts and voids)
- Cash, card, UPI, and other payment method splits
- Cash reconciliation (expected cash vs. counted cash)

### Expenses

**Expenses** are costs incurred in running the restaurant that aren't tracked as inventory purchases — things like electricity, gas, packaging, repairs, marketing, or staff welfare. Each expense has a category, amount, and date, enabling category-level cost analysis over time.

### Vendors and Accounts Payable

**Vendors** are businesses the restaurant owes money to (utilities, rent, contractors). Unlike inventory suppliers, vendor relationships are managed here in the Finance service. **Vendor payments** record when and how much was paid against a vendor, tracking outstanding balances.

### Chart of Accounts

The **chart of accounts** is the categorization structure that underpins all financial entries. Owners can customize account categories to match how they want to view their finances.

---

## API

All endpoints are prefixed with `/api/v1/finance`.

### Daily Sales Reports

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/daily-sales-reports` | All roles | Lists DSRs. Filterable by `from` and `to` date. Paginated (default 31 records — one month). |
| `GET` | `/daily-sales-reports/date/:date` | All roles | Fetches the DSR for a specific calendar date. |
| `GET` | `/daily-sales-reports/:id` | All roles | Fetches a specific DSR by ID. |
| `GET` | `/daily-sales-reports/summary` | All roles | Returns total gross and net sales for a date range. Useful for dashboard widgets. |
| `POST` | `/daily-sales-reports` | `owner`, `manager` | Creates a DSR for a trading day with payment method breakdown. |
| `PUT` | `/daily-sales-reports/:id` | `owner`, `manager` | Updates a DSR before it is finalized. |
| `POST` | `/daily-sales-reports/:id/finalize` | `owner`, `manager` | Locks the DSR so it can no longer be edited. Records who finalized it. |
| `POST` | `/daily-sales-reports/:id/reconcile` | `owner`, `manager` | Records the actual cash counted at end of day. The service calculates the overage or shortage automatically. |

### Expenses

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/expenses` | All roles | Lists expenses. Filterable by category and date range. Paginated. |
| `GET` | `/expenses/:id` | All roles | Returns a single expense. |
| `GET` | `/expenses/summary` | All roles | Returns total expense spend for a date range, optionally filtered by category. |
| `POST` | `/expenses` | `owner`, `manager` | Logs a new expense with category, amount, and date. |
| `PUT` | `/expenses/:id` | `owner`, `manager` | Updates an expense that hasn't been locked into a closed period. |
| `DELETE` | `/expenses/:id` | `owner`, `manager` | Soft-deletes an expense. |

### Vendors

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/vendors` | All roles | Lists all vendors the restaurant deals with. |
| `GET` | `/vendors/:id` | All roles | Returns a single vendor's details and outstanding balance. |
| `POST` | `/vendors` | `owner`, `manager` | Creates a new vendor record. |
| `PUT` | `/vendors/:id` | `owner`, `manager` | Updates vendor contact or payment details. |
| `DELETE` | `/vendors/:id` | `owner`, `manager` | Removes a vendor (only if no outstanding payments). |

### Vendor Payments (Accounts Payable)

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/vendor-payments` | All roles | Lists payment records. Filterable by vendor and status. |
| `GET` | `/vendor-payments/:id` | All roles | Returns a single payment record. |
| `POST` | `/vendor-payments` | `owner`, `manager` | Records a payment made to a vendor with amount, method, and reference. |
| `POST` | `/vendor-payments/:id/mark-paid` | `owner`, `manager` | Marks a pending payment as settled. |

### Chart of Accounts

| Method | Path | Who Can Call | What It Does |
|---|---|---|---|
| `GET` | `/accounts` | All roles | Lists all accounts in the chart of accounts. |
| `POST` | `/accounts` | `owner` | Creates a new account category. |
| `PUT` | `/accounts/:id` | `owner` | Renames or updates an account. |

---

## Events Published

| Event | Published When | Consumed By |
|---|---|---|
| `finance.expense.created` | A new expense is logged | Report service (near-real-time aggregation) |
| `finance.dsr.finalized` | A DSR is finalized | Report service |

---

## Getting Started

```bash
cd services/finance-service
mvn spring-boot:run
```

The service starts on port **8083**.

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
curl http://localhost:8083/actuator/health
```

---

## Running Tests

```bash
mvn test
```

Integration tests use Testcontainers and require Docker to be running.
