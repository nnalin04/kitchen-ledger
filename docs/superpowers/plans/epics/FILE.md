# EPIC: FILE — File Service

**Phase:** 3 | **Weeks:** 10–11
**Service:** `services/file-service` (Node.js 22 + Fastify 4 + TypeScript + sharp) | **Port:** 8085
**Goal:** Handle all file uploads — validate, compress images, store in Supabase Storage, return stable public URLs. Other services store the URL, never binary data.
**Depends on:** INFRA-5 (skeleton), Supabase Storage bucket created
**Blocks:** Waste photo uploads, receipt scanning uploads, notebook scan OCR (AI Service), task photo verification (Staff)

---

## FILE-1: Database Schema & Supabase Setup

- [ ] Create `migrations/001_file_uploads.sql` (exact from TRD §4.19):
  - `file_uploads` — id UUID, tenant_id UUID, uploaded_by UUID, original_name VARCHAR(255), storage_path VARCHAR(500) UNIQUE, public_url VARCHAR(500), mime_type VARCHAR(100), size_bytes INT, context CHECK('receipt','waste_photo','notebook_scan','avatar','invoice','product_image'), reference_id UUID, reference_type VARCHAR(50); index on (tenant_id, created_at DESC) + index on (reference_id) WHERE reference_id IS NOT NULL
- [ ] Configure Supabase Storage client with `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
- [ ] Ensure `kitchenledger-files` bucket exists and is private (service key needed for uploads; public URLs generated as signed)
- [ ] `src/storage/supabase.storage.ts`:
  - `upload(storagePath, buffer, mimeType)` → Supabase storage upload
  - `getPublicUrl(storagePath)` → returns public URL string
  - `createSignedUploadUrl(storagePath)` → returns `{signedUrl, token}` for direct client upload
  - `delete(storagePath)` → remove from storage

---

## FILE-2: Direct Upload Endpoint (Mobile)

- [ ] `src/routes/upload.routes.ts` — `POST /api/files/upload` (exact from TRD §4.20):
  - Accept `multipart/form-data` with `file` + query param `context`
  - Validate mime type: `image/jpeg`, `image/png`, `image/webp`, `application/pdf` only → else 400
  - Validate file size ≤ 10MB → else 400
  - If image: compress with `sharp`:
    - Resize to max 2000×2000 (`fit: 'inside'`, `withoutEnlargement: true`)
    - Convert to JPEG quality=85
  - Storage path: `{tenant_id}/{context}/{uuidv4()}.jpg`
  - Upload to Supabase Storage
  - Insert `file_uploads` row with all metadata
  - Return `{ success: true, data: { id, url: publicUrl, storage_path, size_bytes } }`
- [ ] **Test:** Upload 5MB JPEG → compressed to < 1MB → stored → URL returned. Upload SVG → 400. Upload 15MB file → 400.

---

## FILE-3: Pre-Signed URL Endpoint (Web Direct Upload)

- [ ] `POST /api/files/presign` — body: `{ context, filename, mime_type }`:
  - Generate `storagePath = {tenant_id}/{context}/{uuidv4()}_{filename}`
  - Call `supabase.createSignedUploadUrl(storagePath)`
  - Return `{ success: true, data: { upload_url, storage_path, token } }`
  - Client uploads directly to Supabase using the signed URL
  - After upload, client calls `POST /api/files/confirm` to record in DB
- [ ] `POST /api/files/confirm` — body: `{ storage_path, mime_type, size_bytes, context, reference_id?, reference_type? }`:
  - Verify file exists in Supabase Storage (head request)
  - Insert `file_uploads` row
  - Return full file record with public_url
- [ ] **Test:** Get presigned URL → simulate upload → confirm → file metadata in DB.

---

## FILE-4: File Management Endpoints

- [ ] `GET /api/files/{id}` — return file metadata (verify tenant_id matches)
- [ ] `DELETE /api/files/{id}` — [owner only] soft-delete record in DB + delete from Supabase Storage
- [ ] `GET /api/files/by-reference/{type}/{id}` — all files linked to a given entity (e.g., all photos for `waste_log` id)
- [ ] **Test:** Get file by ID. Get by reference returns all linked photos. Delete → file gone from storage + DB record deleted.
