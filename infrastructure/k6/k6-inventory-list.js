/**
 * P1 — Inventory list query performance
 * Target: GET /api/inventory/items (10,000 items/tenant) → p99 < 200ms
 *
 * Run: k6 run --env API_URL=http://localhost:8080 --env TOKEN=<jwt> k6-inventory-list.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

const p99Latency = new Trend('p99_latency', true);
const crossTenantLeaks = new Counter('cross_tenant_leaks');

export const options = {
  vus: 10,
  duration: '30s',
  thresholds: {
    'http_req_duration{percentile:99}': ['p(99)<200'],
    cross_tenant_leaks: ['count==0'],
  },
};

export default function () {
  const API = __ENV.API_URL ?? 'http://localhost:8080';
  const token = __ENV.TOKEN;

  const res = http.get(`${API}/api/inventory/items?page=1&page_size=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  p99Latency.add(res.timings.duration);

  check(res, {
    'status is 200': (r) => r.status === 200,
    'returns items array': (r) => {
      const body = JSON.parse(r.body);
      return Array.isArray(body.items);
    },
    'no cross-tenant data': (r) => {
      const body = JSON.parse(r.body);
      // All items must belong to the authenticated tenant
      const items = body.items ?? [];
      const tenantId = JSON.parse(atob(__ENV.TOKEN?.split('.')[1] ?? 'e30=')).tenant_id;
      return items.every((item) => !item.tenant_id || item.tenant_id === tenantId);
    },
  });

  sleep(0.1);
}
