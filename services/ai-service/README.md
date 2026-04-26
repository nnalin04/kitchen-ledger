# AI Service

Brings AI-powered capabilities to KitchenLedger to reduce manual data entry and help teams query their data in natural language. All AI work is handled asynchronously — the service accepts a job request, queues it for background processing, and returns a job ID the caller can use to check progress and retrieve results.

---

## Core Concepts

### Asynchronous Jobs

OCR jobs are always asynchronous. Submitting a job returns a `job_id` immediately with status `pending`. The caller polls `GET /api/ai/jobs/:id` until the status is `completed` or `failed`.

Voice queries are processed synchronously (results returned inline) because they are expected to complete within a few seconds.

### Job States

```
pending → processing → completed
                    ↘ failed
```

---

## What It Does

### OCR — Document Digitization

Accepts an uploaded file (receipt, invoice, delivery note, handwritten stock count sheet) and extracts structured data from it.

Submit a file that has already been uploaded via the File service, then poll for results:

```
POST /api/ai/ocr
{
  "file_upload_id": "uuid of the already-uploaded file",
  "file_url": "url to the file in storage",
  "document_type": "purchase_invoice" | "delivery_note" | "stock_count" | "receipt"
}

→ 202 Accepted
{
  "job_id": "...",
  "status": "pending"
}
```

Poll:
```
GET /api/ai/jobs/:job_id

→ 200
{
  "job_id": "...",
  "status": "completed",
  "result": {
    "supplier": "ABC Foods",
    "invoice_number": "INV-2024-001",
    "items": [
      { "name": "Chicken breast", "quantity": 10, "unit": "kg", "unit_price": 280 }
    ],
    "total": 2800
  }
}
```

The extracted data can then be used to pre-fill a purchase order or stock count, dramatically cutting down manual entry time.

### Voice Query — Natural Language Inventory and Finance Queries

Accepts a text query (transcribed from voice or typed) and returns an interpreted response with a suggested action or data result.

```
POST /api/ai/voice-query
{
  "query": "How much chicken do we have left?",
  "context": "inventory"
}

→ 200
{
  "query": "How much chicken do we have left?",
  "interpreted": {
    "intent": "stock_level_lookup",
    "item": "chicken",
    "result": { "current_quantity": 4.5, "unit": "kg" }
  },
  "suggestion": "You have 4.5 kg of chicken breast remaining. PAR level is 8 kg — consider reordering."
}
```

Supported query intents include:
- Stock level lookups ("how much X do we have?")
- Low stock checks ("what's running low?")
- Waste cost queries ("how much did we waste this week?")
- Sales summaries ("what were yesterday's sales?")
- Expense lookups ("how much did we spend on electricity this month?")

### Job Tracking

| Method | Path | What It Does |
|---|---|---|
| `GET` | `/api/ai/jobs/:id` | Returns a job's current status and result (if completed). |
| `GET` | `/api/ai/jobs` | Lists recent AI jobs for the tenant (OCR submissions, voice queries). |

---

## Getting Started

The service requires two processes to be running.

**API server:**
```bash
cd services/ai-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8084
```

**Background worker** (processes queued OCR jobs):
```bash
cd services/ai-service
celery -A app.workers.celery_app worker --loglevel=info
```

The API starts on port **8084**.

### Required Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string (Celery task queue broker and result backend) |
| `RABBITMQ_URL` | RabbitMQ connection string (publishes `ai.ocr.completed` events) |
| `OPENAI_API_KEY` | Used for voice query interpretation and natural language understanding |
| `MINDEE_API_KEY` | Used for structured receipt and invoice OCR |
| `GOOGLE_CLOUD_CREDENTIALS` | Used as an alternative OCR backend for handwritten documents |
| `INTERNAL_SERVICE_SECRET` | Shared secret for internal service-to-service calls |

---

## Events Published

| Event | Published When | Consumed By |
|---|---|---|
| `ai.ocr.completed` | An OCR job finishes successfully | Notification service (alerts the user their document is ready) |

---

## Health Check

```bash
curl http://localhost:8084/health
```

---

## Running Tests

```bash
pytest
```
