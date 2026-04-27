import { test, expect } from '@playwright/test';
import axios from 'axios';
import { seedTestTenant } from '../fixtures/seed';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8080';

/** Poll a URL until the predicate returns true or maxMs is reached. */
async function pollUntil<T>(
  fetcher: () => Promise<T>,
  predicate: (data: T) => boolean,
  intervalMs = 2000,
  maxMs = 30_000
): Promise<T> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    const data = await fetcher();
    if (predicate(data)) return data;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`pollUntil: condition never met within ${maxMs}ms`);
}

test.describe('TEST-2: Contract Tests — RabbitMQ event side-effects', () => {
  test.setTimeout(60_000);

  // ─────────────────────────────────────────────────────────────────────────
  // Contract 1: auth.tenant.created → Finance Service seeds chart-of-accounts
  // ─────────────────────────────────────────────────────────────────────────
  test('Contract 1: auth.tenant.created → Finance seeds exactly 20 chart-of-accounts entries', async () => {
    const ts = Date.now();
    const email = `coa-${ts}@contract.test`;
    const password = 'TestPass123!';

    // Register a brand-new tenant — this publishes auth.tenant.created
    await axios.post(`${API}/api/auth/register`, {
      restaurant_name: `Contract Test Restaurant ${ts}`,
      email,
      password,
      timezone: 'America/New_York',
      currency: 'USD',
    });

    const { data: loginData } = await axios.post(`${API}/api/auth/login`, { email, password });
    const token: string = loginData.access_token;

    // Wait for the event to be consumed and processed by Finance Service
    await new Promise((r) => setTimeout(r, 3000));

    const { data: accounts } = await axios.get(`${API}/api/finance/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    // Finance Service must seed exactly 20 default chart-of-accounts entries
    const items: unknown[] = Array.isArray(accounts) ? accounts : (accounts.items ?? accounts.data ?? []);
    expect(items.length).toBe(20);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Contract 2: inventory.stock.low → Notification Service creates push notification
  // ─────────────────────────────────────────────────────────────────────────
  test('Contract 2: inventory.stock.low → Notification Service creates a stock_low notification', async () => {
    const tenant = await seedTestTenant('c2');
    const headers = { Authorization: `Bearer ${tenant.ownerToken}` };

    // Create an item with PAR level = 10 and initial stock = 20
    const { data: item } = await axios.post(
      `${API}/api/inventory/items`,
      {
        name: `LowStock Item ${Date.now()}`,
        category: 'Produce',
        count_unit: 'kg',
        par_level: 10,
        current_stock: 20,
      },
      { headers }
    );

    // Drive stock to 0 via a stock movement — triggers inventory.stock.low event
    await axios.post(
      `${API}/api/inventory/stock-movements`,
      {
        item_id: item.id,
        movement_type: 'CONSUMPTION',
        quantity: 20,
        notes: 'Contract test drain',
      },
      { headers }
    );

    // Wait for async event propagation
    await new Promise((r) => setTimeout(r, 3000));

    const { data: notifications } = await axios.get(`${API}/api/notifications`, { headers });
    const items: unknown[] = Array.isArray(notifications)
      ? notifications
      : (notifications.items ?? notifications.data ?? []);

    const stockLowNotifs = items.filter((n: any) => n.type === 'stock_low' || n.notification_type === 'stock_low');
    expect(stockLowNotifs.length).toBeGreaterThanOrEqual(1);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Contract 3: ai.ocr.completed (context_type=inventory) → Inventory updates stock
  // ─────────────────────────────────────────────────────────────────────────
  test('Contract 3: ai.ocr.completed (inventory) → inventory item updated_at is recent', async () => {
    const tenant = await seedTestTenant('c3');
    const headers = { Authorization: `Bearer ${tenant.ownerToken}` };

    // Create an inventory item that will be updated by the OCR result
    const { data: item } = await axios.post(
      `${API}/api/inventory/items`,
      {
        name: `OCR Item ${Date.now()}`,
        category: 'Dry Goods',
        count_unit: 'bags',
        par_level: 5,
        current_stock: 0,
      },
      { headers }
    );

    const beforeUpdate = new Date().toISOString();

    // Submit an OCR job targeting this inventory item
    const { data: job } = await axios.post(
      `${API}/api/ai/jobs`,
      {
        type: 'ocr',
        context_type: 'inventory',
        context_id: item.id,
        image_url: 'https://example.com/test-receipt.jpg',
      },
      { headers }
    );

    // Poll until the job reaches "completed" status (max 30s)
    await pollUntil(
      async () => {
        const { data } = await axios.get(`${API}/api/ai/jobs/${job.id}`, { headers });
        return data;
      },
      (data: any) => data.status === 'completed' || data.status === 'COMPLETED',
      2000,
      30_000
    );

    // Verify the inventory item's updated_at is after the job was submitted
    const { data: updatedItem } = await axios.get(`${API}/api/inventory/items/${item.id}`, { headers });
    const updatedAt = new Date(updatedItem.updated_at).getTime();
    const before = new Date(beforeUpdate).getTime();

    expect(updatedAt).toBeGreaterThanOrEqual(before);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Contract 4: ai.ocr.completed (context_type=expense) → Finance updates expense
  // ─────────────────────────────────────────────────────────────────────────
  test('Contract 4: ai.ocr.completed (expense) → expense has vendor or amount populated', async () => {
    const tenant = await seedTestTenant('c4');
    const headers = { Authorization: `Bearer ${tenant.ownerToken}` };

    // Create a bare-bones expense record (no vendor/amount yet)
    const { data: expense } = await axios.post(
      `${API}/api/finance/expenses`,
      {
        description: 'Unverified receipt',
        amount: 0,
        category: 'FOOD_BEVERAGE',
        expense_date: new Date().toISOString().split('T')[0],
      },
      { headers }
    );

    // Submit OCR job targeting the expense
    const { data: job } = await axios.post(
      `${API}/api/ai/jobs`,
      {
        type: 'ocr',
        context_type: 'expense',
        context_id: expense.id,
        image_url: 'https://example.com/test-receipt.jpg',
      },
      { headers }
    );

    // Poll until completed (max 30s)
    await pollUntil(
      async () => {
        const { data } = await axios.get(`${API}/api/ai/jobs/${job.id}`, { headers });
        return data;
      },
      (data: any) => data.status === 'completed' || data.status === 'COMPLETED',
      2000,
      30_000
    );

    // Verify expense now has at least one OCR-populated field
    const { data: updatedExpense } = await axios.get(`${API}/api/finance/expenses/${expense.id}`, { headers });

    const hasVendor = updatedExpense.vendor != null && updatedExpense.vendor !== '';
    const hasAmount = updatedExpense.amount != null && Number(updatedExpense.amount) > 0;
    const hasOcrData = updatedExpense.ocr_data != null || updatedExpense.ocr_result != null;

    expect(hasVendor || hasAmount || hasOcrData).toBe(true);
  });
});
