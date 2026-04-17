import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { withTenant } from '../db';
import {
  uploadToStorage,
  createSignedUrl,
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
}

function toResponse(row: FileRow) {
  return {
    id: row.id,
    originalName: row.original_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    purpose: row.purpose,
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

    const purpose = (data.fields?.purpose as { value: string } | undefined)?.value ?? 'general';
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

    const ext = data.filename.split('.').pop() ?? '';
    const fileId = uuidv4();
    const storagePath = `${req.tenantId}/${purpose}/${fileId}.${ext}`;

    await uploadToStorage(storagePath, buffer, mimeType);

    const row = await withTenant(req.tenantId, async (client) => {
      const { rows } = await client.query<FileRow>(
        `INSERT INTO file_uploads
           (id, tenant_id, original_name, storage_path, mime_type, file_size, purpose, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [
          fileId,
          req.tenantId,
          data.filename,
          storagePath,
          mimeType,
          buffer.length,
          purpose,
          req.userId,
        ],
      );
      return rows[0];
    });

    return reply.code(201).send({ success: true, data: toResponse(row) });
  });

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
