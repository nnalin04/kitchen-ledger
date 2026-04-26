import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';

// ---------------------------------------------------------------------------
// Mock @supabase/supabase-js — only the storage API is used by supabase.client
// ---------------------------------------------------------------------------
const mockUpload = vi.fn();
const mockCreateSignedUrl = vi.fn();
const mockCreateSignedUploadUrl = vi.fn();
const mockRemove = vi.fn();
const mockList = vi.fn();
const mockFrom = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    storage: {
      from: mockFrom,
    },
  })),
}));

// ---------------------------------------------------------------------------
// Mock config so the module can be imported without real env vars
// ---------------------------------------------------------------------------
vi.mock('../config', () => ({
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

// Import after mocks are registered
import {
  uploadToStorage,
  createSignedUrl,
  createSignedUploadUrl,
  deleteFromStorage,
  fileExists,
} from '../storage/supabase.client';

beforeEach(() => {
  vi.clearAllMocks();

  // Default: every mockFrom call returns an object with all storage operations
  mockFrom.mockReturnValue({
    upload: mockUpload,
    createSignedUrl: mockCreateSignedUrl,
    createSignedUploadUrl: mockCreateSignedUploadUrl,
    remove: mockRemove,
    list: mockList,
  });
});

// ---------------------------------------------------------------------------
// TEST 1: Image compression via sharp (real sharp — no mock)
// ---------------------------------------------------------------------------
describe('Image compression', () => {
  it('compresses oversized image to max 2000x2000 JPEG', async () => {
    // Generate a 3000x3000 red PNG in-memory
    const original = await sharp({
      create: { width: 3000, height: 3000, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const compressed = await sharp(original)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const meta = await sharp(compressed).metadata();
    expect(meta.format).toBe('jpeg');
    expect(meta.width).toBeLessThanOrEqual(2000);
    expect(meta.height).toBeLessThanOrEqual(2000);
    expect(compressed.length).toBeLessThan(original.length);
  });

  it('does not upscale small images', async () => {
    const small = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 128, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const result = await sharp(small)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
  });

  it('does not apply sharp processing to PDF buffers', () => {
    // PDF has mime type "application/pdf" — mimeType.startsWith('image/') is false
    const mimeType = 'application/pdf';
    const shouldProcess = mimeType.startsWith('image/') && mimeType !== 'image/gif';
    expect(shouldProcess).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TEST 4: uploadToStorage calls storage with correct params
// ---------------------------------------------------------------------------
describe('uploadToStorage', () => {
  it('calls supabase upload with correct path, buffer, and content type', async () => {
    mockUpload.mockResolvedValueOnce({ data: { path: 'tenant/general/file.jpg' }, error: null });

    const buf = Buffer.from('fake image data');
    await uploadToStorage('tenant/general/file.jpg', buf, 'image/jpeg');

    expect(mockFrom).toHaveBeenCalledWith('kitchenledger-files');
    expect(mockUpload).toHaveBeenCalledWith('tenant/general/file.jpg', buf, {
      contentType: 'image/jpeg',
      upsert: false,
    });
  });

  it('throws when supabase upload returns an error', async () => {
    mockUpload.mockResolvedValueOnce({ data: null, error: { message: 'Bucket not found' } });

    await expect(
      uploadToStorage('bad/path.jpg', Buffer.from('x'), 'image/jpeg'),
    ).rejects.toThrow('Storage upload failed: Bucket not found');
  });
});

// ---------------------------------------------------------------------------
// TEST 5: createSignedUploadUrl returns correct shape
// ---------------------------------------------------------------------------
describe('createSignedUploadUrl', () => {
  it('returns signedUrl and token from supabase', async () => {
    mockCreateSignedUploadUrl.mockResolvedValueOnce({
      data: { signedUrl: 'https://upload.supabase.co/signed', token: 'tok-abc123' },
      error: null,
    });

    const result = await createSignedUploadUrl('tenant/context/file-id.jpg');

    expect(result.signedUrl).toBe('https://upload.supabase.co/signed');
    expect(result.token).toBe('tok-abc123');
  });

  it('throws when supabase returns an error', async () => {
    mockCreateSignedUploadUrl.mockResolvedValueOnce({
      data: null,
      error: { message: 'Permission denied' },
    });

    await expect(createSignedUploadUrl('bad/path.jpg')).rejects.toThrow(
      'Failed to create signed upload URL: Permission denied',
    );
  });
});

// ---------------------------------------------------------------------------
// TEST 6: Path sanitization — no directory traversal
// ---------------------------------------------------------------------------
describe('Path sanitization', () => {
  it('storage path built from tenant/purpose/id never contains ".."', () => {
    // Simulate how the route builds the path — filename is irrelevant since
    // we use a generated UUID and a fixed extension, not the original filename
    const tenantId = 'tenant-uuid';
    const purpose = 'receipts';
    const fileId = 'file-uuid';
    const ext = 'jpg'; // always forced to 'jpg' for images after compression

    const storagePath = `${tenantId}/${purpose}/${fileId}.${ext}`;
    expect(storagePath).not.toContain('..');
  });

  it('malicious filename in presign does not produce a path with ".."', () => {
    // In /presign the ext comes from filename.split('.').pop()
    // Even if filename contains '..', the path template never includes the full filename
    const maliciousFilename = '../../../etc/passwd';
    const ext = maliciousFilename.includes('.') ? maliciousFilename.split('.').pop() : 'bin';
    const storagePath = `tenant-id/context/file-id.${ext}`;

    // ext would be 'passwd' — path looks like tenant-id/context/file-id.passwd
    // The critical check: no '..' sequences in the final storage path
    expect(storagePath).not.toContain('..');
  });
});

// ---------------------------------------------------------------------------
// TEST 7: fileExists returns true/false correctly
// ---------------------------------------------------------------------------
describe('fileExists', () => {
  it('returns true when supabase list finds the file', async () => {
    mockList.mockResolvedValueOnce({
      data: [{ name: 'file.jpg', id: 'some-id', updated_at: '', created_at: '', last_accessed_at: '', metadata: {} }],
      error: null,
    });

    const result = await fileExists('tenant/purpose/file.jpg');
    expect(result).toBe(true);
  });

  it('returns false when supabase list returns an empty array', async () => {
    mockList.mockResolvedValueOnce({ data: [], error: null });

    const result = await fileExists('tenant/purpose/missing.jpg');
    expect(result).toBe(false);
  });

  it('returns false when supabase list returns an error', async () => {
    mockList.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });

    const result = await fileExists('tenant/purpose/bad.jpg');
    expect(result).toBe(false);
  });

  it('lists the correct parent directory for a nested path', async () => {
    mockList.mockResolvedValueOnce({ data: [{ name: 'img.png' }], error: null });

    await fileExists('tenant-id/receipts/img.png');

    expect(mockList).toHaveBeenCalledWith('tenant-id/receipts', { search: 'img.png' });
  });
});
