import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

let _client: SupabaseClient | null = null;

export function storageClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

export const BUCKET = config.SUPABASE_STORAGE_BUCKET;

/**
 * Upload a buffer to Supabase Storage.
 * Returns the full storage path on success.
 */
export async function uploadToStorage(
  storagePath: string,
  buffer: Buffer,
  mimeType: string,
): Promise<void> {
  const { error } = await storageClient()
    .storage.from(BUCKET)
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
}

/**
 * Generate a signed URL valid for `expiresIn` seconds.
 */
export async function createSignedUrl(
  storagePath: string,
  expiresIn: number,
): Promise<string> {
  const { data, error } = await storageClient()
    .storage.from(BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data) throw new Error(`Failed to create signed URL: ${error?.message}`);
  return data.signedUrl;
}

/**
 * Delete a file from Supabase Storage.
 */
export async function deleteFromStorage(storagePath: string): Promise<void> {
  const { error } = await storageClient().storage.from(BUCKET).remove([storagePath]);
  if (error) throw new Error(`Storage delete failed: ${error.message}`);
}
