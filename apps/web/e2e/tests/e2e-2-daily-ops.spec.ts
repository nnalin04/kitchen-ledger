import { test, expect } from '@playwright/test';
import axios from 'axios';
import { seedTestTenant, type TestTenant } from '../fixtures/seed';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8080';

test.describe('E2E-2: Daily Operations Flow', () => {
  let tenant: TestTenant;
  let itemId: string;
  let supplierId: string;
  let poId: string;

  test.beforeAll(async () => {
    tenant = await seedTestTenant('ops');
  });

  const api = (path: string) =>
    axios.create({ baseURL: API, headers: { Authorization: `Bearer ${tenant.ownerToken}` } }).get(path).then((r) => r.data);

  const post = (path: string, body: any) =>
    axios.post(`${API}${path}`, body, { headers: { Authorization: `Bearer ${tenant.ownerToken}` } }).then((r) => r.data);

  const patch = (path: string, body: any) =>
    axios.patch(`${API}${path}`, body, { headers: { Authorization: `Bearer ${tenant.ownerToken}` } }).then((r) => r.data);

  test('add inventory item with PAR level', async () => {
    const data = await post('/api/inventory/items', {
      name: 'Tomatoes',
      category: 'Produce',
      count_unit: 'kg',
      par_level: 10,
      current_stock: 0,
      storage_location: 'Walk-In',
      is_perishable: true,
      abc_category: 'A',
    });
    itemId = data.id;
    expect(itemId).toBeTruthy();
  });

  test('low-stock alert appears when stock is 0', async ({ page }) => {
    // Login and go to dashboard
    const { data: login } = await axios.post(`${API}/api/auth/login`, {
      email: tenant.ownerEmail,
      password: tenant.ownerPassword,
    });
    await page.goto('/');
    // Set auth token in localStorage
    await page.evaluate((token) => localStorage.setItem('accessToken', token), login.access_token);
    await page.goto('/inventory');
    await expect(page.locator('[data-testid=low-stock-badge]')).toBeVisible({ timeout: 10000 });
  });

  test('create supplier and purchase order', async () => {
    const supplier = await post('/api/inventory/suppliers', {
      name: 'Fresh Farms',
      email: 'orders@freshfarms.test',
      phone: '+15555550100',
    });
    supplierId = supplier.id;

    const po = await post('/api/inventory/purchase-orders', {
      supplier_id: supplierId,
      expected_delivery_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      line_items: [{ inventory_item_id: itemId, quantity: 20, unit_price: 1.5 }],
    });
    poId = po.id;

    await post(`/api/inventory/purchase-orders/${poId}/send`, {});
    const { data: sent } = await axios.get(`${API}/api/inventory/purchase-orders/${poId}`, {
      headers: { Authorization: `Bearer ${tenant.ownerToken}` },
    });
    expect(sent.status).toBe('sent');
  });

  test('receive delivery confirms PO and increases stock', async () => {
    const receipt = await post('/api/inventory/receipts', {
      purchase_order_id: poId,
      line_items: [{ inventory_item_id: itemId, received_quantity: 20, actual_unit_price: 1.5, condition: 'good' }],
    });
    await post(`/api/inventory/receipts/${receipt.id}/confirm`, {});

    const { data: item } = await axios.get(`${API}/api/inventory/items/${itemId}`, {
      headers: { Authorization: `Bearer ${tenant.ownerToken}` },
    });
    expect(item.current_stock).toBe(20);
  });

  test('log waste decreases stock and creates movement', async () => {
    await post('/api/inventory/waste', {
      inventory_item_id: itemId,
      quantity: 3,
      unit: 'kg',
      reason: 'Spoilage',
    });

    const { data: item } = await axios.get(`${API}/api/inventory/items/${itemId}`, {
      headers: { Authorization: `Bearer ${tenant.ownerToken}` },
    });
    expect(item.current_stock).toBe(17);

    const { data: movements } = await axios.get(
      `${API}/api/inventory/movements?item_id=${itemId}&type=waste`,
      { headers: { Authorization: `Bearer ${tenant.ownerToken}` } }
    );
    expect(movements.items.length).toBeGreaterThanOrEqual(1);
  });

  test('create and reconcile DSR', async () => {
    const dsr = await post('/api/finance/daily-sales-reports', {
      date: new Date().toISOString().split('T')[0],
      gross_sales: 2500.0,
      discounts: 50.0,
      tax_collected: 212.5,
      payment_breakdown: { cash: 800, card: 1650, upi: 0 },
    });

    const { data: reconciled } = await axios.patch(
      `${API}/api/finance/daily-sales-reports/${dsr.id}/reconcile`,
      { actual_cash: 800 },
      { headers: { Authorization: `Bearer ${tenant.ownerToken}` } }
    );
    expect(reconciled.status).toBe('RECONCILED');
  });
});
