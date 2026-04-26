import { test, expect } from '@playwright/test';
import axios, { AxiosError } from 'axios';
import { seedTestTenant, type TestTenant } from '../fixtures/seed';

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
