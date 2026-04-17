import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateKeyPairSync, createSign } from 'crypto';

// ── Generate a real RSA-2048 key pair for signing test JWTs ──────────────────

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength:  2048,
  publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

// ── Mock config so it returns our test public key ────────────────────────────

vi.mock('../../config', () => ({
  config: {
    JWT_PUBLIC_KEY:          '', // overridden below via vi.mocked()
    INTERNAL_SERVICE_SECRET: 'test-internal-secret',
  },
}));

// ── Mock Redis client ─────────────────────────────────────────────────────────
// vi.hoisted() ensures the mock fn is available before vi.mock() factories run
// (vi.mock calls are hoisted to the top of the file by Vitest's transform).

const mockRedisGet = vi.hoisted(() => vi.fn());

vi.mock('../../redis', () => ({
  redisClient: { get: mockRedisGet },
}));

// ── Imports after mocks ───────────────────────────────────────────────────────

import { authMiddleware, JWTPayload } from '../../middleware/auth.middleware';
import { config }                    from '../../config';
import jwt                           from 'jsonwebtoken';

// ── Helper: build a minimal request/reply pair ────────────────────────────────

type Headers = Record<string, string | undefined>;

function makeRequest(url: string, headers: Headers = {}, method = 'GET'): any {
  return {
    url,
    method,
    headers: { ...headers },
  };
}

let replyCode: number | undefined;
let replyBody: unknown;

function makeReply(): any {
  replyCode = undefined;
  replyBody = undefined;
  return {
    code: (c: number) => ({
      send: (b: unknown) => {
        replyCode = c;
        replyBody = b;
      },
    }),
  };
}

// ── Helper: mint a valid RS256 JWT ────────────────────────────────────────────

function mintJwt(overrides: Partial<JWTPayload> & { expiresIn?: string | number } = {}): string {
  const { expiresIn = '5m', ...claims } = overrides;
  return jwt.sign(
    {
      sub:       claims.sub       ?? 'user-123',
      tenant_id: claims.tenant_id ?? 'tenant-456',
      role:      claims.role      ?? 'owner',
      email:     claims.email     ?? 'owner@example.com',
      jti:       claims.jti       ?? 'jti-abc',
    },
    privateKey,
    { algorithm: 'RS256', expiresIn: expiresIn as any }
  );
}

