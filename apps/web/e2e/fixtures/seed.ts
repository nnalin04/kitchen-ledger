import axios from 'axios';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8080';

export interface TestTenant {
  tenantId: string;
  tenantName: string;
  ownerEmail: string;
  ownerPassword: string;
  ownerToken: string;
  managerEmail: string;
  managerPassword: string;
}

export async function seedTestTenant(suffix = ''): Promise<TestTenant> {
  const ts = Date.now() + suffix;
  const tenantName = `E2E Restaurant ${ts}`;
  const ownerEmail = `owner-${ts}@e2e.test`;
  const ownerPassword = 'TestPass123!';

  const { data: reg } = await axios.post(`${API}/api/auth/register`, {
    restaurant_name: tenantName,
    email: ownerEmail,
    password: ownerPassword,
    timezone: 'America/New_York',
    currency: 'USD',
  });

  const { data: login } = await axios.post(`${API}/api/auth/login`, {
    email: ownerEmail,
    password: ownerPassword,
  });

  const ownerToken = login.access_token;
  const tenantId = login.tenant.id;

  const managerEmail = `manager-${ts}@e2e.test`;
  const managerPassword = 'TestPass123!';

  await axios.post(
    `${API}/api/auth/users/invite`,
    { email: managerEmail, role: 'MANAGER', name: 'Test Manager' },
    { headers: { Authorization: `Bearer ${ownerToken}` } }
  );

  return {
    tenantId,
    tenantName,
    ownerEmail,
    ownerPassword,
    ownerToken,
    managerEmail,
    managerPassword,
  };
}

export async function cleanupTenant(tenantId: string, ownerToken: string): Promise<void> {
  try {
    await axios.delete(`/api/auth/tenant`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
  } catch {
    // Best effort cleanup — test isolation via unique tenants is primary mechanism
  }
}
