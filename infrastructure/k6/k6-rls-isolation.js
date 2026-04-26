/**
 * P2 — RLS isolation under concurrent load
 * 10 tenants, concurrent requests → verify no cross-tenant row returned
 *
 * Run: k6 run --env API_URL=http://localhost:8080 k6-rls-isolation.js
 * Requires: TOKENS env var as JSON array of 10 JWT tokens for different tenants
 */
import http from 'k6/http';
import { check, fail } from 'k6';
import { Counter } from 'k6/metrics';

const crossTenantLeaks = new Counter('cross_tenant_leaks');

export const options = {
  scenarios: {
    concurrent_tenants: {
      executor: 'per-vu-iterations',
      vus: 10,
      iterations: 20,
    },
  },
  thresholds: {
    cross_tenant_leaks: ['count==0'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const API = __ENV.API_URL ?? 'http://localhost:8080';
  const tokens = JSON.parse(__ENV.TOKENS ?? '[]');

  if (tokens.length === 0) {
    fail('TOKENS env var must be a JSON array of 10 JWT strings');
  }

  const token = tokens[__VU % tokens.length];
  const tenantId = JSON.parse(
    Buffer.from(token.split('.')[1], 'base64').toString('utf-8')
  ).tenant_id;

  const res = http.get(`${API}/api/inventory/items?page_size=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  check(res, {
    'status 200': (r) => r.status === 200,
  });

  if (res.status === 200) {
    const body = JSON.parse(res.body);
    for (const item of body.items ?? []) {
      if (item.tenant_id && item.tenant_id !== tenantId) {
        crossTenantLeaks.add(1);
        console.error(`CROSS-TENANT LEAK: expected ${tenantId} got ${item.tenant_id}`);
      }
    }
  }
}
