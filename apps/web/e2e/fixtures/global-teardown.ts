import { FullConfig } from '@playwright/test';

export default async function globalTeardown(_config: FullConfig): Promise<void> {
  // Tenant cleanup is per-test — nothing global to tear down
  console.log('[E2E teardown] Done');
}
