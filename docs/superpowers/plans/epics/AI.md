# EPIC: AI — AI Service

**Phase:** 3 | **Weeks:** 9–12
**Service:** `services/ai-service` (Python 3.12 + FastAPI 0.115 + Celery 5.4) | **Port:** 8084
**Goal:** OCR for handwritten notebooks, invoice/receipt parsing via Mindee, voice transcription via Whisper, natural language financial queries via GPT-4o function calling, statistical demand forecasting, anomaly detection.
**Depends on:** INFRA-4 (skeleton), Inventory Service (item catalog), Finance Service (expense/account data), File Service (image storage)
**Blocks:** Web AI pages, Mobile voice input

---

## AI-1: Database Schema & Infrastructure Setup

- [ ] Alembic migration `0002_ai_jobs.py` (exact schema from TRD §4.2):
  - `ai_jobs` — id UUID, tenant_id UUID, user_id UUID, job_type CHECK('notebook_ocr','receipt_ocr','voice_transcribe','nl_query','forecast'), status CHECK('pending','processing','completed','failed'), input_data JSONB, result JSONB, error_message TEXT, model_used VARCHAR(100), tokens_used INT, processing_ms INT, created_at, completed_at
  - Index on (tenant_id, created_at DESC) and (status, created_at) WHERE status='pending'
- [ ] `app/core/config.py` — Pydantic Settings for: OPENAI_API_KEY, GOOGLE_CLOUD_CREDENTIALS (path to JSON file), MINDEE_API_KEY, DATABASE_URL, REDIS_URL, RABBITMQ_URL, INVENTORY_SERVICE_URL, FINANCE_SERVICE_URL, INTERNAL_SERVICE_SECRET
- [ ] `app/workers/celery_app.py` — Celery with Redis broker (`redis://redis:6379/0`), result backend (`redis://redis:6379/1`), task serializer=json, timezone=UTC
- [ ] `app/clients/inventory_client.py` — httpx AsyncClient:
  - `get_item_names(tenant_id)` → GET `/internal/inventory/tenant/{id}/items`; include `X-Internal-Secret` header
  - `get_items_by_names(tenant_id, names[])` → GET `/internal/inventory/items?names[]=...`
  - `get_item_cost(tenant_id, item_id)` → GET `/internal/inventory/items/{id}/cost`
- [ ] `app/clients/finance_client.py` — httpx AsyncClient:
  - `get_pl_data(tenant_id, start, end)` → GET `/internal/finance/pl-data`
  - `get_expense_total(tenant_id, category, vendor_name, start_date, end_date)` → GET `/internal/finance/expenses/summary`
  - `get_revenue_summary(tenant_id, start_date, end_date, breakdown)` → GET `/internal/finance/revenue`
  - `get_waste_analysis(tenant_id, start_date, end_date, group_by)` → GET `/internal/inventory/waste/report`
- [ ] `app/clients/rabbitmq_client.py` — aio-pika client:
  - `publish(routing_key, payload)` → publish to `kitchenledger.events` exchange with standard event envelope

---

## AI-2: OCR Pipeline — Handwritten Notebook Scan

- [ ] `app/services/ocr_service.py` (exact from TRD §4.4):
  - `preprocess_image(image_bytes)` → PIL: convert to grayscale, enhance contrast (2.0×), enhance sharpness (2.0×), apply SHARPEN filter; return JPEG bytes at quality=95
  - `extract_text(image_bytes)` → Google Cloud Vision `document_text_detection`; raises `RuntimeError` on Vision API error
  - `parse_with_gpt4o(raw_text, image_bytes, context_type, known_items)`:
    - System prompt: inventory context includes known item list (first 50 items), expects JSON `{items: [{name, quantity, unit, date, cost_per_unit, notes}], confidence, unreadable_sections}`
    - Expense context expects JSON `{expenses: [{description, amount, payee, date}], confidence}`
    - Uses `gpt-4o`, `response_format={"type":"json_object"}`, `temperature=0.1`
    - Image sent as base64 data URL in multimodal message
  - `match_to_catalog(extracted_items, tenant_id)`:
    - Exact match (lowercase compare) → `match_type="exact"`, `match_confidence=1.0`
    - No exact match → fuzzy match via `_fuzzy_match(name, catalog_names)` using GPT-4o-mini
    - Confidence > 0.85 → include in matched list; else → unmatched
