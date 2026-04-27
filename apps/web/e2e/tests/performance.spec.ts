import { test, expect } from '@playwright/test';
import axios from 'axios';
import { seedTestTenant } from '../fixtures/seed';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8080';

/** Poll a URL until predicate is true or maxMs reached. */
async function pollUntil<T>(
  fetcher: () => Promise<T>,
  predicate: (data: T) => boolean,
  intervalMs = 3000,
  maxMs = 60_000
): Promise<T> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const data = await fetcher();
    if (predicate(data)) return data;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`pollUntil: condition not met within ${maxMs}ms`);
}

test.describe('TEST-3: Performance Tests', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // P1: Inventory list query performance — 100 items, response < 500ms
  // ─────────────────────────────────────────────────────────────────────────
  test('P1: GET /api/inventory/items?page=1&limit=50 responds within 500ms with 100 seeded items', async () => {
    test.setTimeout(120_000); // item seeding takes time

    const tenant = await seedTestTenant('p1');
    const headers = { Authorization: `Bearer ${tenant.ownerToken}` };

    // Seed 100 inventory items sequentially to avoid overwhelming test env
    const seedPromises: Promise<unknown>[] = [];
    for (let i = 0; i < 100; i++) {
      seedPromises.push(
        axios.post(
          `${API}/api/inventory/items`,
          {
            name: `Perf Item ${i} ${Date.now()}`,
            category: 'Test',
            count_unit: 'kg',
            par_level: 5,
            current_stock: 10,
          },
          { headers }
        )
      );
    }
    // Run in batches of 10 to avoid overwhelming test infra
    for (let batch = 0; batch < 10; batch++) {
      await Promise.all(seedPromises.slice(batch * 10, batch * 10 + 10));
    }

    // Measure the list query time
    const start = Date.now();
    const { data } = await axios.get(`${API}/api/inventory/items?page=1&limit=50`, { headers });
    const elapsed = Date.now() - start;

    // Response time gate: generous 500ms for test environment (prod target: 200ms p99)
    expect(elapsed).toBeLessThan(500);

    // Verify pagination metadata is present
    const hasPagination =
      data.total != null ||
      data.page != null ||
      data.page_size != null ||
      data.limit != null ||
      data.meta != null;
    expect(hasPagination).toBe(true);

    // At least 50 items returned (we seeded 100, limit=50)
    const items: unknown[] = Array.isArray(data) ? data : (data.items ?? data.data ?? []);
    expect(items.length).toBeGreaterThanOrEqual(50);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // P2: RLS isolation — tenant A items never bleed into tenant B response
  // ─────────────────────────────────────────────────────────────────────────
  test('P2: RLS isolation — tenant A items never appear in tenant B response', async () => {
    test.setTimeout(60_000);

    const [tenantA, tenantB] = await Promise.all([
      seedTestTenant('p2a'),
      seedTestTenant('p2b'),
    ]);

    const seedItems = async (token: string, label: string) => {
      const headers = { Authorization: `Bearer ${token}` };
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        const { data } = await axios.post(
          `${API}/api/inventory/items`,
          {
            name: `${label} Item ${i}`,
            category: 'RLS Test',
            count_unit: 'kg',
            par_level: 1,
            current_stock: 5,
          },
          { headers }
        );
        ids.push(data.id);
      }
      return ids;
    };

    const [tenantAIds, tenantBIds] = await Promise.all([
      seedItems(tenantA.ownerToken, 'TenantA'),
      seedItems(tenantB.ownerToken, 'TenantB'),
    ]);

    // Fetch tenant A's items using tenant A's token
    const { data: tenantAResponse } = await axios.get(`${API}/api/inventory/items?limit=100`, {
      headers: { Authorization: `Bearer ${tenantA.ownerToken}` },
    });
    const tenantAItems: any[] = Array.isArray(tenantAResponse)
      ? tenantAResponse
      : (tenantAResponse.items ?? tenantAResponse.data ?? []);

    // All returned items must belong to tenant A
    for (const item of tenantAItems) {
      if (item.tenant_id) {
        expect(item.tenant_id).toBe(tenantA.tenantId);
      }
    }

    // None of tenant B's item IDs should appear in tenant A's response
    const returnedIds = tenantAItems.map((i: any) => i.id);
    for (const bId of tenantBIds) {
      expect(returnedIds).not.toContain(bId);
    }

    // Sanity: tenant A's own items should be present
    for (const aId of tenantAIds) {
      expect(returnedIds).toContain(aId);
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // P3: DSR reconcile concurrency — 3 tenants reconcile simultaneously
  // ─────────────────────────────────────────────────────────────────────────
  test('P3: 3 concurrent DSR reconcile requests all return 200 with RECONCILED status', async () => {
    test.setTimeout(60_000);

    const [t1, t2, t3] = await Promise.all([
      seedTestTenant('p3a'),
      seedTestTenant('p3b'),
      seedTestTenant('p3c'),
    ]);

    const today = new Date().toISOString().split('T')[0];

    // Create a DSR for each tenant
    const createDsr = async (token: string) => {
      const { data } = await axios.post(
        `${API}/api/finance/dsr`,
        {
          report_date: today,
          cash_sales: 500,
          card_sales: 300,
          upi_sales: 200,
          total_sales: 1000,
          notes: 'Concurrency test DSR',
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return data.id as string;
    };

    const [dsrId1, dsrId2, dsrId3] = await Promise.all([
      createDsr(t1.ownerToken),
      createDsr(t2.ownerToken),
      createDsr(t3.ownerToken),
    ]);

    // Fire 3 concurrent PATCH reconcile requests
    const reconcile = async (token: string, dsrId: string) =>
      axios.patch(
        `${API}/api/finance/dsr/${dsrId}/reconcile`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

    const [r1, r2, r3] = await Promise.all([
      reconcile(t1.ownerToken, dsrId1),
      reconcile(t2.ownerToken, dsrId2),
      reconcile(t3.ownerToken, dsrId3),
    ]);

    // All must return HTTP 200
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);

    // All DSRs must now have RECONCILED status
    const checkStatus = async (token: string, dsrId: string) => {
      const { data } = await axios.get(`${API}/api/finance/dsr/${dsrId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return data.status as string;
    };

    const [s1, s2, s3] = await Promise.all([
      checkStatus(t1.ownerToken, dsrId1),
      checkStatus(t2.ownerToken, dsrId2),
      checkStatus(t3.ownerToken, dsrId3),
    ]);

    expect(s1.toUpperCase()).toBe('RECONCILED');
    expect(s2.toUpperCase()).toBe('RECONCILED');
    expect(s3.toUpperCase()).toBe('RECONCILED');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // P5: Report generation — P&L report for 30 days completes within 60s
  // ─────────────────────────────────────────────────────────────────────────
  test('P5: profit_loss report for 30 days of data completes within 60s with non-null report_url', async () => {
    test.setTimeout(120_000);

    const tenant = await seedTestTenant('p5');
    const headers = { Authorization: `Bearer ${tenant.ownerToken}` };

    // Seed 30 days of DSR records
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const reportDate = date.toISOString().split('T')[0];

      await axios.post(
        `${API}/api/finance/dsr`,
        {
          report_date: reportDate,
          cash_sales: Math.floor(Math.random() * 1000) + 200,
          card_sales: Math.floor(Math.random() * 500) + 100,
          upi_sales: Math.floor(Math.random() * 300) + 50,
          total_sales: Math.floor(Math.random() * 1800) + 350,
          notes: `Day ${i} seeded DSR`,
        },
        { headers }
      );
    }

    const dateFrom = new Date(today);
    dateFrom.setDate(today.getDate() - 29);

    const { data: reportJob } = await axios.post(
      `${API}/api/reports/generate`,
      {
        type: 'profit_loss',
        date_from: dateFrom.toISOString().split('T')[0],
        date_to: today.toISOString().split('T')[0],
      },
      { headers }
    );

    const jobId = reportJob.id ?? reportJob.job_id;
    const reportStartMs = Date.now();

    // Poll until completed (max 60s)
    const completedReport = await pollUntil(
      async () => {
        const { data } = await axios.get(`${API}/api/reports/${jobId}`, { headers });
        return data;
      },
      (data: any) => {
        const status: string = (data.status ?? '').toUpperCase();
        return status === 'COMPLETED' || status === 'FAILED';
      },
      3000,
      60_000
    );

    const elapsedSec = (Date.now() - reportStartMs) / 1000;

    // Must complete (not fail) within 60 seconds
    expect(elapsedSec).toBeLessThan(60);
    const status: string = (completedReport as any).status.toUpperCase();
    expect(status).toBe('COMPLETED');

    // report_url must be non-null
    const reportUrl: string | null = (completedReport as any).report_url ?? (completedReport as any).url ?? null;
    expect(reportUrl).not.toBeNull();
    expect(reportUrl).not.toBe('');
  });
});
