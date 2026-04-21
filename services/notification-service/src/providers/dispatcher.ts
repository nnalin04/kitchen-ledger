import { pool } from '../db';
import { sendEmail, welcomeEmail, invitationEmail, passwordResetEmail } from './resend-email.provider';
import { sendPush } from './expo-push.provider';
import { getUsersByRole } from '../clients/auth.client';
import { config } from '../config';

export interface NotificationRecord {
  tenantId: string;
  userId: string | null;
  type: string;
  priority: 'critical' | 'important' | 'informational';
  title: string;
  body: string;
  data: Record<string, unknown>;
  channels: string[];
}

export interface FanOutOptions {
  eventId: string;
  type: string;
  priority: 'critical' | 'important' | 'informational';
  title: string;
  body: string;
  data: Record<string, unknown>;
  /** Roles to target — defaults to owner + manager for critical alerts */
  roles?: string[];
}

export interface FanOutMetrics {
  attempted: number;
  sent: number;
  skipped: number;
}

/**
 * Fan-out a push notification to all active owners/managers of a tenant.
 * Idempotent: duplicate deliveries of the same (eventId, userId) pair are
 * detected via notification_dedup and silently skipped.
 */
export async function dispatchToTenantRecipients(
  tenantId: string,
  opts: FanOutOptions
): Promise<FanOutMetrics> {
  const roles = opts.roles ?? ['owner', 'manager'];
  const recipients = await getUsersByRole(tenantId, roles);

  const metrics: FanOutMetrics = { attempted: recipients.length, sent: 0, skipped: 0 };

  for (const user of recipients) {
    // Idempotency check — skip if this (eventId, userId) was already processed
    const { rows: existing } = await pool.query<{ event_id: string }>(
      `SELECT event_id FROM notification_dedup WHERE event_id = $1 AND user_id = $2`,
      [opts.eventId, user.id]
    );
    if (existing.length > 0) {
      metrics.skipped++;
      continue;
    }

    // Persist notification record
    await pool.query(
      `INSERT INTO notifications
         (tenant_id, user_id, type, priority, title, body, data, channels)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, user.id, opts.type, opts.priority,
       opts.title, opts.body, JSON.stringify(opts.data), JSON.stringify(['push'])]
    );

    // Record dedup entry before sending (prevents double-send on push failure + retry)
    await pool.query(
      `INSERT INTO notification_dedup (event_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [opts.eventId, user.id]
    );

    // Send push (non-fatal — token may not exist)
    await sendPush({
      userId: user.id,
      title: opts.title,
      body: opts.body,
      data: opts.data,
      priority: opts.priority,
    }).catch(err => console.error('Fan-out push failed', { userId: user.id, err }));

    metrics.sent++;
  }

  console.info('fan-out dispatch', { eventId: opts.eventId, type: opts.type, tenantId, ...metrics });
  return metrics;
}

/**
 * Persists a notification record and dispatches it to all configured channels.
 */
export async function dispatch(n: NotificationRecord): Promise<void> {
  // 1. Store in DB
  await pool.query(
    `INSERT INTO notifications
       (tenant_id, user_id, type, priority, title, body, data, channels)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [n.tenantId, n.userId, n.type, n.priority,
     n.title, n.body, JSON.stringify(n.data), JSON.stringify(n.channels)]
  );

  // 2. Push notification
  if (n.channels.includes('push') && n.userId) {
    await sendPush({
      userId: n.userId,
      title: n.title,
      body: n.body,
      data: n.data,
      priority: n.priority,
    }).catch(err => console.error('Push dispatch failed:', err));
  }
}

/**
 * Dispatches the welcome email for a newly registered user.
 */
export async function dispatchWelcomeEmail(payload: {
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
  tenantName: string;
}): Promise<void> {
  const tmpl = welcomeEmail({
    fullName: payload.fullName,
    restaurantName: payload.tenantName,
    appUrl: config.APP_URL,
  });

  await sendEmail({ ...tmpl, to: payload.email });

  // Also store a notification record
  await dispatch({
    tenantId: payload.tenantId,
    userId: payload.userId,
    type: 'auth.user.registered',
    priority: 'informational',
    title: tmpl.subject,
    body: 'Welcome to KitchenLedger! Your account is ready.',
    data: { email: payload.email },
    channels: ['email'],
  });
}

/**
 * Dispatches the invitation email for an invited user.
 * Accepts a fully-formed inviteUrl (fetched from auth-service at send time)
 * rather than a raw token, so the token is never stored in RabbitMQ or outbox.
 */
export async function dispatchInvitationEmail(payload: {
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: string;
  inviteUrl: string;
  tenantName: string;
}): Promise<void> {
  const tmpl = invitationEmail({
    fullName: payload.fullName,
    restaurantName: payload.tenantName,
    inviteUrl: payload.inviteUrl,
    role: payload.role,
  });

  await sendEmail({ ...tmpl, to: payload.email });

  await dispatch({
    tenantId: payload.tenantId,
    userId: payload.userId,
    type: 'auth.user.invited',
    priority: 'important',
    title: 'Invitation sent',
    body: `Invitation email sent to ${payload.email}`,
    data: { email: payload.email, role: payload.role },
    channels: ['email'],
  });
}

/**
 * Dispatches a password-reset email. The reset token is used to construct the
 * URL but is never logged at INFO level (security).
 */
export async function dispatchPasswordResetEmail(payload: {
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
  resetToken: string;
}): Promise<void> {
  const resetUrl = `${config.APP_URL}/reset-password?token=${payload.resetToken}`;
  const tmpl = passwordResetEmail({ fullName: payload.fullName, resetUrl });

  await sendEmail({ ...tmpl, to: payload.email });

  await dispatch({
    tenantId: payload.tenantId,
    userId:   payload.userId,
    type:    'auth.password.reset.requested',
    priority: 'important',
    title:    tmpl.subject,
    body:     'A password reset link has been sent to your email.',
    data:     { email: payload.email }, // reset_token deliberately excluded from stored record
    channels: ['email'],
  });
}