- [ ] `app/workers/ocr_tasks.py` — Celery task `process_notebook_ocr` (exact from TRD §4.5):
  - `@celery_app.task(bind=True, max_retries=3, default_retry_delay=10)`
  - Flow: update job status=processing → download from Supabase Storage → preprocess → Vision OCR → get item catalog → GPT-4o parse → match catalog → update job result=completed → publish `ai.ocr.completed` event
  - On any exception: update job status=failed, error_message=str(e) → `self.retry(exc=exc)`
- [ ] `app/routers/ocr.py`:
  - `POST /api/ai/ocr/notebook` — accept `multipart/form-data` with `image` file + `context_type` (inventory|expense) + `target_date`; validate file type (jpeg/png/webp); upload image to File Service first; create `ai_jobs` record; dispatch Celery task; return `{job_id, estimated_seconds: 8}`
  - `GET /api/ai/ocr/notebook/{job_id}` — poll status; return `{status, result}` where result is the parsed+matched data
  - `POST /api/ai/ocr/notebook/{job_id}/commit` — accept `{items_to_update, expenses_to_create, items_to_create}`; call Inventory Service (update stock) or Finance Service (create expenses) with results; mark job as applied
- [ ] **Test:** Upload test notebook JPEG → job created → Celery task runs (mock Vision + GPT4o) → result contains matched items. Commit → inventory updated.

---

## AI-3: Invoice/Receipt OCR via Mindee

- [ ] Add `receipt_ocr` to `ai_jobs.job_type` CHECK constraint (Alembic migration)
- [ ] `app/services/receipt_service.py`:
  - `parse_receipt(image_bytes)` — Mindee `receipt/v5` API call; extract: `vendor_name`, `date`, `total_amount`, `tax_amount`, `invoice_number`, line items with `{description, quantity, unit_price, total_price}`
  - `match_vendor(tenant_id, vendor_name)` — call Finance Service `/internal/finance/vendors?name={vendor_name}`; return `vendor_id` if found
  - `match_po(tenant_id, invoice_number)` — call Inventory Service to find matching PO
  - `flag_price_discrepancies(receipt_items, po_items)` — compare unit prices, flag items with delta > threshold
- [ ] `app/routers/ocr.py` — add:
  - `POST /api/ai/ocr/receipt` — same flow as notebook OCR but uses Mindee + `receipt_service`; `context_type=receipt`
  - Commit endpoint applies to Finance Service expense creation
- [ ] **Test:** Upload receipt image → Mindee mock returns structured data → vendor matched → invoice number linked to existing PO.

---

## AI-4: Voice Transcription

- [ ] `app/services/voice_service.py` (exact from TRD §4.6):
  - `transcribe(audio_bytes, language)` — OpenAI Whisper `whisper-1` API; domain prompt: *"Restaurant kitchen context. Common ingredients: chicken, tomatoes, onions, cream, flour, rice, dal, paneer. Quantities in kg, grams, litres, pieces."*; `response_format="text"`
  - `parse_command(transcript, command_type, known_items)` — GPT-4o-mini; JSON schemas per command type:
    - `waste`: `{item, quantity, unit, reason, station}`
    - `stock_count`: `{item, quantity, unit}`
    - `receipt`: `{item, quantity, unit, cost_per_unit}`
  - Uses `temperature=0` for deterministic extraction
- [ ] `app/routers/voice.py`:
  - `POST /api/ai/voice/transcribe` — accept `multipart/form-data` with `audio` file + `command_type` + `language` (default: "en")
  - Validate audio format (wav/mp3/m4a/ogg); max 25MB
  - Call `transcribe()` then `parse_command()` with tenant's item names
  - Return `{transcript, parsed: {item, quantity, unit, ...}, confidence}`
  - Synchronous endpoint (< 3s response) — no Celery needed
