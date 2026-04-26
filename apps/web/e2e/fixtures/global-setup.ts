import { FullConfig } from '@playwright/test';
import axios from 'axios';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8080';

async function waitForStack(maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const { data } = await axios.get(`${API}/health`, { timeout: 2000 });
      if (data.status === 'ok') return;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Stack not healthy after ${maxAttempts * 2}s — abort E2E run`);
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  console.log('[E2E setup] Waiting for full stack to be healthy...');
  await waitForStack();
  console.log('[E2E setup] Stack healthy — proceeding with tests');
}
