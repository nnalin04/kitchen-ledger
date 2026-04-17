import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { pool } from '../db';
import { createSignedUrl } from '../storage/supabase.client';
import { config } from '../config';

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

function verifySecret(req: FastifyRequest, reply: FastifyReply): boolean {
  const provided = req.headers['x-internal-secret'] as string | undefined;
  if (provided !== config.INTERNAL_SERVICE_SECRET) {
    reply.code(403).send({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Invalid internal service secret' },
    });
    return false;
  }
  return true;
}

export async function internalFileRoutes(app: FastifyInstance): Promise<void> {
  // GET /internal/files/:id — fetch metadata + generate signed URL
  app.get(
    '/:id',
    async (req: FastifyRequest<{ Params: { id: string }; Querystring: { tenantId: string } }>, reply: FastifyReply) => {
      if (!verifySecret(req, reply)) return;

      const { tenantId } = req.query;
      if (!tenantId) {
        return reply.code(400).send({
          success: false,
          error: { code: 'BAD_REQUEST', message: 'tenantId query param is required' },
        });
      }

      const { rows } = await pool.query<FileRow>(
        `SELECT * FROM file_uploads
         WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [req.params.id, tenantId],
      );
      const row = rows[0];
      if (!row) {
        return reply.code(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: 'File not found' },
        });
      }

      const url = await createSignedUrl(row.storage_path, config.SUPABASE_SIGNED_URL_EXPIRES_IN);
      return reply.send({
        success: true,
        data: {
          id: row.id,
          originalName: row.original_name,
          mimeType: row.mime_type,
          fileSize: row.file_size,
          purpose: row.purpose,
          url,
          createdAt: row.created_at,
        },
      });
    },
  );
}
