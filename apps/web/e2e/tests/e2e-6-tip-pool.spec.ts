import { test, expect } from '@playwright/test';
import axios from 'axios';
import { seedTestTenant, type TestTenant } from '../fixtures/seed';
import { format } from 'date-fns';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8080';

test.describe('E2E-6: Tip Pool Distribution', () => {
  let tenant: TestTenant;
  const today = format(new Date(), 'yyyy-MM-dd');
  const employeeIds: string[] = [];

  test.beforeAll(async () => {
    tenant = await seedTestTenant('tip');
  });

  const auth = () => ({ headers: { Authorization: `Bearer ${tenant.ownerToken}` } });

  test('create 3 employees with clock-in hours', async () => {
    for (let i = 1; i <= 3; i++) {
      const { data: emp } = await axios.post(
        `${API}/api/staff/employees`,
        { name: `Tip Tester ${i}`, email: `tiptester${i}@e2e.test`, role: 'SERVER', hourly_rate: 15 },
        auth()
      );
      employeeIds.push(emp.id);

      await axios.post(
        `${API}/api/staff/shifts`,
        {
          employee_id: emp.id,
          start_time: `${today}T10:00:00Z`,
          end_time: `${today}T18:00:00Z`,
          role: 'SERVER',
        },
        auth()
      );
    }
    expect(employeeIds.length).toBe(3);
  });

  test('tip pool calculates, payout sum equals total tips, then distributes', async () => {
    const totalTips = 300.0;

    const { data: pool } = await axios.post(
      `${API}/api/staff/tip-pools`,
      {
        date: today,
        total_tips: totalTips,
        distribution_rule: 'BY_HOURS',
        employee_ids: employeeIds,
      },
      auth()
    );
    expect(pool.id).toBeTruthy();

    const { data: calculated } = await axios.post(
      `${API}/api/staff/tip-pools/${pool.id}/calculate`,
      {},
      auth()
    );

    const payoutSum = calculated.distributions.reduce(
      (sum: number, d: any) => sum + d.amount,
      0
    );
    expect(Math.abs(payoutSum - totalTips)).toBeLessThanOrEqual(0.02); // Allow 2-cent rounding error

    await axios.post(`${API}/api/staff/tip-pools/${pool.id}/distribute`, {}, auth());

    const { data: final } = await axios.get(`${API}/api/staff/tip-pools/${pool.id}`, auth());
    expect(final.status).toBe('DISTRIBUTED');
  });
});
