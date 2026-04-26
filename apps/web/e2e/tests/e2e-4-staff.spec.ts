import { test, expect } from '@playwright/test';
import axios from 'axios';
import { seedTestTenant, type TestTenant } from '../fixtures/seed';
import { addDays, format } from 'date-fns';

const API = process.env.PLAYWRIGHT_API_URL ?? 'http://localhost:8080';

test.describe('E2E-4: Staff Scheduling Flow', () => {
  let tenant: TestTenant;
  let employee1Id: string;
  let employee2Id: string;
  let employee3Id: string;
  let shiftId: string;

  test.beforeAll(async () => {
    tenant = await seedTestTenant('staff');
  });

  const auth = () => ({ headers: { Authorization: `Bearer ${tenant.ownerToken}` } });

  test('create 3 employees', async () => {
    const [e1, e2, e3] = await Promise.all([
      axios.post(`${API}/api/staff/employees`, { name: 'Alice Smith', email: 'alice@e2e.test', role: 'LINE_COOK', hourly_rate: 18 }, auth()),
      axios.post(`${API}/api/staff/employees`, { name: 'Bob Jones', email: 'bob@e2e.test', role: 'SERVER', hourly_rate: 15 }, auth()),
      axios.post(`${API}/api/staff/employees`, { name: 'Carol Wu', email: 'carol@e2e.test', role: 'BARTENDER', hourly_rate: 20 }, auth()),
    ]);
    employee1Id = e1.data.id;
    employee2Id = e2.data.id;
    employee3Id = e3.data.id;
    expect(employee1Id).toBeTruthy();
  });

  test('create and publish shifts for next week', async () => {
    const nextWeek = format(addDays(new Date(), 1), 'yyyy-MM-dd');
    const { data: shift } = await axios.post(
      `${API}/api/staff/shifts`,
      {
        employee_id: employee1Id,
        start_time: `${nextWeek}T09:00:00Z`,
        end_time: `${nextWeek}T17:00:00Z`,
        role: 'LINE_COOK',
        station: 'Grill',
      },
      auth()
    );
    shiftId = shift.id;

    await axios.post(`${API}/api/staff/shifts/publish`, { shift_ids: [shiftId] }, auth());

    // Verify notification created
    const { data: notifications } = await axios.get(`${API}/api/notifications?type=shift_published`, auth());
    expect(notifications.items.length).toBeGreaterThanOrEqual(1);
  });

  test('clock in and clock out records attendance with total_hours', async () => {
    // Create today's shift for clock-in test
    const today = format(new Date(), 'yyyy-MM-dd');
    const { data: todayShift } = await axios.post(
      `${API}/api/staff/shifts`,
      {
        employee_id: employee2Id,
        start_time: `${today}T08:00:00Z`,
        end_time: `${today}T16:00:00Z`,
        role: 'SERVER',
      },
      auth()
    );

    const empAuth = () => ({
      headers: { Authorization: `Bearer ${tenant.ownerToken}` },
    });

    await axios.post(`${API}/api/staff/attendance/clock-in`, { shift_id: todayShift.id }, empAuth());

    const { data: status } = await axios.get(`${API}/api/staff/attendance/status`, empAuth());
    expect(status.is_clocked_in).toBe(true);

    await axios.post(`${API}/api/staff/attendance/clock-out`, {}, empAuth());

    const { data: record } = await axios.get(
      `${API}/api/staff/attendance?employee_id=${employee2Id}&date=${today}`,
      auth()
    );
    const attendance = record.items?.[0];
    expect(attendance).toBeDefined();
    expect(attendance.total_hours).toBeGreaterThan(0);
  });

  test('task with requires_photo is completed with photo URL and completed_at set', async () => {
    const { data: task } = await axios.post(
      `${API}/api/staff/tasks`,
      {
        title: 'Opening cooler check',
        assigned_to: employee3Id,
        requires_photo: true,
        priority: 'HIGH',
        due_time: new Date().toISOString(),
      },
      auth()
    );

    await axios.patch(
      `${API}/api/staff/tasks/${task.id}/complete`,
      { photo_url: 'https://storage.example.com/photo.jpg' },
      auth()
    );

    const { data: completed } = await axios.get(`${API}/api/staff/tasks/${task.id}`, auth());
    expect(completed.completed_at).toBeTruthy();
    expect(completed.photo_url).toBeTruthy();
  });
});
