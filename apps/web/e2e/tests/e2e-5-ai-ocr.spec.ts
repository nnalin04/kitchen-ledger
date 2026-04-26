import { test, expect } from '@playwright/test';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { seedTestTenant, type TestTenant } from '../fixtures/seed';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8080';

// Fixture: a minimal JPEG created from a base64 encoded 1×1 white pixel
// In CI, replace with a real test notebook scan JPEG in e2e/fixtures/
const TEST_IMAGE_PATH = path.join(__dirname, '../fixtures/test-notebook.jpg');

function ensureTestImage(): void {
  if (!fs.existsSync(TEST_IMAGE_PATH)) {
    // 1×1 white JPEG — enough to trigger the API flow (OCR will return empty result)
    const minimalJpeg = Buffer.from(
      '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
      'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
      'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
      'MjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUEA/8QAHhAA' +
      'AgIDAQEBAAAAAAAAAAAAAQIDBAUREiH/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAR' +
      'AAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKnFJaHFqDVqMuS3MjaSdQfJpJ83N3' +
      '3lPZSlQ/9k=',
      'base64'
    );
    fs.writeFileSync(TEST_IMAGE_PATH, minimalJpeg);
  }
}

test.describe('E2E-5: AI OCR Flow', () => {
  let tenant: TestTenant;

  test.beforeAll(async () => {
    tenant = await seedTestTenant('ocr');
    ensureTestImage();
  });

  const auth = () => ({ headers: { Authorization: `Bearer ${tenant.ownerToken}` } });

  test('notebook image upload creates an OCR job', async () => {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('image', fs.createReadStream(TEST_IMAGE_PATH), 'notebook.jpg');
    form.append('context_type', 'inventory');
    form.append('target_date', new Date().toISOString().split('T')[0]);

    const { data: job } = await axios.post(`${API}/api/ai/ocr/notebook`, form, {
      headers: { ...auth().headers, ...form.getHeaders() },
    });

    expect(job.job_id).toBeTruthy();
    expect(job.estimated_seconds).toBeGreaterThan(0);
  });

  test('OCR job reaches completed or failed status within 30 seconds', async () => {
    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('image', fs.createReadStream(TEST_IMAGE_PATH), 'notebook.jpg');
    form.append('context_type', 'inventory');
    form.append('target_date', new Date().toISOString().split('T')[0]);

    const { data: job } = await axios.post(`${API}/api/ai/ocr/notebook`, form, {
      headers: { ...auth().headers, ...form.getHeaders() },
    });

    let finalStatus: string | undefined;
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const { data: status } = await axios.get(`${API}/api/ai/ocr/notebook/${job.job_id}`, auth());
      if (status.status === 'completed' || status.status === 'failed') {
        finalStatus = status.status;
        break;
      }
    }

    expect(['completed', 'failed']).toContain(finalStatus);
  });
});
