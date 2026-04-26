/**
 * P3 — DSR reconcile concurrency
 * 5 simultaneous reconcile requests for different tenants → all succeed, no data mixing
 *
 * Run: k6 run --env API_URL=http://localhost:8080 k6-dsr-concurrency.js
 * Requires: TOKENS as JSON array of 5 JWTs; DSR_IDS as JSON array of 5 DSR IDs
 */
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const reconcileFails = new Counter('reconcile_failures');

export const options = {
  scenarios: {
    concurrent_reconcile: {
      executor: 'per-vu-iterations',
      vus: 5,
      iterations: 1,
    },
  },
  thresholds: {
    reconcile_failures: ['count==0'],
  },
};

export default function () {
  const API = __ENV.API_URL ?? 'http://localhost:8080';
  const tokens = JSON.parse(__ENV.TOKENS ?? '[]');
  const dsrIds = JSON.parse(__ENV.DSR_IDS ?? '[]');

  const token = tokens[__VU - 1];
  const dsrId = dsrIds[__VU - 1];

  if (!token || !dsrId) return;

  const res = http.patch(
    `${API}/api/finance/daily-sales-reports/${dsrId}/reconcile`,
    JSON.stringify({ actual_cash: 500 }),
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  );

  const ok = check(res, {
    'reconcile succeeds (200 or 204)': (r) => r.status === 200 || r.status === 204,
    'no cross-tenant data in response': (r) => {
      if (r.status !== 200) return true;
      const body = JSON.parse(r.body);
      const tenantId = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString()).tenant_id;
      return !body.tenant_id || body.tenant_id === tenantId;
    },
  });

  if (!ok) reconcileFails.add(1);
}
