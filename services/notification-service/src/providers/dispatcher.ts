import { pool } from '../db';
import { sendEmail, welcomeEmail, invitationEmail } from './resend-email.provider';
import { sendPush } from './expo-push.provider';
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
 */
export async function dispatchInvitationEmail(payload: {
  userId: string;
  tenantId: string;
  email: string;
  fullName: string;
  role: string;
  inviteToken: string;
  tenantName: string;
}): Promise<void> {
  const tmpl = invitationEmail({
    fullName: payload.fullName,
    restaurantName: payload.tenantName,
    inviteToken: payload.inviteToken,
    role: payload.role,
    appUrl: config.APP_URL,
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
