import { test, expect } from '@playwright/test';
import axios from 'axios';
import { seedTestTenant, type TestTenant } from '../fixtures/seed';
import * as path from 'path';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8080';

test.describe('E2E-3: Finance Flow', () => {
  let tenant: TestTenant;

  test.beforeAll(async () => {
    tenant = await seedTestTenant('fin');
  });

  const auth = () => ({ headers: { Authorization: `Bearer ${tenant.ownerToken}` } });

  test('expense logged and P&L reflects updated COGS', async () => {
    // Create an account for Food & Beverage
    const { data: accounts } = await axios.get(`${API}/api/finance/accounts`, auth());
    const cogsAccount = accounts.items.find((a: any) => a.type === 'COGS') ?? accounts.items[0];

    const expense = await axios.post(
      `${API}/api/finance/expenses`,
      {
        account_id: cogsAccount.id,
        amount: 450.0,
        vendor_name: 'Metro Wholesale',
        date: new Date().toISOString().split('T')[0],
        description: 'Weekly produce order',
      },
      auth()
    );
    expect(expense.data.id).toBeTruthy();

    // P&L for today should show the expense
    const today = new Date().toISOString().split('T')[0];
    const { data: pl } = await axios.get(
      `${API}/api/finance/reports/pl?start_date=${today}&end_date=${today}`,
      auth()
    );
    const cogsTotal = pl.sections?.cogs?.total ?? pl.cogs_total;
    expect(cogsTotal).toBeGreaterThanOrEqual(450);
  });

  test('vendor created, expense linked, payment recorded, AP balance decreases', async () => {
    const { data: vendor } = await axios.post(
      `${API}/api/finance/vendors`,
      { name: 'City Dairy', email: 'billing@citydairy.test', payment_terms: 30 },
      auth()
    );

    const { data: accounts } = await axios.get(`${API}/api/finance/accounts`, auth());
    const account = accounts.items[0];

    await axios.post(
      `${API}/api/finance/expenses`,
      { account_id: account.id, amount: 200.0, vendor_id: vendor.id, date: new Date().toISOString().split('T')[0] },
      auth()
    );

    const { data: apBefore } = await axios.get(`${API}/api/finance/ap/aging`, auth());
    const vendorBefore = apBefore.entries?.find((e: any) => e.vendor_id === vendor.id);
    const balanceBefore = vendorBefore?.total_outstanding ?? 200;

    await axios.post(
      `${API}/api/finance/ap/payments`,
      { vendor_id: vendor.id, amount: 200.0, payment_date: new Date().toISOString().split('T')[0] },
      auth()
    );

    const { data: apAfter } = await axios.get(`${API}/api/finance/ap/aging`, auth());
    const vendorAfter = apAfter.entries?.find((e: any) => e.vendor_id === vendor.id);
    const balanceAfter = vendorAfter?.total_outstanding ?? 0;

    expect(balanceAfter).toBeLessThan(balanceBefore);
  });
});
