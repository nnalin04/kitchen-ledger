import { pool } from '../db';

function msUntilNext(hour: number, minute: number, dayOfWeek?: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hour, minute);

  if (dayOfWeek !== undefined) {
    // 0=Sun,1=Mon,...,6=Sat
    const daysAhead = (dayOfWeek - now.getDay() + 7) % 7 || 7;
    next.setDate(now.getDate() + daysAhead);
    next.setHours(hour, minute, 0, 0);
  } else if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next.getTime() - now.getTime();
}

async function buildDailyDigest(tenantId: string): Promise<{
  unread: number;
  critical: number;
  summary: string;
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { rows: [row] } = await pool.query<{ unread: string; critical: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE read_at IS NULL) AS unread,
       COUNT(*) FILTER (WHERE priority = 'critical' AND read_at IS NULL) AS critical
     FROM notifications
     WHERE tenant_id = $1 AND created_at >= $2`,
    [tenantId, since]
  );

  const unread   = Number(row?.unread   ?? 0);
  const critical = Number(row?.critical ?? 0);
  const summary  = critical > 0
    ? `${unread} unread notifications (${critical} critical) in the last 24 hours.`
    : `${unread} unread notifications in the last 24 hours.`;

  return { unread, critical, summary };
}

async function buildWeeklySummary(tenantId: string): Promise<{
  total: number;
  critical: number;
  summary: string;
}> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { rows: [row] } = await pool.query<{ total: string; critical: string }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE priority = 'critical') AS critical
     FROM notifications
     WHERE tenant_id = $1 AND created_at >= $2`,
    [tenantId, since]
  );

  const total    = Number(row?.total    ?? 0);
  const critical = Number(row?.critical ?? 0);
  const summary  = `${total} notifications this week (${critical} critical).`;

  return { total, critical, summary };
}

async function persistDigest(tenantId: string, title: string, body: string): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (tenant_id, user_id, type, priority, title, body, data, channels)
     VALUES ($1, NULL, 'digest', 'informational', $2, $3, '{}', '["push"]')`,
    [tenantId, title, body]
  );
}

async function runDailyDigest(): Promise<void> {
  try {
    const { rows: tenants } = await pool.query<{ tenant_id: string }>(
      `SELECT DISTINCT tenant_id::text FROM notifications WHERE created_at >= NOW() - INTERVAL '7 days'`
    );

    for (const { tenant_id } of tenants) {
      const digest = await buildDailyDigest(tenant_id);
      if (digest.unread > 0) {
        await persistDigest(tenant_id, 'Daily Digest', digest.summary);
      }
    }
  } catch (err) {
    console.error('[digest-scheduler] daily digest failed:', err);
  }
}

async function runWeeklySummary(): Promise<void> {
  try {
    const { rows: tenants } = await pool.query<{ tenant_id: string }>(
      `SELECT DISTINCT tenant_id::text FROM notifications WHERE created_at >= NOW() - INTERVAL '30 days'`
    );

    for (const { tenant_id } of tenants) {
      const summary = await buildWeeklySummary(tenant_id);
      await persistDigest(tenant_id, 'Weekly Summary', summary.summary);
    }
  } catch (err) {
    console.error('[digest-scheduler] weekly summary failed:', err);
  }
}

function scheduleDaily(): void {
  const delay = msUntilNext(7, 0);
  setTimeout(() => {
    void runDailyDigest();
    setInterval(() => void runDailyDigest(), 24 * 60 * 60 * 1000);
  }, delay);
}

function scheduleWeekly(): void {
  // Monday = 1
  const delay = msUntilNext(9, 0, 1);
  setTimeout(() => {
    void runWeeklySummary();
    setInterval(() => void runWeeklySummary(), 7 * 24 * 60 * 60 * 1000);
  }, delay);
}

export function startDigestScheduler(): void {
  scheduleDaily();
  scheduleWeekly();
  console.info('[digest-scheduler] daily digest scheduled at 07:00, weekly summary at Mon 09:00');
}

export { buildDailyDigest, buildWeeklySummary };
