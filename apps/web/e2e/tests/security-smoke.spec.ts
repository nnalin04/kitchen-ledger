import { test, expect } from '@playwright/test';
import axios, { AxiosError } from 'axios';
import { seedTestTenant, type TestTenant } from '../fixtures/seed';
import { Buffer } from 'buffer';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8080';

test.describe('TEST-4: Security Smoke Tests', () => {
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  let tenantAItemId: string;

  test.beforeAll(async () => {
    [tenantA, tenantB] = await Promise.all([
      seedTestTenant('secA'),
      seedTestTenant('secB'),
    ]);

    // Create an item in tenant A
    const { data } = await axios.post(
      `${API}/api/inventory/items`,
      { name: 'TenantA Secret Item', category: 'Test', count_unit: 'kg', par_level: 5, current_stock: 10 },
      { headers: { Authorization: `Bearer ${tenantA.ownerToken}` } }
    );
    tenantAItemId = data.id;
  });

  test('IDOR: tenant B cannot access tenant A item — gets 404 not 403', async () => {
    try {
      await axios.get(`${API}/api/inventory/items/${tenantAItemId}`, {
        headers: { Authorization: `Bearer ${tenantB.ownerToken}` },
      });
      throw new Error('Expected 404 but request succeeded');
    } catch (e) {
      const err = e as AxiosError;
      // Must be 404 — not 403 (don't leak existence) and not 200
      expect(err.response?.status).toBe(404);
    }
  });

  test('JWT tamper: modified tenant_id claim is rejected at Gateway', async () => {
    // Corrupt the JWT payload (base64 decode, modify, re-encode without valid signature)
    const parts = tenantA.ownerToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    payload.tenant_id = '00000000-0000-0000-0000-000000000000';
    parts[1] = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tamperedToken = parts.join('.');

    try {
      await axios.get(`${API}/api/inventory/items`, {
        headers: { Authorization: `Bearer ${tamperedToken}` },
      });
      throw new Error('Expected 401 but request succeeded');
    } catch (e) {
      const err = e as AxiosError;
      expect(err.response?.status).toBe(401);
    }
  });

  test('internal endpoint abuse: missing X-Internal-Secret returns 403', async () => {
    try {
      await axios.post(`${API}/internal/auth/verify-token`, { token: tenantA.ownerToken });
      throw new Error('Expected 403 but request succeeded');
    } catch (e) {
      const err = e as AxiosError;
      expect(err.response?.status).toBe(403);
    }
  });

  test('unauthenticated request to protected API returns 401', async () => {
    try {
      await axios.get(`${API}/api/inventory/items`);
      throw new Error('Expected 401 but request succeeded');
    } catch (e) {
      const err = e as AxiosError;
      expect(err.response?.status).toBe(401);
    }
  });

  test('error responses do not leak stack traces or DB schema details', async () => {
    try {
      await axios.post(`${API}/api/auth/login`, { email: 'notexist@e2e.test', password: 'wrong' });
    } catch (e) {
      const err = e as AxiosError;
      const body = JSON.stringify(err.response?.data ?? '');
      // Must not contain stack trace markers or DB info
      expect(body).not.toMatch(/at\s+\w+\.\w+\s*\(/); // Java stack trace
      expect(body).not.toMatch(/Traceback|File.*line \d+/); // Python traceback
      expect(body).not.toMatch(/SELECT|FROM|WHERE|pg_/i); // SQL leak
      expect(body).not.toMatch(/inventory_items|auth_users|daily_sales/i); // Table names
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional security tests (TEST-4 supplement)
// ─────────────────────────────────────────────────────────────────────────────
test.describe('TEST-4: Additional Security Smoke Tests', () => {
  test.setTimeout(60_000);

  // SEC-A: IDOR — tenant A token cannot access tenant B's item (gets 404, not 403)
  test('IDOR: tenant A cannot access tenant B item by ID — gets 404 not 200', async () => {
    const [tenantA, tenantB] = await Promise.all([
      seedTestTenant('secA2'),
      seedTestTenant('secB2'),
    ]);

    // Create an item under tenant B
    const { data: tenantBItem } = await axios.post(
      `${API}/api/inventory/items`,
      {
        name: `TenantB Confidential Item ${Date.now()}`,
        category: 'Test',
        count_unit: 'kg',
        par_level: 5,
        current_stock: 10,
      },
      { headers: { Authorization: `Bearer ${tenantB.ownerToken}` } }
    );

    // Attempt to access it with tenant A's token
    try {
      await axios.get(`${API}/api/inventory/items/${tenantBItem.id}`, {
        headers: { Authorization: `Bearer ${tenantA.ownerToken}` },
      });
      throw new Error('Expected 404 but request succeeded');
    } catch (e) {
      const err = e as AxiosError;
      // Must be 404 — not 403 (item existence must not be leaked) and not 200
      expect(err.response?.status).toBe(404);
    }
  });

  // SEC-B: JWT tampering — swapping payload base64 with different tenant_id is rejected at Gateway
  test('JWT tamper: modified tenant_id in payload is rejected with 401', async () => {
    const tenant = await seedTestTenant('secJWT');
    const token = tenant.ownerToken;

    // Split JWT into header.payload.signature
    const parts = token.split('.');

    // Base64url-decode the payload, change tenant_id, re-encode (invalid signature)
    const rawPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    rawPayload.tenant_id = '00000000-0000-0000-0000-000000000001';
    const tamperedPayload = Buffer.from(JSON.stringify(rawPayload)).toString('base64url');

    // Reassemble with original header + tampered payload + original signature
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    try {
      await axios.get(`${API}/api/inventory/items`, {
        headers: { Authorization: `Bearer ${tamperedToken}` },
      });
      throw new Error('Expected 401 but request succeeded');
    } catch (e) {
      const err = e as AxiosError;
      expect(err.response?.status).toBe(401);
    }
  });

  // SEC-C: Internal endpoint lockout — /internal/* without X-Internal-Secret returns 403
  test('Internal endpoint: POST /internal/auth/verify-token without X-Internal-Secret returns 403', async () => {
    const tenant = await seedTestTenant('secInt');

    try {
      // Deliberately omit the X-Internal-Secret header
      await axios.post(`${API}/internal/auth/verify-token`, {
        token: tenant.ownerToken,
      });
      throw new Error('Expected 403 but request succeeded');
    } catch (e) {
      const err = e as AxiosError;
      expect(err.response?.status).toBe(403);
    }
  });

  // SEC-D: Rate limiting — 200 rapid login attempts trigger 429 responses
  test('Rate limiting: 200 rapid login attempts produce at least some 429 responses', async () => {
    test.setTimeout(90_000);

    const responses: number[] = [];

    // Fire 200 rapid requests — deliberately not awaiting individually so they are concurrent
    const requests = Array.from({ length: 200 }, () =>
      axios
        .post(`${API}/api/auth/login`, {
          email: `ratelimit-${Date.now()}@e2e.test`,
          password: 'WrongPassword!',
        })
        .then((r) => r.status)
        .catch((e: AxiosError) => e.response?.status ?? 0)
    );

    const statuses = await Promise.all(requests);
    responses.push(...statuses);

    const tooManyRequests = responses.filter((s) => s === 429);
    // At least some requests must be rate-limited
    expect(tooManyRequests.length).toBeGreaterThan(0);
  });
});
