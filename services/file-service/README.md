# File Service

Centralizes all file uploads and downloads for KitchenLedger. Instead of each service handling its own file storage, all uploads and file references flow through here. This keeps storage logic in one place, enforces consistent access control, and gives other services a stable reference ID for any file.

---

## What Gets Stored Here

| File Type | Uploaded By | Used By |
|---|---|---|
| Purchase invoice photos | Mobile app (camera) | AI service (OCR), Inventory service (attached to POs) |
| Delivery note scans | Mobile app | AI service (OCR) |
| Stock count photos | Mobile app | AI service (OCR) |
| Receipt images | Mobile / web | Finance service (attached to expenses) |
| Generated report files | Report service | Report service (for download links) |
| Profile images | Web / mobile | Auth service (user profiles) |

---

## How It Works

### Upload Flow

1. The client sends a multipart `POST /api/v1/files/upload` request with the file and a `purpose` field.
2. The file service validates the MIME type and stores the file in object storage under a path structured as `{tenantId}/{purpose}/{fileId}.{ext}`.
3. A metadata record is created in the database (ID, original filename, MIME type, size, purpose, uploader, tenant).
4. The `file_id` is returned. Other services store this ID as a reference — they never store the file itself.

### Download Flow

Files are never served directly through the application. Instead, clients request a **pre-signed URL** which is a time-limited, direct link to the file in object storage. This keeps large file transfers out of the application servers entirely.

**Allowed file types:**

| MIME Type | Examples |
|---|---|
| `image/jpeg` | Camera photos, scanned receipts |
| `image/png` | Screenshots, exported charts |
| `image/webp` | Compressed images |
| `image/heic` | iPhone camera captures |
| `application/pdf` | Invoices, multi-page documents |
| `text/csv` | Exported data files |

Any other file type is rejected with `415 Unsupported Media Type`.

---

## API

All endpoints are prefixed with `/api/v1/files`.

| Method | Path | What It Does |
|---|---|---|
| `POST` | `/upload` | Uploads a file. Accepts multipart form data with the file and an optional `purpose` field (e.g. `invoice`, `receipt`, `report`, `profile`). Returns the file metadata including the `id`. |
| `GET` | `/` | Lists files for the current tenant. Filterable by `purpose`. Supports `limit` and `offset` for pagination. |
| `GET` | `/:id/url` | Generates and returns a pre-signed download URL for a file. The URL expires after a configurable period. Requesting a new URL before the old one expires is safe — each call generates a fresh URL. |
| `DELETE` | `/:id` | Soft-deletes the file metadata record and removes the file from storage. Once deleted, the download URL for that file will stop working. |

### Upload Example

```http
POST /api/v1/files/upload
Content-Type: multipart/form-data

file: <binary data>
purpose: invoice
```

Response:
```json
{
  "success": true,
  "data": {
    "id": "3f2e1a...",
    "originalName": "invoice_abc_foods.pdf",
    "mimeType": "application/pdf",
    "fileSize": 204800,
    "purpose": "invoice",
    "uploadedBy": "user-uuid",
    "createdAt": "2024-11-01T10:30:00Z"
  }
}
```

### Get a Download URL

```http
GET /api/v1/files/3f2e1a.../url
```

Response:
```json
{
  "success": true,
  "data": {
    "url": "https://storage.example.com/tenant-id/invoice/3f2e1a...pdf?token=...",
    "expiresIn": 3600
  }
}
```

---

## Getting Started

```bash
cd services/file-service
npm install
npm run dev
```

The service starts on port **8085**.

### Required Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (for file metadata) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (required for storage write access) |
| `SUPABASE_STORAGE_URL` | Storage endpoint URL |
| `MAX_FILE_SIZE_MB` | Maximum allowed upload size in megabytes (e.g. `25`) |
| `SUPABASE_SIGNED_URL_EXPIRES_IN` | How long download URLs stay valid, in seconds (e.g. `3600`) |
| `INTERNAL_SERVICE_SECRET` | Shared secret for internal service-to-service calls |

---

## Health Check

```bash
curl http://localhost:8085/health
```

---

## Running Tests

```bash
npm run test
```
