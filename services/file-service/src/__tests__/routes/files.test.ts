import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import { fileRoutes } from '../../routes/files';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../../db', () => ({
  withTenant: vi.fn(),
}));

vi.mock('../../storage/supabase.client', () => ({
  uploadToStorage: vi.fn().mockResolvedValue(undefined),
  createSignedUrl: vi.fn().mockResolvedValue('https://cdn.example.com/file.jpg'),
  createSignedUploadUrl: vi.fn().mockResolvedValue({
    signedUrl: 'https://upload.example.com/path',
    token: 'tok123',
  }),
  deleteFromStorage: vi.fn().mockResolvedValue(undefined),
  fileExists: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../config', () => ({
  config: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_KEY: 'test-service-key',
    SUPABASE_STORAGE_BUCKET: 'kitchenledger-files',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    PORT: 8085,
    NODE_ENV: 'test',
    SUPABASE_SIGNED_URL_EXPIRES_IN: 3600,
    MAX_FILE_SIZE_MB: 10,
    INTERNAL_SERVICE_SECRET: 'test-secret',
  },
}));

// ---------------------------------------------------------------------------
// Imports that depend on mocks being set up first
// ---------------------------------------------------------------------------
import { withTenant } from '../../db';
import {
  uploadToStorage,
  createSignedUrl,
  createSignedUploadUrl,
  deleteFromStorage,
} from '../../storage/supabase.client';

// ---------------------------------------------------------------------------
// Gateway headers injected for every test request
// ---------------------------------------------------------------------------
const AUTH_HEADERS = {
  'x-user-id': 'user-uuid-1',
  'x-tenant-id': 'tenant-uuid-1',
  'x-user-role': 'OWNER',
};

const SAMPLE_FILE_ROW = {
  id: 'file-uuid-1',
  tenant_id: 'tenant-uuid-1',
  original_name: 'receipt.jpg',
  storage_path: 'tenant-uuid-1/receipts/file-uuid-1.jpg',
  mime_type: 'image/jpeg',
  file_size: 12345,
  purpose: 'receipts',
  uploaded_by: 'user-uuid-1',
  created_at: '2024-01-15T10:00:00Z',
  public_url: 'https://cdn.example.com/file.jpg',
  reference_id: null,
  reference_type: null,
};

// ---------------------------------------------------------------------------
// Build test app
// ---------------------------------------------------------------------------
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(multipart);
  await app.register(fileRoutes, { prefix: '/api/v1/files' });
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('File Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  // ── POST /presign ──────────────────────────────────────────────────────────
  describe('POST /api/v1/files/presign', () => {
    it('returns upload_url, storage_path, token, and file_id for a valid request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/files/presign',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          context: 'receipts',
          filename: 'invoice.jpg',
          mime_type: 'image/jpeg',
        }),
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.upload_url).toBe('https://upload.example.com/path');
      expect(body.data.token).toBe('tok123');
      expect(body.data.storage_path).toContain('tenant-uuid-1/receipts/');
      expect(body.data.file_id).toBeDefined();
    });

    it('returns 415 when mime_type is not in the allowed set', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/files/presign',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          context: 'receipts',
          filename: 'video.mp4',
          mime_type: 'video/mp4',
        }),
      });

      expect(response.statusCode).toBe(415);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('returns 401 when gateway auth headers are missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/files/presign',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ mime_type: 'image/jpeg' }),
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ── POST /confirm ──────────────────────────────────────────────────────────
  describe('POST /api/v1/files/confirm', () => {
    it('creates a file record and returns 201 with data', async () => {
      vi.mocked(withTenant).mockImplementationOnce(async (_tenantId, fn) => {
        return fn({
          query: vi.fn().mockResolvedValue({ rows: [SAMPLE_FILE_ROW] }),
        } as any);
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/files/confirm',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          storage_path: 'tenant-uuid-1/receipts/file-uuid-1.jpg',
          original_name: 'receipt.jpg',
          mime_type: 'image/jpeg',
          size_bytes: 12345,
          context: 'receipts',
        }),
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('file-uuid-1');
      expect(body.data.mimeType).toBe('image/jpeg');
      expect(createSignedUrl).toHaveBeenCalled();
    });

    it('returns 400 when required fields are missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/files/confirm',
        headers: { ...AUTH_HEADERS, 'content-type': 'application/json' },
        payload: JSON.stringify({
          // missing storage_path, mime_type, size_bytes
          original_name: 'only-name.jpg',
        }),
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('MISSING_FIELDS');
    });
  });

  // ── GET /:id ───────────────────────────────────────────────────────────────
  describe('GET /api/v1/files/:id', () => {
    it('returns file metadata for an existing file', async () => {
      vi.mocked(withTenant).mockImplementationOnce(async (_tenantId, fn) => {
        return fn({
          query: vi.fn().mockResolvedValue({ rows: [SAMPLE_FILE_ROW] }),
        } as any);
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/files/file-uuid-1',
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('file-uuid-1');
      expect(body.data.originalName).toBe('receipt.jpg');
      expect(body.data.publicUrl).toBe('https://cdn.example.com/file.jpg');
    });

    it('returns 404 when file does not exist', async () => {
      vi.mocked(withTenant).mockImplementationOnce(async (_tenantId, fn) => {
        return fn({
          query: vi.fn().mockResolvedValue({ rows: [] }),
        } as any);
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/files/non-existent-id',
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });

  // ── GET /by-reference/:type/:id ───────────────────────────────────────────
  describe('GET /api/v1/files/by-reference/:type/:id', () => {
    it('returns an array of files matching the reference', async () => {
      const wasteLogId = 'waste-log-uuid-1';
      const wasteRow = {
        ...SAMPLE_FILE_ROW,
        reference_id: wasteLogId,
        reference_type: 'waste_log',
      };

      vi.mocked(withTenant).mockImplementationOnce(async (_tenantId, fn) => {
        return fn({
          query: vi.fn().mockResolvedValue({ rows: [wasteRow] }),
        } as any);
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/v1/files/by-reference/waste_log/${wasteLogId}`,
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].referenceId).toBe(wasteLogId);
      expect(body.data[0].referenceType).toBe('waste_log');
    });

    it('returns empty array when no files match the reference', async () => {
      vi.mocked(withTenant).mockImplementationOnce(async (_tenantId, fn) => {
        return fn({
          query: vi.fn().mockResolvedValue({ rows: [] }),
        } as any);
      });

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/files/by-reference/expense/no-match-uuid',
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.data).toEqual([]);
    });
  });

  // ── DELETE /:id ────────────────────────────────────────────────────────────
  describe('DELETE /api/v1/files/:id', () => {
    it('soft-deletes the file and returns 204', async () => {
      vi.mocked(withTenant).mockImplementationOnce(async (_tenantId, fn) => {
        return fn({
          query: vi.fn().mockResolvedValue({ rows: [SAMPLE_FILE_ROW] }),
        } as any);
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/files/file-uuid-1',
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(204);
      expect(deleteFromStorage).toHaveBeenCalledWith(SAMPLE_FILE_ROW.storage_path);
    });

    it('returns 404 when the file does not exist', async () => {
      vi.mocked(withTenant).mockImplementationOnce(async (_tenantId, fn) => {
        return fn({
          query: vi.fn().mockResolvedValue({ rows: [] }),
        } as any);
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/files/non-existent-id',
        headers: AUTH_HEADERS,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('NOT_FOUND');
    });
  });
});
