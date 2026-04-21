# EPIC: REPORT — Report Service

**Phase:** 3 | **Weeks:** 10–12
**Service:** `services/report-service` (Python 3.12 + FastAPI 0.115 + Celery + pandas + reportlab) | **Port:** 8087
**Goal:** Generate heavy PDF/CSV reports asynchronously. Reads data from Finance + Inventory via internal APIs. Outputs files to Supabase Storage. Notifies user via `report.generated` event.
**Depends on:** INFRA-4 (skeleton), Finance Service (P&L + expense data), Inventory Service (stock data), File Service / Supabase Storage (output upload)
**Blocks:** PDF downloads in web app, scheduled weekly reports

---

## REPORT-1: Database Schema & Celery Setup

- [ ] Alembic migration `0002_report_jobs.py` (exact from TRD §4.15):
  - `report_jobs` — id UUID, tenant_id UUID, requested_by UUID, report_type CHECK('pl_monthly','pl_custom','waste_monthly','inventory_valuation','expense_breakdown','gst_summary','menu_engineering'), status CHECK('queued','processing','completed','failed'), parameters JSONB, output_url VARCHAR(500), output_format CHECK('pdf','csv','excel'), error_message TEXT, created_at, completed_at
  - Index on (tenant_id, created_at DESC)
- [ ] Configure Celery: Redis broker (`redis://redis:6379/2`), result backend (`redis://redis:6379/3`), `task_serializer='json'`, `result_expires=86400` (24h)
- [ ] `app/clients/finance_client.py` — httpx async client to Finance Service internal endpoints
- [ ] `app/clients/inventory_client.py` — httpx async client to Inventory Service internal endpoints
- [ ] `app/storage/supabase.py` — Supabase Storage client: `upload_report(bytes, format, job_id)` → returns public URL

---

## REPORT-2: P&L PDF Generator

- [ ] `app/generators/pl_generator.py` (from TRD §4.16):
  - `generate(tenant_id, parameters)` → bytes:
    1. Fetch P&L data: `finance_client.get_pl_data(tenant_id, start_date, end_date)`
    2. Build PDF with reportlab `SimpleDocTemplate`, A4 page size
    3. Title paragraph: `"Profit & Loss Report — {start} to {end}"`
    4. Revenue section table: Food Sales, Beverage Sales, Discounts/Comps/Voids, Net Sales + % columns
    5. COGS section: each account line + total + food_cost_%
    6. Gross Profit line
    7. Labor section: each account + total + labor_cost_%
    8. Prime Cost line (color-coded: green if 55-65%, yellow if 65-70%, red if >70%)
    9. Operating Expenses: each account + total
    10. Net Profit line (color-coded green/yellow/red)
    11. Benchmark legend at footer
    12. `_styled_table()` — exact table style from TRD §4.16 (dark header, alternating rows, right-align amounts)
- [ ] **Test:** Generate P&L PDF with mock data → `len(pdf_bytes) > 1000`. Parse PDF text → verify "Net Sales" and "Prime Cost" sections present.

---

## REPORT-3: Additional Generators

- [ ] `app/generators/waste_generator.py` — `WasteReportGenerator`:
  - Fetch waste data from Inventory internal endpoint
  - pandas DataFrame: pivot by reason + station + week
  - reportlab: summary table + top-5 waste items bar chart (via reportlab Drawings)
- [ ] `app/generators/inventory_valuation_generator.py` — `InventoryValuationGenerator`:
  - Fetch all items with current_stock + avg_cost
  - Sort by ABC category then by (current_stock × avg_cost) descending
  - PDF table: item name, category, stock, unit, unit cost, total value; totals row
  - Summary: Total A-items value, B-items value, C-items value
- [ ] `app/generators/expense_breakdown_generator.py` — `ExpenseBreakdownGenerator`:
  - Fetch expenses grouped by account type for period
  - PDF: bar table + percentage of revenue for each category
- [ ] `app/generators/gst_summary_generator.py` — `GSTSummaryGenerator`:
  - Aggregate `tax_collected` from DSRs by week/month
  - CSV output (pandas to_csv): date, gross_sales, tax_rate, tax_collected
- [ ] `app/generators/menu_engineering_generator.py` — `MenuEngineeringGenerator`:
  - Fetch recipes with food_cost_percent and menu_matrix_category
  - PDF: 2×2 matrix visual + table grouped by quadrant
- [ ] **Test (spot-check each):** Each generator returns non-empty bytes and correct MIME type.

---

## REPORT-4: Celery Task & Report Job API

- [ ] `app/workers/report_tasks.py` — `@celery_app.task(bind=True)` `generate_report(self, job_id)`:
  1. `update_job_status(job_id, 'processing')`
  2. Load job from DB: `tenant_id`, `report_type`, `parameters`, `output_format`
  3. `generator = GENERATOR_MAP[report_type]` — dict mapping type to generator class
  4. `output_bytes = await generator.generate(tenant_id, parameters)`
  5. `url = await storage.upload_report(output_bytes, output_format, job_id)`
  6. `update_job_completed(job_id, url)`
  7. Publish `report.generated` event via RabbitMQ client
  8. On exception: `update_job_failed(job_id, str(e))`; re-raise
- [ ] `app/routers/reports.py`:
  - `POST /api/reports/jobs` — accept `{report_type, parameters: {start_date, end_date, ...}, output_format}`; create `report_jobs` row with status=queued; dispatch Celery task; return `{job_id, estimated_seconds}` (lookup table: pl_monthly→30s, waste→15s, etc.)
  - `GET /api/reports/jobs` — list past jobs for tenant (paginated, newest first)
  - `GET /api/reports/jobs/{id}` — poll status; return `{status, output_url, error_message}`
  - `GET /api/reports/jobs/{id}/download` — if completed: redirect (HTTP 302) to Supabase signed URL (1h expiry); if not ready: 202
- [ ] RabbitMQ consumer for `finance.dsr.reconciled` → auto-trigger `pl_monthly` report for that day
- [ ] **Test:** `POST /api/reports/jobs` → job queued → Celery picks up → job completed with output_url → GET download redirects. Mock Celery failure → job marked failed.