// ── Inject public key into mocked config ─────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  (config as any).JWT_PUBLIC_KEY = publicKey;
  mockRedisGet.mockResolvedValue(null); // default: token not revoked
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('authMiddleware', () => {

  // ── Public routes bypass ──────────────────────────────────────────────────

  describe('public route bypass', () => {
    const publicPaths = [
      '/api/auth/register',
      '/api/auth/login',
      '/api/auth/refresh',
      '/api/auth/forgot-password',
      '/api/auth/reset-password',
      '/api/auth/verify-email',
      '/health',
    ];

    for (const path of publicPaths) {
      it(`passes through ${path} without a token`, async () => {
        const req   = makeRequest(path);
        const reply = makeReply();
        await authMiddleware(req, reply);
        // No reply.code() called → undefined means handler returned early
        expect(replyCode).toBeUndefined();
      });
    }

    it('bypasses /api/auth/login with query string attached', async () => {
      const req   = makeRequest('/api/auth/login?redirect=/dashboard');
      const reply = makeReply();
      await authMiddleware(req, reply);
      expect(replyCode).toBeUndefined();
    });

    it('allows POST /api/auth/users/accept-invite without a token', async () => {
      const req   = makeRequest('/api/auth/users/accept-invite', {}, 'POST');
      const reply = makeReply();
      await authMiddleware(req, reply);
      expect(replyCode).toBeUndefined();
    });

    it('requires JWT for GET /api/auth/users/accept-invite', async () => {
      const req   = makeRequest('/api/auth/users/accept-invite', {}, 'GET');
      const reply = makeReply();
      await authMiddleware(req, reply);
      expect(replyCode).toBe(401);
      expect((replyBody as any).error.code).toBe('MISSING_TOKEN');
    });
  });

  // ── Missing / malformed Authorization header ──────────────────────────────

  describe('missing or malformed token', () => {
    it('returns 401 MISSING_TOKEN when Authorization header is absent', async () => {
      const req   = makeRequest('/api/inventory/items');
      const reply = makeReply();
      await authMiddleware(req, reply);
      expect(replyCode).toBe(401);
      expect((replyBody as any).error.code).toBe('MISSING_TOKEN');
    });

    it('returns 401 MISSING_TOKEN when header is not Bearer', async () => {
      const req   = makeRequest('/api/inventory/items', { authorization: 'Basic abc123' });
      const reply = makeReply();
      await authMiddleware(req, reply);
      expect(replyCode).toBe(401);
      expect((replyBody as any).error.code).toBe('MISSING_TOKEN');
    });
  });

  // ── Valid token ───────────────────────────────────────────────────────────

  describe('valid Bearer token', () => {
    it('injects x-user-id, x-tenant-id, x-user-role, x-user-email into headers', async () => {
      const token = mintJwt({
        sub:       'user-abc',
        tenant_id: 'tenant-xyz',
        role:      'kitchen_staff',
        email:     'staff@spicegarden.com',
        jti:       'jti-123',
      });

      const req   = makeRequest('/api/inventory/items', { authorization: `Bearer ${token}` });
      const reply = makeReply();
      await authMiddleware(req, reply);

      expect(replyCode).toBeUndefined(); // no error reply
      expect(req.headers['x-user-id']).toBe('user-abc');
      expect(req.headers['x-tenant-id']).toBe('tenant-xyz');
      expect(req.headers['x-user-role']).toBe('kitchen_staff');
      expect(req.headers['x-user-email']).toBe('staff@spicegarden.com');
    });

    it('checks Redis for jti revocation', async () => {
      const token = mintJwt({ jti: 'jti-check-redis' });
      const req   = makeRequest('/api/finance/dsr', { authorization: `Bearer ${token}` });
      await authMiddleware(req, makeReply());
      expect(mockRedisGet).toHaveBeenCalledWith('revoked:jti-check-redis');
    });
  });

  // ── Expired token ─────────────────────────────────────────────────────────

  describe('expired token', () => {
    it('returns 401 TOKEN_EXPIRED', async () => {
      const token = mintJwt({ expiresIn: -1 }); // already expired

      const req   = makeRequest('/api/inventory/items', { authorization: `Bearer ${token}` });
      const reply = makeReply();
      await authMiddleware(req, reply);

      expect(replyCode).toBe(401);
      expect((replyBody as any).error.code).toBe('TOKEN_EXPIRED');
    });
  });

  // ── Revoked token (Redis check) ───────────────────────────────────────────

  describe('revoked token', () => {
    it('returns 401 TOKEN_REVOKED when JTI is in Redis', async () => {
      mockRedisGet.mockResolvedValueOnce('1'); // revoked
      const token = mintJwt({ jti: 'revoked-jti-xyz' });

      const req   = makeRequest('/api/inventory/items', { authorization: `Bearer ${token}` });
      const reply = makeReply();
      await authMiddleware(req, reply);

      expect(replyCode).toBe(401);
      expect((replyBody as any).error.code).toBe('TOKEN_REVOKED');
    });
  });

  // ── Tampered / invalid token ──────────────────────────────────────────────

  describe('tampered or invalid token', () => {
    it('returns 401 INVALID_TOKEN for a token with a bad signature', async () => {
      const validToken = mintJwt();
      const parts      = validToken.split('.');
      const tampered   = parts[0] + '.' + parts[1] + '.badsignature';

      const req   = makeRequest('/api/staff/shifts', { authorization: `Bearer ${tampered}` });
      const reply = makeReply();
      await authMiddleware(req, reply);

      expect(replyCode).toBe(401);
      expect((replyBody as any).error.code).toBe('INVALID_TOKEN');
    });

    it('returns 401 INVALID_TOKEN for a completely bogus string', async () => {
      const req   = makeRequest('/api/staff/shifts', { authorization: 'Bearer not.a.jwt' });
      const reply = makeReply();
      await authMiddleware(req, reply);

      expect(replyCode).toBe(401);
      expect((replyBody as any).error.code).toBe('INVALID_TOKEN');
    });

    it('returns 401 INVALID_TOKEN for a token signed with a different key', async () => {
      const { privateKey: otherKey } = generateKeyPairSync('rsa', {
        modulusLength:  2048,
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      });
      const wrongKeyToken = jwt.sign(
        { sub: 'user-1', tenant_id: 't-1', role: 'owner', email: 'e@e.com', jti: 'jti-1' },
        otherKey, { algorithm: 'RS256', expiresIn: '5m' }
      );

      const req   = makeRequest('/api/finance/dsr', { authorization: `Bearer ${wrongKeyToken}` });
      const reply = makeReply();
      await authMiddleware(req, reply);

      expect(replyCode).toBe(401);
      expect((replyBody as any).error.code).toBe('INVALID_TOKEN');
    });
  });

  // ── Redis failure handling ────────────────────────────────────────────────

  describe('Redis failure', () => {
    it('returns 401 INVALID_TOKEN when Redis throws (fail-safe)', async () => {
      mockRedisGet.mockRejectedValueOnce(new Error('Redis connection refused'));
      const token = mintJwt();

      const req   = makeRequest('/api/inventory/items', { authorization: `Bearer ${token}` });
      const reply = makeReply();
      await authMiddleware(req, reply);

      // When Redis throws, the catch block returns INVALID_TOKEN
      expect(replyCode).toBe(401);
    });
  });
});
