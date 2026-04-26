# Report Service

Generates cross-service aggregated reports for KitchenLedger. Because report queries pull data from multiple services and can be slow, heavy reports are handled asynchronously — submitted as a job, processed in the background, and made available for download when ready. Lightweight summary reports are available synchronously for dashboard use.

---

## Core Concepts

### Synchronous Reports (Dashboard Data)

These endpoints aggregate data in real time and return results directly. They are designed for dashboard widgets and quick lookups where waiting for a background job would be awkward.

### Asynchronous Report Jobs (Downloads)

For large reports, exportable PDFs, or scheduled deliveries, the service uses an async job pattern:

1. Client submits `POST /api/v1/reports/jobs` with report type and parameters.
2. Service returns `202 Accepted` with a `job_id` and a `poll_url`.
3. Client polls `GET /api/v1/reports/jobs/:job_id` until `status` is `completed`.
4. When completed, `result_url` contains a pre-signed download link (PDF or CSV).

---

## Available Reports

### Profit & Loss Summary

**Endpoint:** `GET /api/v1/reports/pnl?from=YYYY-MM-DD&to=YYYY-MM-DD`

Aggregates sales (from the Finance service) and expenses (from the Finance service) for the date range and calculates:

| Field | Description |
|---|---|
| `gross_sales` | Total revenue before discounts and voids |
| `net_sales` | Revenue after discounts and voids |
| `total_expenses` | Sum of all logged expenses |
| `net_profit` | Net sales minus total expenses |
| `food_cost_percentage` | COGS as a percentage of net sales |
| `labor_cost_percentage` | Payroll/wages as a percentage of net sales |
| `prime_cost_percentage` | Food + labor combined as a percentage of net sales |
| `expense_breakdown` | Total spend per expense category |

Example:
```http
GET /api/v1/reports/pnl?from=2024-11-01&to=2024-11-30
```

### Waste Report

**Endpoint:** `GET /api/v1/reports/waste?from=YYYY-MM-DD&to=YYYY-MM-DD`

Pulls waste log data from the Inventory service and returns:
- Total waste cost for the period
- Breakdown by waste category/reason (spoilage, over-prep, dropped, etc.)
- Trend by day of week (e.g. "waste cost is 3× higher on Sundays")
- Individual waste entries with item name, quantity, unit, cost, date, and reason

### Expense Breakdown

**Endpoint:** `GET /api/v1/reports/expenses?from=YYYY-MM-DD&to=YYYY-MM-DD`

Returns a category-by-category breakdown of expenses for the period, with a list of individual expense entries per category. Useful for identifying cost drivers (e.g. "utilities represent 23% of expenses this month").

### Staff Hours

**Endpoint:** `GET /api/v1/reports/staff-hours?from=YYYY-MM-DD&to=YYYY-MM-DD`

Pulls attendance data from the Staff service and returns total hours worked and shift count per employee for the period. Useful for payroll preparation and labour cost analysis.

### Audit Log

**Endpoint:** `GET /api/v1/reports/audit-log?from=YYYY-MM-DD&to=YYYY-MM-DD`

Aggregates audit events from Inventory, Finance, and Staff services into a unified activity log. Supports filtering by `user_id` and `event_type`. Each entry shows which service logged the event, what entity was changed, old and new values, and the timestamp.

---

## Async Job API

### Submit a Report Job

```http
POST /api/v1/reports/jobs
{
  "report_type": "pnl",
  "parameters": {
    "from": "2024-10-01",
    "to": "2024-10-31"
  }
}
```

Supported `report_type` values: `pnl`, `waste`, `expenses`, `staff-hours`, `inventory`, `purchase`.

Response (`202 Accepted`):
```json
{
  "job_id": "e3f1a...",
  "status": "pending",
  "report_type": "pnl",
  "created_at": "2024-11-01T09:00:00Z",
  "poll_url": "/api/v1/reports/jobs/e3f1a..."
}
```

### Poll Job Status

```http
GET /api/v1/reports/jobs/e3f1a...
```

While processing:
```json
{ "job_id": "e3f1a...", "status": "processing", "result_url": null }
```

When complete:
```json
{
  "job_id": "e3f1a...",
  "status": "completed",
  "completed_at": "2024-11-01T09:00:45Z",
  "result_url": "https://storage.example.com/reports/e3f1a...pdf?token=..."
}
```

### List Recent Jobs

```http
GET /api/v1/reports/jobs?limit=20&offset=0
```

Returns the tenant's recent report jobs, newest first. Useful for showing a "your reports" history page.

---

## Getting Started

Two processes must be running.

**API server:**
```bash
cd services/report-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8087
```

**Background worker** (processes async report jobs):
```bash
cd services/report-service
celery -A app.celery_app worker --loglevel=info
```

The API starts on port **8087**.

### Required Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (read replica recommended for heavy aggregation queries) |
| `REDIS_URL` | Redis connection string (Celery task queue) |
| `RABBITMQ_URL` | RabbitMQ connection string (publishes `report.generated` event) |
| `FINANCE_SERVICE_URL` | Base URL for internal calls to the Finance service |
| `INVENTORY_SERVICE_URL` | Base URL for internal calls to the Inventory service |
| `STAFF_SERVICE_URL` | Base URL for internal calls to the Staff service |
| `SUPABASE_URL` | Supabase project URL (for uploading generated report files) |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `SUPABASE_STORAGE_URL` | Storage endpoint for report file uploads |
| `INTERNAL_SERVICE_SECRET` | Shared secret for internal service-to-service calls |

---

## Health Check

```bash
curl http://localhost:8087/health
```

---

## Running Tests

```bash
pytest
```
