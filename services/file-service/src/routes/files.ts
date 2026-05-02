import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { withTenant } from '../db';
import {
  uploadToStorage,
  createSignedUrl,
  createSignedUploadUrl,
  deleteFromStorage,
} from '../storage/supabase.client';
import { config } from '../config';
import { gatewayTrustMiddleware } from '../middleware/trust.middleware';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'text/csv',
]);

const ALLOWED_PURPOSES = new Set(['receipt', 'invoice', 'import', 'general', 'avatar', 'waste', 'notebook', 'report']);

function sanitizePurpose(purpose: string | undefined): string {
  const p = (purpose ?? 'general').toLowerCase().trim();
  if (!ALLOWED_PURPOSES.has(p)) return 'general';
  return p;
}

interface FileRow {
  id: string;
  tenant_id: string;
  original_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  purpose: string;
  uploaded_by: string;
  created_at: string;
  public_url?: string | null;
  reference_id?: string | null;
  reference_type?: string | null;
}

function toResponse(row: FileRow) {
  return {
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    purpose: row.purpose,
    publicUrl: row.public_url ?? null,
    referenceId: row.reference_id ?? null,
    referenceType: row.reference_type ?? null,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  // All file routes require gateway auth headers
  app.addHook('onRequest', gatewayTrustMiddleware);

  // ── POST /api/v1/files/upload ─────────────────────────────────────────────
  app.post('/upload', async (req: FastifyRequest, reply: FastifyReply) => {
    const maxBytes = config.MAX_FILE_SIZE_MB * 1024 * 1024;

    const data = await req.file({ limits: { fileSize: maxBytes } });
    if (!data) {
      return reply.code(400).send({
        success: false,
        error: { code: 'NO_FILE', message: 'No file was attached' },
      });
    }

    const mimeType = data.mimetype;
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return reply.code(415).send({
        success: false,
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: `File type ${mimeType} is not allowed`,
        },
      });
    }

    const purpose = sanitizePurpose((data.fields?.purpose as { value: string } | undefined)?.value);
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) {
      return reply.code(400).send({
        success: false,
        error: { code: 'EMPTY_FILE', message: 'Uploaded file is empty' },
      });
    }

    // Image compression: resize to max 2000x2000 and convert to JPEG (except GIFs)
    let processedBuffer: Buffer<ArrayBufferLike> = buffer;
    let finalMimeType = mimeType;
    let finalExt = data.filename.split('.').pop() ?? 'bin';

    if (mimeType.startsWith('image/') && mimeType !== 'image/gif') {
      processedBuffer = await sharp(buffer)
        .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();
      finalMimeType = 'image/jpeg';
      finalExt = 'jpg';
    }

    const fileId = uuidv4();
    const storagePath = `${req.tenantId}/${purpose}/${fileId}.${finalExt}`;

    await uploadToStorage(storagePath, processedBuffer, finalMimeType);

    // Generate a long-lived signed URL (1 year) for the public_url
    const publicUrl = await createSignedUrl(storagePath, 60 * 60 * 24 * 365);

    const row = await withTenant(req.tenantId, async (client) => {
      const { rows } = await client.query<FileRow>(
        `INSERT INTO file_uploads
           (id, tenant_id, original_name, storage_path, mime_type, file_size, purpose, uploaded_by, public_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          fileId,
          req.tenantId,
          data.filename,
          storagePath,
          finalMimeType,
          processedBuffer.length,
          purpose,
          req.userId,
          publicUrl,
        ],
      );
      return rows[0];
    });

    return reply.code(201).send({ success: true, data: toResponse(row) });
  });

  // ── POST /api/v1/files/presign ────────────────────────────────────────────
  // Must be registered BEFORE /:id to avoid route conflicts
  app.post('/presign', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as { context?: string; filename?: string; mime_type?: string };
    const context = sanitizePurpose(body.context);
    const filename = body.filename ?? 'upload';
    const mimeType = body.mime_type ?? 'application/octet-stream';

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return reply.code(415).send({
        success: false,
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: `File type ${mimeType} is not allowed` },
      });
    }

    const fileId = uuidv4();
    const ext = filename.includes('.') ? filename.split('.').pop() : 'bin';
    const storagePath = `${req.tenantId}/${context}/${fileId}.${ext}`;

    const { signedUrl, token } = await createSignedUploadUrl(storagePath);

    return reply.send({
      success: true,
      data: { upload_url: signedUrl, storage_path: storagePath, token, file_id: fileId },
    });
  });

  // ── POST /api/v1/files/confirm ────────────────────────────────────────────
  // Must be registered BEFORE /:id to avoid route conflicts
  app.post('/confirm', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      storage_path: string;
      original_name?: string;
      mime_type: string;
      size_bytes: number;
      context?: string;
      reference_id?: string;
      reference_type?: string;
    };

    if (!body.storage_path || !body.mime_type || !body.size_bytes) {
      return reply.code(400).send({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'storage_path, mime_type, and size_bytes are required' },
      });
    }

    // Verify the storage_path belongs to this tenant — prevents a user from
    // registering another tenant's storage objects in their own file records.
    if (!body.storage_path.startsWith(`${req.tenantId}/`)) {
      return reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'storage_path does not belong to your tenant' },
      });
    }

    // Enforce the same MIME type allowlist as /upload and /presign.
    if (!ALLOWED_MIME_TYPES.has(body.mime_type)) {
      return reply.code(415).send({
        success: false,
        error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'File type not allowed' },
      });
    }

    // Generate a long-lived signed URL as the public_url
    const publicUrl = await createSignedUrl(body.storage_path, 60 * 60 * 24 * 365);

    const row = await withTenant(req.tenantId, async (client) => {
      const { rows } = await client.query<FileRow>(
        `INSERT INTO file_uploads
           (tenant_id, original_name, storage_path, mime_type, file_size, purpose,
            uploaded_by, public_url, reference_id, reference_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          req.tenantId,
          body.original_name ?? body.storage_path.split('/').pop() ?? 'upload',
          body.storage_path,
          body.mime_type,
          body.size_bytes,
          body.context ?? 'general',
          req.userId,
          publicUrl,
          body.reference_id ?? null,
          body.reference_type ?? null,
        ],
      );
      return rows[0];
    });

    return reply.code(201).send({ success: true, data: toResponse(row) });
  });

  // ── GET /api/v1/files/by-reference/:type/:id ─────────────────────────────
  // Must be registered BEFORE /:id to avoid route conflicts
  app.get(
    '/by-reference/:type/:id',
    async (req: FastifyRequest<{ Params: { type: string; id: string } }>, reply: FastifyReply) => {
      const rows = await withTenant(req.tenantId, async (client) => {
        const { rows: r } = await client.query<FileRow>(
          `SELECT * FROM file_uploads
           WHERE tenant_id = $1 AND reference_type = $2 AND reference_id = $3 AND deleted_at IS NULL
           ORDER BY created_at DESC`,
          [req.tenantId, req.params.type, req.params.id],
        );
        return r;
      });

      return reply.send({ success: true, data: rows.map(toResponse) });
    },
  );

  // ── GET /api/v1/files ─────────────────────────────────────────────────────
  app.get('/', async (req: FastifyRequest, reply: FastifyReply) => {
    const query = req.query as { purpose?: string; limit?: string; offset?: string };
    const limit = Math.min(parseInt(query.limit ?? '50', 10), 200);
    const offset = parseInt(query.offset ?? '0', 10);

    const rows = await withTenant(req.tenantId, async (client) => {
      if (query.purpose) {
        const { rows: r } = await client.query<FileRow>(
          `SELECT * FROM file_uploads
           WHERE tenant_id = $1 AND purpose = $2 AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
          [req.tenantId, query.purpose, limit, offset],
        );
        return r;
      }
      const { rows: r } = await client.query<FileRow>(
        `SELECT * FROM file_uploads
         WHERE tenant_id = $1 AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [req.tenantId, limit, offset],
      );
      return r;
    });

    return reply.send({ success: true, data: rows.map(toResponse) });
  });

  // ── GET /api/v1/files/:id ─────────────────────────────────────────────────
  app.get('/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const row = await withTenant(req.tenantId, async (client) => {
      const { rows } = await client.query<FileRow>(
        `SELECT * FROM file_uploads WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [req.params.id, req.tenantId],
      );
      return rows[0] ?? null;
    });

    if (!row) {
      return reply.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
    }

    return reply.send({ success: true, data: toResponse(row) });
  });

  // ── GET /api/v1/files/:id/url ─────────────────────────────────────────────
  app.get(
    '/:id/url',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const row = await withTenant(req.tenantId, async (client) => {
        const { rows } = await client.query<FileRow>(
          `SELECT * FROM file_uploads
           WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
          [req.params.id, req.tenantId],
        );
        return rows[0] ?? null;
      });

      if (!row) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'File not found' },
        });
      }

      const url = await createSignedUrl(row.storage_path, config.SUPABASE_SIGNED_URL_EXPIRES_IN);
      return reply.send({
        success: true,
        data: { url, expiresIn: config.SUPABASE_SIGNED_URL_EXPIRES_IN },
      });
    },
  );

  // ── DELETE /api/v1/files/:id ──────────────────────────────────────────────
  app.delete(
    '/:id',
    async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const row = await withTenant(req.tenantId, async (client) => {
        const { rows } = await client.query<FileRow>(
          `UPDATE file_uploads
           SET deleted_at = NOW()
           WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
           RETURNING *`,
          [req.params.id, req.tenantId],
        );
        return rows[0] ?? null;
      });

      if (!row) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'File not found' },
        });
      }

      // Best-effort storage removal — soft delete is the source of truth
      try {
        await deleteFromStorage(row.storage_path);
      } catch (err) {
        app.log.warn({ err, storagePath: row.storage_path }, 'Storage delete failed');
      }

      return reply.code(204).send();
    },
  );
}
