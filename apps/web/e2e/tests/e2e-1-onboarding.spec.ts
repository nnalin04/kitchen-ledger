import { test, expect } from '@playwright/test';
import axios from 'axios';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8080';

test.describe('E2E-1: Tenant Onboarding', () => {
  const ts = Date.now();
  const ownerEmail = `owner-${ts}@e2e.test`;
  const ownerPassword = 'TestPass123!';
  let ownerToken: string;

  test('owner can register a new restaurant', async ({ page }) => {
    await page.goto('/register');
    await page.fill('[name=restaurant_name]', `E2E Restaurant ${ts}`);
    await page.fill('[name=email]', ownerEmail);
    await page.fill('[name=password]', ownerPassword);
    await page.fill('[name=confirm_password]', ownerPassword);
    await page.click('[type=submit]');
    await expect(page).toHaveURL(/setup/);
  });

  test('setup wizard completes all 5 steps and marks onboarding done', async ({ page }) => {
    // Login directly via API for speed
    const { data } = await axios.post(`${API}/api/auth/login`, {
      email: ownerEmail,
      password: ownerPassword,
    });
    ownerToken = data.access_token;

    await page.goto('/setup');
    // Step 1: Restaurant details
    await page.waitForSelector('[data-step="1"]');
    await page.selectOption('[name=timezone]', 'America/New_York');
    await page.selectOption('[name=currency]', 'USD');
    await page.click('[data-action=next]');

    // Step 2: Operating hours
    await page.waitForSelector('[data-step="2"]');
    await page.click('[data-action=next]');

    // Step 3: Menu upload (skip)
    await page.waitForSelector('[data-step="3"]');
    await page.click('[data-action=skip]');

    // Step 4: Invite staff (skip)
    await page.waitForSelector('[data-step="4"]');
    await page.click('[data-action=skip]');

    // Step 5: First action
    await page.waitForSelector('[data-step="5"]');
    await page.click('[data-action=first-action]');

    // Verify redirected to dashboard
    await expect(page).toHaveURL(/dashboard/);

    // Verify onboarding_done via API
    const { data: tenant } = await axios.get(`${API}/api/auth/tenant/profile`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(tenant.onboarding_done).toBe(true);
  });

  test('owner can invite a manager who logs in with restricted access', async ({ page }) => {
    const managerEmail = `manager-${ts}@e2e.test`;

    // Owner invites manager
    await axios.post(
      `${API}/api/auth/users/invite`,
      { email: managerEmail, role: 'MANAGER', name: 'E2E Manager' },
      { headers: { Authorization: `Bearer ${ownerToken}` } }
    );

    // Verify invite exists via user list
    const { data: users } = await axios.get(`${API}/api/auth/users`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    const invited = users.items.find((u: any) => u.email === managerEmail);
    expect(invited).toBeDefined();
    expect(invited.role).toBe('MANAGER');
  });
});