- [ ] **Test:** Upload WAV of "two kilos tomatoes spoiled" → transcript = "two kilos tomatoes spoiled" → parsed: `{item:"tomatoes", quantity:2, unit:"kg", reason:"spoilage"}`.

---

## AI-5: Natural Language Queries

- [ ] `app/services/query_service.py` (exact from TRD §4.7):
  - 5 predefined tool definitions (`FINANCE_TOOLS` list): `get_expense_total`, `get_revenue_summary`, `get_food_cost_percent`, `get_waste_analysis`, `get_item_consumption`
  - `answer(tenant_id, question, currency)`:
    1. First GPT-4o call with `tool_choice="auto"` to select tools
    2. Execute each selected tool via `_execute_tool()` → calls Finance/Inventory clients
    3. Second GPT-4o call to format human-readable answer from tool results
    4. `_extract_chart_data()` — detect if result is time-series → return `{type:"line", values:[...]}`
  - Use `gpt-4o` for complex queries; `gpt-4o-mini` for simple single-tool queries (cost optimization)
- [ ] `app/routers/query.py`:
  - `POST /api/ai/query` — accept `{question}`; Redis cache key = `query:{tenant_id}:{sha256(question)}`; TTL 60 min; return `{answer, data}`
- [ ] **Test:** "How much did we spend on vegetables this week?" → calls `get_expense_total` with category="produce", date range = last 7 days → returns formatted answer. Same query twice → second hit served from Redis cache.

---

## AI-6: Statistical Forecasting & Anomaly Detection

- [ ] `app/services/forecast_service.py`:
  - `forecast_item_usage(tenant_id, item_id, days)`:
    - Fetch last 8 weeks of `inventory_movements` for item (type='receipt' or 'waste') via Inventory Service
    - Compute weekly consumption (receipts - ending stock delta)
    - Apply exponential smoothing (α=0.3) to get forecast for next `days`
    - `suggested_order_quantity = forecast_daily × days × 1.1 - current_stock + safety_stock`
  - Returns `{item_name, current_stock, forecast: [{date, predicted_usage}], suggested_order_quantity}`
- [ ] `app/services/anomaly_service.py`:
  - `detect_inventory_anomalies(tenant_id)`:
    - For each item: compare last 7-day usage to 4-week rolling average
    - Flag if `current_week_usage > rolling_avg × 1.4` (40% above normal)
  - `detect_finance_anomalies(tenant_id)`:
    - For each account category: compare last 7-day expenses to rolling 4-week average
    - Flag if `current_week > rolling_avg + 2 × std_dev`
- [ ] `app/routers/forecast.py`:
  - `GET /api/ai/forecast/{item_id}?days=7` — returns forecast + suggested order quantity
  - `GET /api/ai/anomalies` — returns `{inventory_anomalies, finance_anomalies}`
- [ ] **Test:** Seed 8 weeks of movement data → forecast 7 days → verify prediction within ±20% of known pattern. Anomaly: spike week → flagged.

---

## AI-7: Tests

- [ ] Unit tests:
  - `ocr_service.py` — `preprocess_image` output is valid JPEG; `match_to_catalog` exact match; `match_to_catalog` fuzzy match above threshold
  - `voice_service.py` — `parse_command` with each command_type returns correct schema
  - `query_service.py` — tool selection logic; `_extract_chart_data` identifies time-series
  - `forecast_service.py` — exponential smoothing calculation; suggested order quantity formula
- [ ] Integration tests with mocked external APIs (record/replay with `pytest-recording` or `respx`):
  - Full OCR Celery task: mock Vision API + GPT-4o → verify job completed with result
  - Celery retry: mock task failure → verify 3 retries → job marked failed
  - Voice transcribe: mock Whisper → mock GPT-4o-mini → verify parsed output
  - NL query cache: first call hits GPT-4o, second call returns cached
- [ ] Coverage gate: **≥ 80% line coverage**
